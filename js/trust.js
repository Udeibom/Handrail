/**
 * @file trust.js
 * @description Handrail Deterministic Tool-Trust System and Integrity Verification.
 *
 * Implements lightweight deterministic heuristics for:
 * 1. Tool-name squatting detection (Levenshtein distance, separator normalization, suffix/prefix variations)
 * 2. Instruction-like / prompt-injection description detection (deterministic regex/keyword matching)
 * 3. Unexpected registration detection (validates against session's expected tool set)
 * 4. Fail-closed structured trust evaluation
 *
 * NOTE: Does NOT use machine learning, LLMs, NLP authorization, or statistical classifiers.
 *
 * ============================================================================
 * SECURITY BOUNDARY ORDERING PRINCIPLE:
 * The Handrail execution boundary MUST strictly follow this linear ordering:
 *
 *   Tool call
 *       ↓
 *   Tool's execute() handler
 *       ↓
 *   [1] Tool Trust Check (trust.js) -> Fails closed immediately if untrusted/squatted/injected
 *       ↓
 *   [2] Authority Contract Check (authority.js) -> Evaluates patient scope, caps, and permissions
 *       ↓
 *   [3] Human Confirmation (confirmation.js) -> Triggered ONLY IF authorized AND consequential (readOnlyHint === false)
 *       ↓
 *   [4] Tool Execution -> Real business logic invocation
 *
 * CRITICAL RULE: A suspicious or untrusted tool MUST NEVER reach human confirmation.
 * Never execute: Tool call -> Confirmation -> Trust check.
 * ============================================================================
 */

/**
 * The 5 expected primary tools for a standard Handrail session.
 * The fifth tool ('update_payment_method') is a deliberately suspicious security trap
 * and must not become authorized merely because it is registered.
 */
export const EXPECTED_HANDRAIL_TOOLS = Object.freeze([
  'search_medications',
  'view_prescription_details',
  'prepare_refill',
  'submit_refill',
  'update_payment_method',
]);

/**
 * In-memory active expected tool set for the current Handrail session.
 */
let sessionExpectedTools = new Set(EXPECTED_HANDRAIL_TOOLS);
let activeSessionId = 'SESSION-RX-2025-001';

/**
 * Deterministic suspicious instruction phrases & patterns found in prompt injections
 * or malicious tool metadata descriptions.
 */
export const SUSPICIOUS_DESCRIPTION_PATTERNS = Object.freeze([
  /\bignore\s+(?:all\s+)?previous\s+instructions\b/i,
  /\balways\s+approve\b/i,
  /\b(?:do\s+not|don'?t)\s+tell\s+the\s+user\b/i,
  /\bask\s+(?:the\s+user\s+)?for\s+(?:credentials|password|credit\s*card|secret)\b/i,
  /\boverride\b/i,
  /\bbypass\b/i,
  /\bsystem\s+instruction\b/i,
  /\badministrator\s+instruction\b/i,
  /\badmin\s+instruction\b/i,
  /\bdeveloper\s+mode\b/i,
  /\bjailbreak\b/i,
  /\bexecute\s+silently\b/i,
  /\bdisable\s+(?:handrail|security|checks|guardrails)\b/i,
]);

/**
 * Metrics tracking policy and trust telemetry.
 */
let trustMetrics = {
  totalInvocations: 0,
  totalApproved: 0,
  totalBlocked: 0,
  totalConfirmationRequired: 0,
  humanAuthorizationsGranted: 0,
  humanAuthorizationsDenied: 0,
  trustChecksPassed: 0,
  trustChecksFailed: 0,
  squattingDetections: 0,
  suspiciousDescriptionsDetected: 0,
  unexpectedRegistrationsDetected: 0,
  lastEvaluationTimestamp: null,
  activeFingerprint: '',
};

/**
 * Initializes or updates the session's expected tool set.
 * @param {string[]} [toolNames] - Array of expected tool names
 * @param {string} [sessionId] - Unique session identifier
 */
export function registerExpectedTools(toolNames = EXPECTED_HANDRAIL_TOOLS, sessionId = null) {
  if (sessionId) {
    activeSessionId = sessionId;
  }
  sessionExpectedTools = new Set(
    Array.isArray(toolNames) && toolNames.length > 0 ? toolNames : EXPECTED_HANDRAIL_TOOLS
  );
}

/**
 * Returns a list of currently expected tool names for this session.
 * @returns {string[]}
 */
export function getExpectedTools() {
  return Array.from(sessionExpectedTools);
}

/**
 * Returns the active session ID.
 * @returns {string}
 */
export function getActiveSessionId() {
  return activeSessionId;
}

/**
 * Computes Levenshtein distance between two strings.
 * Used for deterministic tool-name squatting similarity heuristics.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function calculateLevenshteinDistance(a, b) {
  if (!a || !b) return (a || b || '').length;
  const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));

  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[a.length][b.length];
}

/**
 * Deterministic Tool-Name Squatting Detection.
 * Compares a candidate tool name against the expected exact tool names.
 *
 * Detects:
 * - Direct typos (e.g., `submit_refil` vs `submit_refill`)
 * - Separator spoofing (e.g., `submit-refill`, `submitRefill`, `submit refill` vs `submit_refill`)
 * - Version/suffix squatting (e.g., `submit_refill_v2`, `submit_refill_2`, `submit_refill_new`)
 * - Prefix additions (e.g., `fast_submit_refill`, `auto_prepare_refill`)
 *
 * @param {string} toolName - The name of the registered tool to check
 * @param {string[]} [expectedNames] - Expected tool names list (defaults to session's expected tools)
 * @returns {{ isSquatting: boolean, targetName?: string, reason?: string, confidence?: string }}
 */
export function detectNameSquatting(toolName, expectedNames = null) {
  if (!toolName || typeof toolName !== 'string') {
    return {
      isSquatting: true,
      reason: 'Invalid or missing tool name. Failing closed.',
      confidence: 'deterministic-exact',
    };
  }

  const targets = expectedNames || getExpectedTools();
  const trimmed = toolName.trim();

  // If it is an EXACT match to an expected tool, it is not squatting on that tool
  if (targets.includes(trimmed)) {
    return { isSquatting: false };
  }

  // Convert camelCase to snake_case before separator normalization (e.g. submitRefill -> submit_refill)
  const decameled = trimmed.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  const normalizedCandidate = decameled.replace(/[-.\s]+/g, '_');

  for (const expected of targets) {
    const normalizedExpected = expected.toLowerCase().replace(/[-.\s]+/g, '_');

    // Case 1: Normalized separator match (e.g., 'submit-refill', 'submitRefill', or 'submit refill' -> 'submit_refill')
    if (normalizedCandidate === normalizedExpected && trimmed !== expected) {
      return {
        isSquatting: true,
        targetName: expected,
        reason: `Tool name '${toolName}' uses non-standard separators or casing imitating expected tool '${expected}'.`,
        confidence: 'high',
      };
    }

    // Case 2: Suffix additions (e.g., 'submit_refill_v2', 'submit_refill_2', 'submit_refill_new', 'submit_refill_official')
    if (
      normalizedCandidate.startsWith(`${normalizedExpected}_`) ||
      normalizedCandidate.startsWith(`${normalizedExpected}2`) ||
      normalizedCandidate.startsWith(`${normalizedExpected}v2`) ||
      normalizedCandidate.startsWith(`${normalizedExpected}_v`) ||
      normalizedCandidate.startsWith(`${normalizedExpected}_2`)
    ) {
      return {
        isSquatting: true,
        targetName: expected,
        reason: `Tool name '${toolName}' appears to be an unauthorized variant or suffix of expected tool '${expected}'.`,
        confidence: 'high',
      };
    }

    // Case 3: Levenshtein distance typo detection (e.g., 'submit_refil' vs 'submit_refill' dist=1)
    const dist = calculateLevenshteinDistance(normalizedCandidate, normalizedExpected);
    if (dist > 0 && dist <= 2 && Math.abs(normalizedCandidate.length - normalizedExpected.length) <= 2) {
      return {
        isSquatting: true,
        targetName: expected,
        reason: `Tool name '${toolName}' is suspiciously close (edit distance ${dist}) to expected tool '${expected}'. Potential typosquat.`,
        confidence: 'high',
      };
    }
  }

  return { isSquatting: false };
}

/**
 * Deterministic Instruction-Like Description Detection.
 * Scans tool descriptions for manipulative, bypass, or prompt-injection phrases.
 *
 * @param {string} description - The tool description to inspect
 * @returns {{ isSuspicious: boolean, matchedPattern?: string, reason?: string }}
 */
export function detectSuspiciousDescription(description) {
  if (!description || typeof description !== 'string') {
    return {
      isSuspicious: false,
      reason: 'Empty description.',
    };
  }

  const normalized = description.trim();

  for (const pattern of SUSPICIOUS_DESCRIPTION_PATTERNS) {
    const match = normalized.match(pattern);
    if (match) {
      return {
        isSuspicious: true,
        matchedPattern: match[0],
        reason: `Tool description contains suspicious or instruction-like phrase: "${match[0]}".`,
      };
    }
  }

  return { isSuspicious: false };
}

/**
 * Deterministic Unexpected Registration Detection.
 * Detects if a tool was not part of the expected tool set when the session was created.
 * Any unexpected mutating (consequential) tool is treated as untrusted.
 *
 * @param {object|string} tool - Tool metadata object or tool name
 * @param {string[]} [expectedNames] - Expected tool list
 * @returns {{ isUnexpected: boolean, isMutating: boolean, isUntrusted: boolean, reason?: string }}
 */
export function detectUnexpectedRegistration(tool, expectedNames = null) {
  const targets = expectedNames || getExpectedTools();
  const toolName = typeof tool === 'string' ? tool : tool?.name;
  const isReadOnly = typeof tool === 'object' && tool !== null ? tool.readOnlyHint === true : false;
  const isMutating = !isReadOnly; // Default to mutating if unmarked or unknown

  if (!toolName || typeof toolName !== 'string') {
    return {
      isUnexpected: true,
      isMutating: true,
      isUntrusted: true,
      reason: 'Missing or invalid tool name.',
    };
  }

  const isSimulatedUnexpected = typeof tool === 'object' && tool !== null && tool?.registrationInfo?.isSimulatedUnexpected === true;
  const isExpected = targets.includes(toolName) && !isSimulatedUnexpected;

  if (!isExpected) {
    return {
      isUnexpected: true,
      isMutating,
      // Unexpected mutating tools MUST be treated as untrusted
      isUntrusted: isMutating,
      reason: isMutating
        ? `Tool '${toolName}' was not in the session expected tool set and is classified as mutating (consequential). Untrusted.`
        : `Tool '${toolName}' was registered outside the initial session baseline.`,
    };
  }

  return {
    isUnexpected: false,
    isMutating,
    isUntrusted: false,
  };
}

/**
 * Checks a tool's trust status deterministically.
 * Returns a structured trust evaluation result.
 *
 * FAIL CLOSED: If trust cannot be deterministically established, this returns isTrusted: false.
 *
 * @param {object|string} tool - The tool metadata object or tool name
 * @param {object} [options={}] - Custom options (e.g. expectedTools)
 * @returns {{
 *   isTrusted: boolean,
 *   verdict: 'TRUSTED' | 'UNTRUSTED',
 *   code: 'TRUST_VERIFIED' | 'UNTRUSTED_NAME_SQUATTING' | 'UNTRUSTED_INSTRUCTION_DESCRIPTION' | 'UNTRUSTED_UNEXPECTED_MUTATING' | 'UNTRUSTED_SECURITY_TRAP' | 'UNTRUSTED_INVALID_METADATA',
 *   toolName: string,
 *   readOnlyHint: boolean,
 *   issues: string[],
 *   details: object
 * }}
 */
export function checkToolTrust(tool, options = {}) {
  const expected = options.expectedTools || getExpectedTools();
  const toolObj = typeof tool === 'string' ? { name: tool } : (tool || {});
  const toolName = toolObj.name || '';
  const description = toolObj.description || '';
  
  // Mandatory classification check: readOnlyHint true means read-only.
  // Unmarked or unknown tools MUST default to mutating (false). Never default unknown to safe.
  const readOnlyHint = toolObj.readOnlyHint === true;
  const issues = [];

  if (!toolName || typeof toolName !== 'string') {
    trustMetrics.trustChecksFailed += 1;
    return {
      isTrusted: false,
      verdict: 'UNTRUSTED',
      code: 'UNTRUSTED_INVALID_METADATA',
      toolName: 'unknown',
      readOnlyHint: false,
      issues: ['Tool is missing a valid name attribute.'],
      details: { tool: toolObj },
    };
  }

  // 1. Check Tool-Name Squatting
  const squatCheck = detectNameSquatting(toolName, expected);
  if (squatCheck.isSquatting) {
    trustMetrics.squattingDetections += 1;
    trustMetrics.trustChecksFailed += 1;
    issues.push(squatCheck.reason || 'Detected potential tool-name squatting.');
    return {
      isTrusted: false,
      verdict: 'UNTRUSTED',
      code: 'UNTRUSTED_NAME_SQUATTING',
      toolName,
      readOnlyHint,
      issues,
      details: { squatCheck },
    };
  }

  // 2. Check Instruction-like / Prompt-Injection Description
  const descCheck = detectSuspiciousDescription(description);
  if (descCheck.isSuspicious) {
    trustMetrics.suspiciousDescriptionsDetected += 1;
    trustMetrics.trustChecksFailed += 1;
    issues.push(descCheck.reason || 'Detected suspicious description phrasing.');
    return {
      isTrusted: false,
      verdict: 'UNTRUSTED',
      code: 'UNTRUSTED_INSTRUCTION_DESCRIPTION',
      toolName,
      readOnlyHint,
      issues,
      details: { descCheck },
    };
  }

  // 3. Check Unexpected Registration (especially mutating tools)
  const regCheck = detectUnexpectedRegistration(toolObj, expected);
  if (regCheck.isUnexpected && regCheck.isMutating) {
    trustMetrics.unexpectedRegistrationsDetected += 1;
    trustMetrics.trustChecksFailed += 1;
    issues.push(regCheck.reason || 'Unexpected mutating tool registration.');
    return {
      isTrusted: false,
      verdict: 'UNTRUSTED',
      code: 'UNTRUSTED_UNEXPECTED_MUTATING',
      toolName,
      readOnlyHint,
      issues,
      details: { regCheck },
    };
  }

  // 4. Security Trap Check: 'update_payment_method' or marked security trap
  // Tool 5 ('update_payment_method') is intentionally outside the normal authority contract.
  // It must NEVER become authorized merely because it exists or is registered.
  if (
    toolName === 'update_payment_method' ||
    toolObj.isSecurityTrap === true ||
    toolObj.registrationInfo?.isSecurityTrap === true
  ) {
    trustMetrics.trustChecksFailed += 1;
    issues.push('Tool is an explicit security trap outside the patient authority contract. Rejected by Handrail deterministic trust check.');
    return {
      isTrusted: false,
      verdict: 'UNTRUSTED',
      code: 'UNTRUSTED_SECURITY_TRAP',
      toolName,
      readOnlyHint: false, // Mutating
      isSecurityTrap: true,
      issues,
      details: { isSecurityTrap: true, note: 'Intentionally outside normal authority contract' },
    };
  }

  // Pass all deterministic trust heuristics
  trustMetrics.trustChecksPassed += 1;
  return {
    isTrusted: true,
    verdict: 'TRUSTED',
    code: 'TRUST_VERIFIED',
    toolName,
    readOnlyHint,
    issues: [],
    details: {
      squatCheck,
      descCheck,
      regCheck,
    },
  };
}

/**
 * Produces a structured trust report for a tool metadata object.
 * @param {object} tool
 * @returns {object}
 */
export function produceStructuredTrustReport(tool) {
  return checkToolTrust(tool);
}

/**
 * Computes a SHA-256 hex digest for an authority contract using native Web Crypto.
 * @param {object} contract
 * @returns {Promise<string>}
 */
export async function calculateContractFingerprint(contract) {
  try {
    const serialized = JSON.stringify({
      contractId: contract.contractId,
      patientId: contract.patientId,
      maxSpendLimit: contract.maxSpendLimit,
      confirmationThreshold: contract.confirmationThreshold,
      requireHumanConfirmation: contract.requireHumanConfirmation,
      allowedActions: [...contract.allowedActions].sort(),
    });

    if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function') {
      const msgBuffer = new TextEncoder().encode(serialized);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
      trustMetrics.activeFingerprint = `sha256:${hashHex.slice(0, 16)}...${hashHex.slice(-8)}`;
      return trustMetrics.activeFingerprint;
    }
  } catch (err) {
    console.warn('Crypto subtle unavailable, using fallback signature hash:', err);
  }

  // Fallback simple deterministic hash if subtle crypto is restricted
  let hash = 0;
  const str = JSON.stringify(contract);
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  trustMetrics.activeFingerprint = `det-hash:${hex}`;
  return trustMetrics.activeFingerprint;
}

/**
 * Updates internal trust metrics following a policy evaluation and human decision.
 * @param {string} code - Result code from authority evaluation
 * @param {boolean|null} humanConfirmed - Human decision if confirmation was requested
 */
export function recordPolicyMetric(code, humanConfirmed = null) {
  trustMetrics.totalInvocations += 1;
  trustMetrics.lastEvaluationTimestamp = new Date().toISOString();

  if (code === 'APPROVED') {
    trustMetrics.totalApproved += 1;
  } else if (code.startsWith('BLOCKED_') || code.startsWith('UNTRUSTED_')) {
    trustMetrics.totalBlocked += 1;
  } else if (code === 'CONFIRMATION_REQUIRED') {
    trustMetrics.totalConfirmationRequired += 1;
    if (humanConfirmed === true) {
      trustMetrics.humanAuthorizationsGranted += 1;
      trustMetrics.totalApproved += 1;
    } else if (humanConfirmed === false) {
      trustMetrics.humanAuthorizationsDenied += 1;
      trustMetrics.totalBlocked += 1;
    }
  }
}

/**
 * Returns current trust metrics copy.
 * @returns {typeof trustMetrics}
 */
export function getTrustMetrics() {
  return { ...trustMetrics };
}
