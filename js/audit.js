/**
 * @file audit.js
 * @description Accessible Structured Audit Trail and Plain-Language Receipt Engine for Handrail.
 *
 * Implements a session audit log with IndexedDB persistence, capturing all agent invocations,
 * Handrail deterministic policy decisions, human consent interactions, and results.
 *
 * Explicitly distinguishes:
 * 1. What the user authorized (Authority contract state)
 * 2. What the agent requested (Tool name + arguments)
 * 3. What Handrail decided (Policy decision + rule + code)
 * 4. What actually happened (Execution action / block / denial)
 * 5. The result (Confirmation / error / safety guarantee)
 */

import { persistAuditEntry, loadAuditEntries, clearAuditEntries } from './audit-db.js';

/**
 * @typedef {'allowed' | 'confirmed' | 'denied' | 'blocked' | 'executed'} AuditDecision
 *
 * @typedef {Object} AuditEntry
 * @property {string} id - Unique log ID (e.g., 'AUDIT-0001')
 * @property {string} timestamp - ISO 8601 timestamp string
 * @property {string} formattedTime - Localized time string (HH:MM:SS)
 * @property {string} toolName - The invoked WebMCP tool name
 * @property {string} action - High-level action label
 * @property {AuditDecision} decision - 'allowed' | 'confirmed' | 'denied' | 'blocked' | 'executed'
 * @property {string} reason - Plain-language policy or outcome reason
 * @property {object} arguments - Arguments requested by the AI agent
 * @property {object} userAuthorized - Snapshot of the active Authority Contract scope
 * @property {object} decisionDetails - Detailed policy evaluation metadata
 * @property {string} whatHappened - Plain-language explanation of what occurred
 * @property {object} result - Structured execution outcome or error payload
 */

let auditLogs = [];
let nextLogId = 1;
let activeAuditFilter = 'all';

/**
 * Formats a concise summary of what the user authorized under the active contract.
 * @param {object} authSnapshot
 * @returns {string}
 */
export function formatAuthorizedSummary(authSnapshot) {
  if (!authSnapshot) return 'Default security contract active.';

  const meds = Array.isArray(authSnapshot.authorizedPrescriptionIds) && authSnapshot.authorizedPrescriptionIds.length > 0
    ? authSnapshot.authorizedPrescriptionIds.join(', ')
    : 'None';

  const spend = Number.isFinite(authSnapshot.maxSpendLimit)
    ? `$${authSnapshot.maxSpendLimit.toFixed(2)}`
    : '$25.00';

  const scopeLabel = authSnapshot.actionScope === 'prepare_only'
    ? 'Prepare only'
    : 'Prepare & submit';

  const confirmThreshold = Number.isFinite(authSnapshot.confirmationThreshold)
    ? `$${authSnapshot.confirmationThreshold.toFixed(2)}`
    : '$15.00';

  return `Authorized Meds: [${meds}] • Action Scope: ${scopeLabel} • Max Spend: ${spend} • Confirmation Threshold: ${confirmThreshold}`;
}

/**
 * Formats a concise summary of what the AI agent requested.
 * @param {string} toolName
 * @param {object} args
 * @returns {string}
 */
export function formatAgentRequestSummary(toolName, args = {}) {
  if (toolName === 'get_prescriptions') {
    return 'Requested list of all active prescriptions on file (read-only)';
  }
  if (toolName === 'get_prescription_details') {
    return `Requested clinical details for prescription ID: ${args.prescriptionId || 'unspecified'}`;
  }
  if (toolName === 'prepare_refill_order') {
    const ids = Array.isArray(args.prescriptionIds) ? args.prescriptionIds.join(', ') : (args.prescriptionId || 'unspecified');
    return `Requested staging and cost calculation for refill item(s): [${ids}]`;
  }
  if (toolName === 'submit_refill_order') {
    const ids = Array.isArray(args.prescriptionIds) ? args.prescriptionIds.join(', ') : (args.prescriptionId || 'unspecified');
    return `Requested finalized refill submission for item(s): [${ids}]`;
  }
  if (toolName === 'query_authority_contract') {
    return 'Requested inspection of active Handrail Authority Contract parameters';
  }
  return `Requested tool '${toolName}' with arguments: ${JSON.stringify(args)}`;
}

/**
 * Logs a new event to the in-memory Handrail audit trail.
 *
 * @param {{
 *   toolName: string,
 *   action?: string,
 *   decision: AuditDecision,
 *   reason: string,
 *   arguments?: object,
 *   userAuthorized?: object,
 *   decisionDetails?: object,
 *   whatHappened?: string,
 *   result?: object
 * }} eventData
 * @returns {AuditEntry} The created audit record
 */
export function logAuditEvent(eventData) {
  const timestamp = new Date();
  const id = `AUDIT-${String(nextLogId++).padStart(4, '0')}`;

  const validDecisions = ['allowed', 'confirmed', 'denied', 'blocked', 'executed'];
  const decision = validDecisions.includes(eventData.decision) ? eventData.decision : 'blocked';

  // Ensure security failures are NEVER recorded as allowed or executed
  let sanitizedDecision = decision;
  if (eventData.result && eventData.result.status === 'error' && (sanitizedDecision === 'allowed' || sanitizedDecision === 'executed')) {
    sanitizedDecision = 'blocked';
  }

  const toolName = eventData.toolName || 'unknown_tool';
  const action = eventData.action || toolName;
  const args = eventData.arguments || {};
  const userAuthorized = eventData.userAuthorized || null;
  const decisionDetails = eventData.decisionDetails || {};
  const whatHappened = eventData.whatHappened || (
    sanitizedDecision === 'blocked' ? 'Handrail blocked the tool invocation prior to execution.' :
    sanitizedDecision === 'denied' ? 'Human user refused authorization in confirmation dialog.' :
    sanitizedDecision === 'executed' ? 'Action executed and verified by RefillRx system.' :
    sanitizedDecision === 'confirmed' ? 'Human user confirmed and authorized action.' :
    'Read-only operation completed safely.'
  );

  const entry = {
    id,
    timestamp: timestamp.toISOString(),
    formattedTime: timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    toolName,
    action,
    decision: sanitizedDecision,
    reason: eventData.reason || 'No reason provided.',
    arguments: args,
    userAuthorized,
    decisionDetails,
    whatHappened,
    result: eventData.result || { status: sanitizedDecision },
  };

  auditLogs.unshift(entry); // newest first

  // Cap logs at 200 entries to prevent memory overflow
  if (auditLogs.length > 200) {
    auditLogs.pop();
  }

  // Persist to IndexedDB (fire and forget - don't block UI)
  persistAuditEntry(entry).catch(err => {
    console.error('[Audit] Failed to persist entry to IndexedDB:', err);
  });

  // Update UI components
  updateAuditLogUI();
  renderReceiptUI(entry);

  if (typeof document !== 'undefined') {
    const announcer = document.getElementById('accessibility-announcer');
    if (announcer) {
      const decisionText = entry.decision === 'executed' ? 'executed' : entry.decision === 'blocked' ? 'blocked' : entry.decision;
      const summary = `Action ${decisionText}. ${entry.reason || ''}`;
      announcer.setAttribute('aria-live', 'assertive');
      announcer.textContent = '';
      setTimeout(() => { announcer.textContent = summary; }, 50);
      setTimeout(() => { announcer.setAttribute('aria-live', 'polite'); }, 2000);
    }
  }

  return entry;
}

/**
 * Returns a copy of all audit log records.
 * @returns {Array<AuditEntry>}
 */
export function getAuditLogs() {
  return [...auditLogs];
}

/**
 * Returns the latest consequential or blocked transaction receipt.
 * @returns {AuditEntry|null}
 */
export function getLatestReceipt() {
  const receiptEligible = auditLogs.find((log) =>
    ['executed', 'blocked', 'denied', 'confirmed'].includes(log.decision)
  );
  return receiptEligible || auditLogs[0] || null;
}

export const getLatestReceiptData = getLatestReceipt;

/**
 * Sets the active audit filter ('all', 'blocked', 'executed', 'confirmed', 'denied', 'allowed')
 * @param {string} filter
 */
export function setAuditFilter(filter) {
  activeAuditFilter = filter;
  updateAuditLogUI();
}

/**
 * Clears the in-memory audit log and IndexedDB.
 */
export async function clearAuditLogs() {
  auditLogs = [];
  nextLogId = 1;
  updateAuditLogUI();
  try {
    await clearAuditEntries();
  } catch (err) {
    console.error('[Audit] Failed to clear IndexedDB entries:', err);
  }
}

/**
 * Rehydrates the in-memory audit log from IndexedDB.
 * Called on page load to restore persisted entries.
 * @returns {Promise<number>} Number of entries rehydrated
 */
export async function rehydrateAuditLogs() {
  try {
    const entries = await loadAuditEntries();
    if (entries.length > 0) {
      auditLogs = entries;
      // Update nextLogId to be higher than any existing ID
      const maxId = entries.reduce((max, entry) => {
        const match = entry.id?.match(/^AUDIT-(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          return num > max ? num : max;
        }
        return max;
      }, 0);
      nextLogId = maxId + 1;
      updateAuditLogUI();
    }
    return entries.length;
  } catch (err) {
    console.error('[Audit] Failed to rehydrate from IndexedDB:', err);
    return 0;
  }
}

/**
 * Exports the audit log as a formatted JSON string.
 * @returns {string}
 */
export function exportAuditLogsAsJSON() {
  return JSON.stringify(auditLogs, null, 2);
}

/**
 * Returns accessible visual badge metadata for a given decision.
 * Does not rely on color alone (includes explicit text and symbol/icon).
 * @param {AuditDecision} decision
 * @returns {{ className: string, tagText: string, iconSymbol: string, ariaLabel: string }}
 */
export function getDecisionBadgeMeta(decision) {
  switch (decision) {
    case 'executed':
      return {
        className: 'badge-decision-executed',
        tagText: '[EXECUTED]',
        iconSymbol: '✓',
        ariaLabel: 'Decision: Action Executed Successfully',
      };
    case 'confirmed':
      return {
        className: 'badge-decision-confirmed',
        tagText: '[CONFIRMED]',
        iconSymbol: '🛡️',
        ariaLabel: 'Decision: Confirmed by Human User',
      };
    case 'allowed':
      return {
        className: 'badge-decision-allowed',
        tagText: '[ALLOWED]',
        iconSymbol: 'ℹ️',
        ariaLabel: 'Decision: Allowed Read-Only Operation',
      };
    case 'denied':
      return {
        className: 'badge-decision-denied',
        tagText: '[DENIED]',
        iconSymbol: '✕',
        ariaLabel: 'Decision: Human User Denied Authorization',
      };
    case 'blocked':
    default:
      return {
        className: 'badge-decision-blocked',
        tagText: '[BLOCKED]',
        iconSymbol: '⛔',
        ariaLabel: 'Decision: Blocked by Handrail Policy',
      };
  }
}

/**
 * Updates the audit log table/list in the DOM.
 */
export function updateAuditLogUI() {
  if (typeof document === 'undefined') return;

  const container = document.getElementById('audit-log-container');
  const countBadge = document.getElementById('audit-count-badge');

  if (countBadge) {
    countBadge.textContent = `${auditLogs.length} events logged`;
  }

  if (!container) return;

  if (auditLogs.length === 0) {
    container.innerHTML = `
      <div class="audit-empty-state" role="status">
        <p>No agent actions recorded yet in this session.</p>
        <small>Every tool invocation, policy check, human confirmation, and blocked attempt will appear here in chronological order with structured accountability.</small>
      </div>
    `;
    return;
  }

  const filteredLogs = auditLogs.filter((log) => {
    if (activeAuditFilter === 'all') return true;
    return log.decision === activeAuditFilter;
  });

  if (filteredLogs.length === 0) {
    container.innerHTML = `
      <div class="audit-empty-state" role="status">
        <p>No audit events match the active filter: <strong>${activeAuditFilter}</strong>.</p>
      </div>
    `;
    return;
  }

  const rowsHtml = filteredLogs.map((log) => {
    const badgeMeta = getDecisionBadgeMeta(log.decision);
    const authSummary = formatAuthorizedSummary(log.userAuthorized);
    const agentSummary = formatAgentRequestSummary(log.toolName, log.arguments);

    const hasResultData = log.result && Object.keys(log.result).length > 0;
    const resultPreview = hasResultData
      ? (log.result.confirmationNumber ? `Confirmation: ${log.result.confirmationNumber}` :
         log.result.error ? `Error: ${log.result.error}` :
         log.result.message ? log.result.message :
         `Status: ${log.result.status || 'OK'}`)
      : 'Completed';

    return `
      <li class="audit-entry ${log.decision === 'blocked' ? 'entry-blocked' : log.decision === 'executed' ? 'entry-executed' : ''}" id="audit-${log.id}">
        <div class="audit-entry-header">
          <div class="audit-header-left">
            <span class="audit-id"><code>${log.id}</code></span>
            <span class="audit-time"><time datetime="${log.timestamp}">${log.formattedTime}</time></span>
            <span class="audit-tool-name"><code>${log.toolName}</code></span>
          </div>
          <span class="audit-decision-badge ${badgeMeta.className}" aria-label="${badgeMeta.ariaLabel}">
            <span aria-hidden="true" class="badge-icon">${badgeMeta.iconSymbol}</span>
            <span class="badge-text">${badgeMeta.tagText}</span>
          </span>
        </div>

        <div class="audit-entry-body">
          <div class="audit-reason-line">
            <strong>Summary:</strong> ${log.reason}
          </div>

          <!-- Structured 5-Facet Accordion / Details -->
          <details class="audit-structured-details">
            <summary class="audit-details-toggle" aria-label="View 5-Point Structured Breakdown for audit entry ${log.id}">
              <span>View 5-Point Structured Breakdown</span>
            </summary>
            
            <div class="audit-facet-grid">
              <div class="facet-item">
                <span class="facet-label">1. User Authorized Scope:</span>
                <p class="facet-value">${authSummary}</p>
              </div>

              <div class="facet-item">
                <span class="facet-label">2. Agent Requested:</span>
                <p class="facet-value">${agentSummary}</p>
                <div class="facet-code-preview">
                  <code>${JSON.stringify(log.arguments, null, 2)}</code>
                </div>
              </div>

              <div class="facet-item">
                <span class="facet-label">3. Handrail Decision:</span>
                <p class="facet-value">
                  <strong>${log.decision.toUpperCase()}</strong>
                  ${log.decisionDetails?.code ? `(Code: <code>${log.decisionDetails.code}</code>)` : ''}
                  &mdash; ${log.reason}
                </p>
              </div>

              <div class="facet-item">
                <span class="facet-label">4. What Actually Happened:</span>
                <p class="facet-value">${log.whatHappened}</p>
              </div>

              <div class="facet-item">
                <span class="facet-label">5. Final Result:</span>
                <p class="facet-value">${resultPreview}</p>
                <div class="facet-code-preview">
                  <code>${JSON.stringify(log.result, null, 2)}</code>
                </div>
              </div>
            </div>
          </details>
        </div>
      </li>
    `;
  }).join('');

  container.innerHTML = `
    <ol class="audit-list" aria-label="Handrail Audit Trail Records">
      ${rowsHtml}
    </ol>
  `;
}

/**
 * Renders the Plain-Language Result / Transaction Receipt Area.
 * @param {AuditEntry|null} entry
 */
export function renderReceiptUI(entry = null) {
  if (typeof document === 'undefined') return;
  const container = document.getElementById('receipt-display-container');
  if (!container) return;

  const targetEntry = entry || getLatestReceipt();

  if (!targetEntry) {
    container.innerHTML = `
      <div class="receipt-empty-state" role="status">
        <p><strong>No transaction receipt available yet.</strong></p>
        <p class="text-muted">When the AI agent performs an action (such as staging, ordering, or being blocked by policy), a plain-language receipt distinguishing your authorization, the agent's request, and the outcome will be generated here.</p>
      </div>
    `;
    return;
  }

  const badgeMeta = getDecisionBadgeMeta(targetEntry.decision);
  const auth = targetEntry.userAuthorized;
  const args = targetEntry.arguments || {};
  const isRefill = targetEntry.toolName === 'submit_refill_order';
  const isPrepare = targetEntry.toolName === 'prepare_refill_order';
  const isSuccess = targetEntry.decision === 'executed';
  const isBlocked = targetEntry.decision === 'blocked';
  const isDenied = targetEntry.decision === 'denied';

  // 1. What the user authorized text
  let authorizedText = '';
  if (auth) {
    const medNames = Array.isArray(auth.authorizedPrescriptionIds) && auth.authorizedPrescriptionIds.length > 0
      ? auth.authorizedPrescriptionIds.map((id) => {
          if (id === 'RX-001') return 'Lisinopril 10 mg (RX-001)';
          if (id === 'RX-002') return 'Atorvastatin 20 mg (RX-002)';
          if (id === 'RX-003') return 'Metformin 500 mg (RX-003)';
          return id;
        }).join(', ')
      : 'No medications authorized';

    const spend = Number.isFinite(auth.maxSpendLimit) ? `$${auth.maxSpendLimit.toFixed(2)}` : '$25.00';
    const scope = auth.actionScope === 'prepare_only' ? 'Prepare only (No direct submissions)' : 'Prepare & Submit allowed';
    authorizedText = `You authorized a refill of <strong>${medNames}</strong> only, up to <strong>${spend}</strong> (Action Scope: <em>${scope}</em>).`;
  } else {
    authorizedText = 'Standard Handrail default safety bounds active.';
  }

  // 2. What the agent requested text
  let requestedText = '';
  if (isRefill || isPrepare) {
    const ids = Array.isArray(args.prescriptionIds) ? args.prescriptionIds : (args.prescriptionId ? [args.prescriptionId] : []);
    const items = ids.map((id) => {
      if (id === 'RX-001') return 'Lisinopril 10 mg &bull; Qty: 30 tablets &bull; Cost: $12.40';
      if (id === 'RX-002') return 'Atorvastatin 20 mg &bull; Qty: 30 tablets &bull; Cost: $18.75';
      if (id === 'RX-003') return 'Metformin 500 mg &bull; Qty: 60 tablets &bull; Cost: $9.20';
      return `Prescription ${id}`;
    });
    requestedText = `The agent submitted a request for <strong>${targetEntry.toolName}</strong>:<br><ul class="receipt-bullet-list">${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
  } else {
    requestedText = `The agent requested <code>${targetEntry.toolName}</code> with parameters: <code>${JSON.stringify(args)}</code>.`;
  }

  // 3. What Handrail decided text
  let decidedText = `<strong>${badgeMeta.tagText}</strong> &mdash; ${targetEntry.reason}`;
  if (targetEntry.decisionDetails?.code) {
    decidedText += ` <span class="policy-code-badge">(Rule: <code>${targetEntry.decisionDetails.code}</code>)</span>`;
  }

  // 4. Result & Outcome Text
  let resultText = '';
  let integrityText = '';

  if (isSuccess && isRefill) {
    const conf = targetEntry.result?.confirmationNumber || 'RX-CONF-VERIFIED';
    resultText = `Refill submitted successfully. Confirmation code <strong>${conf}</strong>. Order ready for pickup at RefillRx Downtown Hub in 2 hours.`;
    integrityText = '<strong>Nothing else was changed.</strong> No other prescriptions were modified, no secondary payment methods were charged, and no profile data was updated.';
  } else if (isSuccess) {
    resultText = `Action completed successfully. Result: ${targetEntry.whatHappened}`;
    integrityText = '<strong>Nothing else was changed.</strong> All patient record fields remained unchanged.';
  } else if (isBlocked) {
    resultText = `<strong>Action Blocked:</strong> Handrail prevented the agent's request from executing because it violated your active Authority Contract.`;
    integrityText = '<strong>Nothing was changed.</strong> No orders were submitted, no charges were processed, and no pharmacy records were altered.';
  } else if (isDenied) {
    resultText = `<strong>Authorization Refused:</strong> You denied confirmation in the accessible prompt. Handrail halted the AI agent.`;
    integrityText = '<strong>Nothing was changed.</strong> No orders were placed and no copay was deducted.';
  } else {
    resultText = targetEntry.whatHappened;
    integrityText = 'Session state remains consistent with active security boundaries.';
  }

  const cardStyleClass = isSuccess ? 'receipt-card-success' : isBlocked ? 'receipt-card-blocked' : isDenied ? 'receipt-card-denied' : 'receipt-card-neutral';

  container.innerHTML = `
    <article class="receipt-card ${cardStyleClass}" aria-label="Plain-Language Transaction Receipt and Outcome">
      <div class="receipt-card-header">
        <div>
          <span class="receipt-eyebrow">Action Outcome & Receipt</span>
          <h3 class="receipt-title">${isSuccess ? 'Action Completed Successfully' : isBlocked ? 'Action Blocked by Handrail' : isDenied ? 'Authorization Denied by User' : 'Operation Processed'}</h3>
        </div>
        <div class="receipt-header-badge">
          <span class="audit-decision-badge ${badgeMeta.className}">
            <span aria-hidden="true" class="badge-icon">${badgeMeta.iconSymbol}</span>
            <span>${badgeMeta.tagText}</span>
          </span>
          <span class="receipt-time"><time datetime="${targetEntry.timestamp}">${targetEntry.formattedTime}</time></span>
        </div>
      </div>

      <div class="receipt-grid">
        <div class="receipt-section-block">
          <span class="receipt-block-label">1. What You Authorized:</span>
          <div class="receipt-block-content">${authorizedText}</div>
        </div>

        <div class="receipt-section-block">
          <span class="receipt-block-label">2. What The Agent Requested:</span>
          <div class="receipt-block-content">${requestedText}</div>
        </div>

        <div class="receipt-section-block">
          <span class="receipt-block-label">3. What Handrail Decided:</span>
          <div class="receipt-block-content">${decidedText}</div>
        </div>

        <div class="receipt-section-block">
          <span class="receipt-block-label">4. Result:</span>
          <div class="receipt-block-content">${resultText}</div>
        </div>
      </div>

      <div class="receipt-card-footer">
        <p class="receipt-integrity-guarantee">${integrityText}</p>
      </div>
    </article>
  `;
}
