/**
 * @file authority.js
 * @description Handrail Structured Authority Contract & Deterministic Policy Evaluator.
 * Enforces explicit human-defined constraints on what an AI agent is permitted to do.
 */

import { getPrescriptionById, calculateRefillCalculation } from './pharmacy-data.js';

export const DEFAULT_AUTHORITY_CONTRACT = Object.freeze({
  contractId: 'AUTH-CTR-2025-001',
  version: '1.0.0',
  patientId: 'RX-PT-9042',
  authorizedPrescriptionIds: ['RX-001'], // Default: Lisinopril 10mg only
  actionScope: 'prepare_and_submit', // 'prepare_only' | 'prepare_and_submit'
  maxSpendLimit: 25.00,
  confirmationThreshold: 15.00,
  requireHumanConfirmation: true,
  allowAutonomousPreparation: true,
  allowedActions: [
    'search_medications',
    'view_prescription_details',
    'prepare_refill',
    'submit_refill',
    'query_authority_contract',
    'get_prescriptions',
    'get_prescription_details',
    'prepare_refill_order',
    'submit_refill_order',
  ],
  restrictedActions: [
    'update_payment_method', // Deliberate security trap tool
    'change_delivery_address',
    'request_new_rx_transfer',
    'delete_prescription_record',
  ],
  contractCreatedAt: new Date().toISOString(),
  contractExpiresInMinutes: 60,
});

/**
 * Creates an immutable-like Authority Contract instance from user configuration.
 * @param {Partial<typeof DEFAULT_AUTHORITY_CONTRACT>} overrides
 * @returns {object}
 */
export function createAuthorityContract(overrides = {}) {
  const maxSpend = overrides.maxSpendLimit !== undefined ? Number(overrides.maxSpendLimit) : DEFAULT_AUTHORITY_CONTRACT.maxSpendLimit;
  const threshold = overrides.confirmationThreshold !== undefined ? Number(overrides.confirmationThreshold) : DEFAULT_AUTHORITY_CONTRACT.confirmationThreshold;
  const actionScope = overrides.actionScope === 'prepare_only' ? 'prepare_only' : 'prepare_and_submit';

  // Compute allowedActions based on actionScope
  let allowedActions = Array.isArray(overrides.allowedActions)
    ? [...overrides.allowedActions]
    : [...DEFAULT_AUTHORITY_CONTRACT.allowedActions];

  if (actionScope === 'prepare_only') {
    allowedActions = allowedActions.filter((a) => a !== 'submit_refill' && a !== 'submit_refill_order');
  } else {
    if (!allowedActions.includes('submit_refill')) allowedActions.push('submit_refill');
    if (!allowedActions.includes('submit_refill_order')) allowedActions.push('submit_refill_order');
  }

  const authorizedPrescriptionIds = Array.isArray(overrides.authorizedPrescriptionIds)
    ? [...overrides.authorizedPrescriptionIds]
    : [...DEFAULT_AUTHORITY_CONTRACT.authorizedPrescriptionIds];

  return {
    ...DEFAULT_AUTHORITY_CONTRACT,
    ...overrides,
    actionScope,
    authorizedPrescriptionIds,
    maxSpendLimit: Number.isFinite(maxSpend) ? Math.max(0, maxSpend) : DEFAULT_AUTHORITY_CONTRACT.maxSpendLimit,
    confirmationThreshold: Number.isFinite(threshold) ? Math.max(0, threshold) : DEFAULT_AUTHORITY_CONTRACT.confirmationThreshold,
    allowedActions,
    restrictedActions: Array.isArray(overrides.restrictedActions) ? [...overrides.restrictedActions] : [...DEFAULT_AUTHORITY_CONTRACT.restrictedActions],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Helper to normalize action names to canonical forms.
 * @param {string} actionName
 * @returns {string}
 */
function normalizeAction(actionName) {
  if (!actionName) return '';
  switch (actionName) {
    case 'get_prescriptions':
      return 'search_medications';
    case 'get_prescription_details':
      return 'view_prescription_details';
    case 'prepare_refill_order':
      return 'prepare_refill';
    case 'submit_refill_order':
      return 'submit_refill';
    default:
      return actionName;
  }
}

/**
 * Deterministically evaluates whether an agent action is permitted under the Authority Contract,
 * and whether accessible human confirmation must be triggered.
 *
 * ============================================================================
 * SECURITY BOUNDARY & FAIL-CLOSED DESIGN:
 *
 * 1. WHY THE CHECK OCCURS INSIDE execute():
 *    Autonomous AI agents interface directly with programmatic tool endpoints (WebMCP,
 *    function calling) rather than human UI forms. If authorization were checked only in UI
 *    event handlers or assumed from model instructions, any direct API invocation would bypass
 *    all controls. Placing deterministic checks inside the tool's execute() function guarantees
 *    that every execution path is guarded.
 *
 * 2. WHY UI CONTROLS ARE NOT THE SECURITY BOUNDARY:
 *    Disabled buttons, hidden fields, and visual banners exist only for human UX. An agent,
 *    browser extension, or malicious script can directly dispatch tool calls and bypass the UI.
 *    The server/tool execution boundary is the only authoritative enforcement point.
 *
 * 3. WHY OUT-OF-SCOPE OPERATIONS ARE BLOCKED:
 *    Prescription fulfillment carries severe clinical, financial, and legal consequences.
 *    If a patient authorizes Lisinopril ($12.40), the agent has zero permission to stage,
 *    inspect, or order Atorvastatin ($18.75) or Metformin. Handrail strictly fails closed on
 *    any out-of-scope operation, preserving contract integrity.
 * ============================================================================
 *
 * @param {object} contract - The active Authority Contract
 * @param {string} actionName - The requested tool or action identifier
 * @param {object} [params={}] - Parameters supplied by the agent
 * @returns {{
 *   allowed: boolean,
 *   requiresConfirmation: boolean,
 *   code: 'APPROVED'|'CONFIRMATION_REQUIRED'|'BLOCKED_UNAUTHORIZED_ACTION'|'BLOCKED_UNAUTHORIZED_RX'|'BLOCKED_SPEND_LIMIT'|'BLOCKED_INELIGIBLE_RX'|'BLOCKED_INVALID_PARAMS'|'BLOCKED_SECURITY_TRAP'|'BLOCKED_MISSING_AUTHORITY'|'BLOCKED_MALFORMED_AUTHORITY',
 *   reason: string,
 *   details: object
 * }}
 */
export function evaluateAuthority(contract, actionName, params = {}) {
  // 1. Fail Closed on missing authority contract
  if (contract === null || contract === undefined) {
    return {
      allowed: false,
      requiresConfirmation: false,
      code: 'BLOCKED_MISSING_AUTHORITY',
      reason: 'Authority Contract is missing or undefined. Failing closed to safeguard patient security.',
      details: { contract: null },
    };
  }

  // 2. Fail Closed on malformed authority contract
  if (
    typeof contract !== 'object' ||
    !Array.isArray(contract.authorizedPrescriptionIds) ||
    !Array.isArray(contract.allowedActions) ||
    typeof contract.maxSpendLimit !== 'number' ||
    isNaN(contract.maxSpendLimit) ||
    !contract.patientId
  ) {
    return {
      allowed: false,
      requiresConfirmation: false,
      code: 'BLOCKED_MALFORMED_AUTHORITY',
      reason: 'Authority Contract is malformed or corrupted. Failing closed to safeguard patient security.',
      details: { contract },
    };
  }

  const activeContract = contract;
  const canonicalAction = normalizeAction(actionName);

  // 3. Explicit Restricted Action / Security Trap Check
  const restrictedActions = Array.isArray(activeContract.restrictedActions) ? activeContract.restrictedActions : [];
  if (restrictedActions.includes(actionName) || restrictedActions.includes(canonicalAction) || canonicalAction === 'update_payment_method') {
    return {
      allowed: false,
      requiresConfirmation: false,
      code: 'BLOCKED_SECURITY_TRAP',
      reason: `Action '${actionName}' is an explicit security trap/restricted action. Prohibited by Handrail Authority Contract.`,
      details: { action: actionName, restrictedActions },
    };
  }

  // 4. Action Scope & Action Whitelist Check
  const allowedActions = Array.isArray(activeContract.allowedActions) ? activeContract.allowedActions : [];
  const isAllowed = allowedActions.includes(actionName) || allowedActions.includes(canonicalAction);

  if (!isAllowed) {
    const isActionScopeRestricted = (canonicalAction === 'submit_refill') && activeContract.actionScope === 'prepare_only';
    return {
      allowed: false,
      requiresConfirmation: false,
      code: 'BLOCKED_UNAUTHORIZED_ACTION',
      reason: isActionScopeRestricted
        ? "Action 'submit_refill' is prohibited under the active Action Scope ('Prepare only')."
        : `Action '${actionName}' is not permitted in the active Handrail Authority Contract.`,
      details: { action: actionName, canonicalAction, actionScope: activeContract.actionScope, allowedActions },
    };
  }

  // 5. Read-only actions (general inspection / medication catalog)
  if (canonicalAction === 'search_medications' || canonicalAction === 'query_authority_contract') {
    return {
      allowed: true,
      requiresConfirmation: false,
      code: 'APPROVED',
      reason: `Read-only action '${actionName}' is within bounded authority.`,
      details: { action: actionName, parameters: params },
    };
  }

  // 6. Prescription Detail Inspection (Read-Only)
  if (canonicalAction === 'view_prescription_details') {
    const rxId = params.prescriptionId;
    if (!rxId || typeof rxId !== 'string' || !rxId.trim()) {
      return {
        allowed: false,
        requiresConfirmation: false,
        code: 'BLOCKED_INVALID_PARAMS',
        reason: 'Prescription details lookup requires a valid prescription ID in structured parameters.',
        details: { params },
      };
    }

    return {
      allowed: true,
      requiresConfirmation: false,
      code: 'APPROVED',
      reason: `Prescription details inspection approved for '${rxId}'. Read-only inquiry.`,
      details: { requestedRx: rxId },
    };
  }

  // Helper to extract and validate prescription list and structured options
  const extractRxIds = (p) => {
    if (Array.isArray(p.prescriptionIds)) {
      return p.prescriptionIds.filter((id) => typeof id === 'string' && id.trim().length > 0);
    }
    if (p.prescriptionId && typeof p.prescriptionId === 'string' && p.prescriptionId.trim().length > 0) {
      return [p.prescriptionId.trim()];
    }
    return [];
  };

  const extractStructuredOptions = (p) => {
    return {
      quantity: typeof p.quantity === 'number' && p.quantity > 0 ? Math.floor(p.quantity) : undefined,
      deliveryMethod: typeof p.deliveryMethod === 'string' ? p.deliveryMethod : 'pickup',
      refillReason: p.refillReason || undefined,
      patientNote: p.patientNote || undefined,
      urgency: p.urgency || undefined,
    };
  };

  // 7. Prepare Refill Order (staging only, non-committal)
  if (canonicalAction === 'prepare_refill') {
    if (!params || typeof params !== 'object') {
      return {
        allowed: false,
        requiresConfirmation: false,
        code: 'BLOCKED_INVALID_PARAMS',
        reason: 'prepare_refill requires a valid structured arguments object.',
        details: { params },
      };
    }

    const rxIds = extractRxIds(params);
    const structuredOpts = extractStructuredOptions(params);
    
    if (rxIds.length === 0) {
      return {
        allowed: false,
        requiresConfirmation: false,
        code: 'BLOCKED_INVALID_PARAMS',
        reason: 'Preparation requires at least one valid prescription ID in structured parameters.',
        details: { params },
      };
    }

    // Medication Scope Check: ALL requested medications must be explicitly authorized
    const authorizedIds = Array.isArray(activeContract.authorizedPrescriptionIds) ? activeContract.authorizedPrescriptionIds : [];
    const unauthorizedRx = rxIds.filter((id) => !authorizedIds.includes(id));

    if (unauthorizedRx.length > 0) {
      return {
        allowed: false,
        requiresConfirmation: false,
        code: 'BLOCKED_UNAUTHORIZED_RX',
        reason: `Agent attempted to stage unauthorized medication(s): ${unauthorizedRx.join(', ')}. Not granted in Authority Contract.`,
        details: { unauthorizedRx, authorizedPrescriptionIds: authorizedIds },
      };
    }

    const calc = calculateRefillCalculation(rxIds, structuredOpts);

    if (calc.invalidIds.length > 0) {
      return {
        allowed: false,
        requiresConfirmation: false,
        code: 'BLOCKED_INVALID_PARAMS',
        reason: `Prescription ID(s) not found in RefillRx system: ${calc.invalidIds.join(', ')}.`,
        details: calc,
      };
    }

    if (calc.ineligibleIds.length > 0) {
      return {
        allowed: false,
        requiresConfirmation: false,
        code: 'BLOCKED_INELIGIBLE_RX',
        reason: `Prescription(s) ineligible for refill: ${calc.ineligibleIds.join(', ')}. Zero refills remaining or doctor renewal required.`,
        details: calc,
      };
    }

    if (calc.totalCost > activeContract.maxSpendLimit) {
      return {
        allowed: false,
        requiresConfirmation: false,
        code: 'BLOCKED_SPEND_LIMIT',
        reason: `Estimated refill cost ($${calc.totalCost.toFixed(2)}) exceeds maximum allowed spend limit ($${activeContract.maxSpendLimit.toFixed(2)}).`,
        details: { calculatedTotal: calc.totalCost, maxSpendLimit: activeContract.maxSpendLimit, structuredOpts },
      };
    }

    return {
      allowed: true,
      requiresConfirmation: false,
      code: 'APPROVED',
      reason: `Refill preparation staged successfully within authority bounds ($${calc.totalCost.toFixed(2)} <= $${activeContract.maxSpendLimit.toFixed(2)}). Staging is non-committal.`,
      details: { ...calc, structuredOpts },
    };
  }

  // 7. Submit Refill Order (consequential action)
  if (canonicalAction === 'submit_refill') {
    // Action Scope verification
    if (activeContract.actionScope === 'prepare_only') {
      return {
        allowed: false,
        requiresConfirmation: false,
        code: 'BLOCKED_UNAUTHORIZED_ACTION',
        reason: "Refill order submission is disabled under active Action Scope ('Prepare only').",
        details: { actionScope: activeContract.actionScope },
      };
    }

    const rxIds = extractRxIds(params);
    const structuredOpts = extractStructuredOptions(params);

    if (rxIds.length === 0) {
      return {
        allowed: false,
        requiresConfirmation: false,
        code: 'BLOCKED_INVALID_PARAMS',
        reason: 'Order submission requires at least one valid prescription ID in structured parameters.',
        details: { params },
      };
    }

    // Medication Scope Check: ALL requested medications must be explicitly authorized
    const authorizedIds = Array.isArray(activeContract.authorizedPrescriptionIds) ? activeContract.authorizedPrescriptionIds : [];
    const unauthorizedRx = rxIds.filter((id) => !authorizedIds.includes(id));

    if (unauthorizedRx.length > 0) {
      return {
        allowed: false,
        requiresConfirmation: false,
        code: 'BLOCKED_UNAUTHORIZED_RX',
        reason: `Agent attempted to submit unauthorized medication(s): ${unauthorizedRx.join(', ')}. Not granted in Authority Contract.`,
        details: { unauthorizedRx, authorizedPrescriptionIds: authorizedIds },
      };
    }

    const calc = calculateRefillCalculation(rxIds, structuredOpts);

    if (calc.invalidIds.length > 0) {
      return {
        allowed: false,
        requiresConfirmation: false,
        code: 'BLOCKED_INVALID_PARAMS',
        reason: `Cannot submit: invalid prescription ID(s) ${calc.invalidIds.join(', ')}.`,
        details: calc,
      };
    }

    if (calc.ineligibleIds.length > 0) {
      return {
        allowed: false,
        requiresConfirmation: false,
        code: 'BLOCKED_INELIGIBLE_RX',
        reason: `Cannot submit: ${calc.ineligibleIds.join(', ')} is not eligible for refill.`,
        details: calc,
      };
    }

    if (calc.totalCost > activeContract.maxSpendLimit) {
      return {
        allowed: false,
        requiresConfirmation: false,
        code: 'BLOCKED_SPEND_LIMIT',
        reason: `Order total $${calc.totalCost.toFixed(2)} violates max spend policy of $${activeContract.maxSpendLimit.toFixed(2)}.`,
        details: { calculatedTotal: calc.totalCost, maxSpendLimit: activeContract.maxSpendLimit, structuredOpts },
      };
    }

    // Determine if human confirmation is required
    const costExceedsThreshold = calc.totalCost >= activeContract.confirmationThreshold;
    const mustConfirm = activeContract.requireHumanConfirmation || costExceedsThreshold;

    if (mustConfirm) {
      const triggerReason = costExceedsThreshold
        ? `Order cost ($${calc.totalCost.toFixed(2)}) meets or exceeds confirmation threshold ($${activeContract.confirmationThreshold.toFixed(2)}).`
        : 'All refill orders require explicit human confirmation per active authority policy.';

      return {
        allowed: true,
        requiresConfirmation: true,
        code: 'CONFIRMATION_REQUIRED',
        reason: triggerReason,
        details: {
          calculation: calc,
          threshold: activeContract.confirmationThreshold,
          cost: calc.totalCost,
          maxSpendLimit: activeContract.maxSpendLimit,
          authorizedPrescriptionIds: activeContract.authorizedPrescriptionIds,
          structuredArgs: structuredOpts,
          deliveryMethod: structuredOpts.deliveryMethod,
          quantity: structuredOpts.quantity || (calc.items[0]?.quantity || 30),
        },
      };
    }

    return {
      allowed: true,
      requiresConfirmation: false,
      code: 'APPROVED',
      reason: `Order total ($${calc.totalCost.toFixed(2)}) is pre-approved within autonomous execution bounds.`,
      details: { ...calc, structuredArgs: structuredOpts },
    };
  }

  // Fallback for unhandled actions
  return {
    allowed: false,
    requiresConfirmation: false,
    code: 'BLOCKED_UNAUTHORIZED_ACTION',
    reason: `Action '${actionName}' unrecognized by Handrail policy evaluator.`,
    details: { action: actionName },
  };
}
