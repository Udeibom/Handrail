/**
 * @file app.js
 * @description Main application controller for Handrail MVP - RefillRx Demo.
 * Orchestrates accessible UI rendering, Authority Contract state, WebMCP tools,
 * agent simulation harness, structured audit log, action receipts, and test runner.
 */

import {
  getPrescriptions,
  getPrescriptionById,
  getPatientProfile,
  calculateRefillCalculation,
  resetPharmacyState,
} from './pharmacy-data.js';

import {
  createAuthorityContract,
  DEFAULT_AUTHORITY_CONTRACT,
} from './authority.js';

import {
  initConfirmationSystem,
} from './confirmation.js';

import {
  calculateContractFingerprint,
  getTrustMetrics,
  checkToolTrust,
  registerExpectedTools,
} from './trust.js';

import {
  logAuditEvent,
  updateAuditLogUI,
  clearAuditLogs,
  exportAuditLogsAsJSON,
  getAuditLogs,
  renderReceiptUI,
  setAuditFilter,
  getDecisionBadgeMeta,
} from './audit.js';

import {
  toolRegistry,
  registerWebMCPTools,
  checkWebMCPNativeAvailability,
  executeHandrailTool,
  callNativeTool,
  WEBMCP_PRIMARY_TOOL_DEFINITIONS,
  WEBMCP_TOOL_DEFINITIONS,
} from './tools.js';

import { runAllAuthorityTests } from '../tests/authority-tests.js';

// Application State
let state = {
  activeContract: createAuthorityContract(),
  prescriptions: getPrescriptions(),
  patient: getPatientProfile(),
  selectedPrescriptionId: 'RX-001',
  stagedRefillIds: ['RX-001'],
  isAgentBusy: false,
  webMcpStatus: { registeredCount: 0, nativeSupported: false },
};

/**
 * Screen reader announcer utility.
 * @param {string} message
 */
function announce(message) {
  const announcer = document.getElementById('accessibility-announcer');
  if (announcer) {
    announcer.textContent = '';
    // slight timeout to guarantee screen-reader detection
    setTimeout(() => {
      announcer.textContent = message;
    }, 50);
  }
}

/**
 * Initialize application once DOM is loaded.
 */
document.addEventListener('DOMContentLoaded', async () => {
  initConfirmationSystem();
  
  // Try registering WebMCP native tools
  state.webMcpStatus = registerWebMCPTools(() => state.activeContract);

  // Initial Fingerprint calculation
  await updateContractFingerprintDisplay();

  // Render initial components
  renderPatientProfile();
  renderPrescriptionList();
  renderPrescriptionDetails(state.selectedPrescriptionId);
  renderRefillPreparation();
  renderAuthorityContractControls();
  renderTrustPanel();
  renderWebMcpInfo();
  updateAuditLogUI();
  renderReceiptUI();

  // Log initial session start
  logAuditEvent({
    toolName: 'initialize_session',
    action: 'initialize_session',
    decision: 'allowed',
    reason: 'Handrail human consent layer initialized with default Authority Contract.',
    userAuthorized: { ...state.activeContract },
    whatHappened: 'Session started with patient RX-PT-9042 and deterministic contract active.',
    result: { status: 'ready', contractId: state.activeContract.contractId },
  });

  // Attach Event Listeners
  bindFormEvents();
  bindDemoControls();
  bindAuditControls();
  bindTestRunner();
});

/**
 * Renders the fictional patient info section.
 */
function renderPatientProfile() {
  const container = document.getElementById('patient-details-content');
  if (!container) return;

  const { name, id, dateOfBirth, allergies, insurancePlan, preferredPharmacy, paymentMethod } = state.patient;

  container.innerHTML = `
    <div class="patient-grid">
      <div class="patient-field">
        <span class="field-label">Patient Name:</span>
        <strong class="field-value">${name}</strong>
      </div>
      <div class="patient-field">
        <span class="field-label">Patient ID:</span>
        <span class="field-value"><code>${id}</code></span>
      </div>
      <div class="patient-field">
        <span class="field-label">Date of Birth:</span>
        <span class="field-value">${dateOfBirth}</span>
      </div>
      <div class="patient-field">
        <span class="field-label">Insurance Plan:</span>
        <span class="field-value">${insurancePlan}</span>
      </div>
      <div class="patient-field">
        <span class="field-label">Preferred Pharmacy:</span>
        <span class="field-value">${preferredPharmacy}</span>
      </div>
      <div class="patient-field">
        <span class="field-label">Payment on File:</span>
        <span class="field-value">${paymentMethod}</span>
      </div>
      <div class="patient-field full-width">
        <span class="field-label">Known Allergies:</span>
        <span class="field-value allergy-tag">${allergies.join(', ')}</span>
      </div>
    </div>
  `;
}

/**
 * Renders the prescription list in RefillRx.
 */
function renderPrescriptionList() {
  const tableBody = document.getElementById('prescriptions-table-body');
  const fallbackList = document.getElementById('prescription-list');
  const countBadge = document.getElementById('rx-count-badge');

  if (!tableBody && !fallbackList) return;

  if (countBadge) {
    const eligibleCount = state.prescriptions.filter((p) => p.eligible).length;
    countBadge.textContent = `${eligibleCount} of ${state.prescriptions.length} Refillable`;
  }

  if (tableBody) {
    tableBody.innerHTML = state.prescriptions.map((rx) => {
      const isSelected = rx.id === state.selectedPrescriptionId;
      const isStaged = state.stagedRefillIds.includes(rx.id);
      const isAuthorized = (state.activeContract.authorizedPrescriptionIds || []).includes(rx.id);

      const eligibilityBadge = rx.eligible
        ? `<span class="badge-refill-available rx-status-badge" title="Eligible for online refill"><span aria-hidden="true">✓</span> Refill Eligible</span>`
        : `<span class="badge-refill-ineligible rx-status-badge" title="0 refills remaining, requires physician authorization"><span aria-hidden="true">⛔</span> 0 Refills (Ineligible)</span>`;

      const scopeBadge = isAuthorized
        ? `<span class="badge-scope-allowed rx-status-badge" title="Included in active Agent Authority Contract"><span aria-hidden="true">🛡️</span> Authorized in Contract</span>`
        : `<span class="badge-scope-restricted rx-status-badge" title="Excluded from active Agent Authority Contract"><span aria-hidden="true">✕</span> Outside Contract Scope</span>`;

      return `
        <tr class="rx-row ${isSelected ? 'row-selected' : ''}" ${isSelected ? 'aria-current="true"' : ''} data-rx-id="${rx.id}">
          <th scope="row" class="cell-medication">
            <div class="med-name-group">
              <span class="med-name">${rx.medication}</span>
              <span class="med-dosage">${rx.dosage}</span>
            </div>
            <div class="med-instructions-preview">${rx.instructions || ''}</div>
          </th>
          <td class="cell-rx-id">
            <code>${rx.id}</code>
            <div class="ndc-code">NDC: ${rx.ndc || 'N/A'}</div>
          </td>
          <td class="cell-refills">
            <span class="refill-count-pill ${rx.refillsRemaining > 0 ? 'refills-active' : 'refills-zero'}">
              <strong>${rx.refillsRemaining}</strong> remaining
            </span>
          </td>
          <td class="cell-price font-mono font-bold">$${rx.price.toFixed(2)}</td>
          <td class="cell-eligibility">
            <div class="status-badges-cell">
              ${eligibilityBadge}
              ${scopeBadge}
            </div>
          </td>
          <td class="cell-actions">
            <div class="rx-actions-flex">
              <button 
                type="button" 
                class="btn btn-secondary btn-sm select-rx-btn" 
                data-rx-id="${rx.id}"
                aria-label="View details for ${rx.medication} ${rx.dosage}"
              >
                View details
              </button>

              ${rx.eligible ? `
                <button 
                  type="button" 
                  class="btn btn-sm ${isStaged ? 'btn-primary' : 'btn-secondary'} stage-rx-btn" 
                  data-rx-id="${rx.id}"
                  aria-pressed="${isStaged}"
                  aria-label="${isStaged ? 'Remove' : 'Stage'} ${rx.medication} ${rx.dosage} for Refill"
                >
                  ${isStaged ? '✓ Staged' : '+ Stage Refill'}
                </button>
              ` : `
                <button type="button" class="btn btn-secondary btn-sm" disabled aria-disabled="true" aria-label="Cannot refill ${rx.medication} (0 refills remaining)">
                  Ineligible
                </button>
              `}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Attach listeners
    tableBody.querySelectorAll('.select-rx-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const rxId = btn.getAttribute('data-rx-id');
        state.selectedPrescriptionId = rxId;
        renderPrescriptionList();
        renderPrescriptionDetails(rxId);
        announce(`Selected and inspecting details for prescription ${rxId}.`);
      });
    });

    tableBody.querySelectorAll('.stage-rx-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const rxId = btn.getAttribute('data-rx-id');
        const rxObj = state.prescriptions.find((r) => r.id === rxId);
        const rxName = rxObj ? `${rxObj.medication} ${rxObj.dosage}` : rxId;

        if (state.stagedRefillIds.includes(rxId)) {
          state.stagedRefillIds = state.stagedRefillIds.filter((id) => id !== rxId);
          announce(`Removed ${rxName} from staged refill list. Total staged: ${state.stagedRefillIds.length}`);
        } else {
          state.stagedRefillIds.push(rxId);
          announce(`Staged ${rxName} for refill. Total staged: ${state.stagedRefillIds.length}`);
        }
        renderPrescriptionList();
        renderRefillPreparation();
      });
    });
    return;
  }

  if (fallbackList) {
    fallbackList.innerHTML = state.prescriptions.map((rx) => {
      const isSelected = rx.id === state.selectedPrescriptionId;
      const isStaged = state.stagedRefillIds.includes(rx.id);
      const isAuthorized = (state.activeContract.authorizedPrescriptionIds || []).includes(rx.id);

      return `
        <li class="rx-item ${isSelected ? 'rx-item-selected' : ''}" data-rx-id="${rx.id}">
          <div class="rx-item-header">
            <div class="rx-item-title-group">
              <h4 class="rx-name">${rx.medication} <span class="rx-dosage">${rx.dosage}</span></h4>
              <span class="rx-id"><code>${rx.id}</code> &bull; Qty: ${rx.quantity}</span>
            </div>
            <span class="rx-price">$${rx.price.toFixed(2)}</span>
          </div>

          <div class="rx-item-meta">
            <span>Refills Remaining: <strong>${rx.refillsRemaining}</strong></span>
            <span>Last Filled: ${rx.lastFilled}</span>
          </div>

          <div class="rx-status-row">
            ${rx.eligible
              ? `<span class="badge-refill-available rx-status-badge">Eligible for Refill</span>`
              : `<span class="badge-refill-ineligible rx-status-badge">0 Refills - Doctor Auth Needed</span>`
            }
            
            <span class="badge-authorized-scope rx-status-badge ${isAuthorized ? 'badge-scope-allowed' : 'badge-scope-restricted'}">
              ${isAuthorized ? '✓ In Agent Contract' : '✗ Outside Agent Scope'}
            </span>
          </div>

          <div class="rx-item-actions">
            <button 
              type="button" 
              class="btn btn-secondary btn-sm select-rx-btn" 
              data-rx-id="${rx.id}"
              aria-label="View details for ${rx.medication} ${rx.dosage}"
            >
              View details
            </button>

            ${rx.eligible ? `
              <button 
                type="button" 
                class="btn btn-sm ${isStaged ? 'btn-primary' : 'btn-secondary'} stage-rx-btn" 
                data-rx-id="${rx.id}"
                aria-pressed="${isStaged}"
                aria-label="${isStaged ? 'Remove' : 'Stage'} ${rx.medication} for Refill"
              >
                ${isStaged ? '✓ Staged for Refill' : '+ Stage Refill'}
              </button>
            ` : `
              <button type="button" class="btn btn-secondary btn-sm" disabled aria-disabled="true">
                Cannot Refill (0 Left)
              </button>
            `}
          </div>
        </li>
      `;
    }).join('');

    fallbackList.querySelectorAll('.select-rx-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const rxId = btn.getAttribute('data-rx-id');
        state.selectedPrescriptionId = rxId;
        renderPrescriptionList();
        renderPrescriptionDetails(rxId);
        announce(`Viewing prescription details for ${rxId}.`);
      });
    });

    fallbackList.querySelectorAll('.stage-rx-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const rxId = btn.getAttribute('data-rx-id');
        if (state.stagedRefillIds.includes(rxId)) {
          state.stagedRefillIds = state.stagedRefillIds.filter((id) => id !== rxId);
        } else {
          state.stagedRefillIds.push(rxId);
        }
        renderPrescriptionList();
        renderRefillPreparation();
        announce(`Updated staged refill items. Current count: ${state.stagedRefillIds.length}`);
      });
    });
  }
}

/**
 * Renders the detailed view of a selected prescription.
 * @param {string} rxId
 */
function renderPrescriptionDetails(rxId) {
  const container = document.getElementById('prescription-detail-content');
  if (!container) return;

  const rx = getPrescriptionById(rxId);
  if (!rx) {
    container.innerHTML = '<p class="text-muted">Select a prescription from the list to view details.</p>';
    return;
  }

  const isAuthorized = (state.activeContract.authorizedPrescriptionIds || []).includes(rx.id);

  container.innerHTML = `
    <div class="detail-card">
      <div class="detail-header">
        <div>
          <span class="detail-eyebrow">Prescription Record</span>
          <h4 class="detail-title">${rx.medication} ${rx.dosage}</h4>
          <span class="detail-code">ID: <code>${rx.id}</code> &bull; NDC: ${rx.ndc}</span>
        </div>
        <div class="detail-price-box">
          <span class="price-label">Copay Price</span>
          <span class="price-val">$${rx.price.toFixed(2)}</span>
        </div>
      </div>

      <div class="detail-grid">
        <div class="detail-field">
          <span class="field-label">Prescribing Physician:</span>
          <span class="field-value">${rx.doctor}</span>
        </div>
        <div class="detail-field">
          <span class="field-label">Prescription Date:</span>
          <span class="field-value">${rx.prescribedDate}</span>
        </div>
        <div class="detail-field">
          <span class="field-label">Last Refill Date:</span>
          <span class="field-value">${rx.lastFilled}</span>
        </div>
        <div class="detail-field">
          <span class="field-label">Days Supply / Quantity:</span>
          <span class="field-value">${rx.daysSupply} days (${rx.quantity} count)</span>
        </div>
        <div class="detail-field">
          <span class="field-label">Refills Remaining:</span>
          <strong class="field-value ${rx.refillsRemaining === 0 ? 'text-danger' : 'text-success'}">
            ${rx.refillsRemaining} remaining
          </strong>
        </div>
        <div class="detail-field">
          <span class="field-label">Handrail Agent Scope:</span>
          <span class="field-value">
            ${isAuthorized
              ? '<span class="text-success font-semibold">✓ Authorized in Contract</span>'
              : '<span class="text-danger font-semibold">✗ Outside Authorized Scope</span>'
            }
          </span>
        </div>
        <div class="detail-field full-width">
          <span class="field-label">Clinical Instructions:</span>
          <p class="field-value instructions-text">${rx.instructions}</p>
        </div>
      </div>
    </div>
  `;
}

/**
 * Renders the staged refill calculations and pre-flight policy checks.
 */
function renderRefillPreparation() {
  const container = document.getElementById('refill-preparation-content');
  if (!container) return;

  if (state.stagedRefillIds.length === 0) {
    container.innerHTML = `
      <p class="text-muted empty-state-box">
        No prescriptions currently staged for refill. Click "+ Stage Refill" above or use the Agent Simulation buttons below to prepare an order.
      </p>
    `;
    return;
  }

  const calc = calculateRefillCalculation(state.stagedRefillIds);
  const maxSpend = state.activeContract.maxSpendLimit;
  const threshold = state.activeContract.confirmationThreshold;
  const authorizedIds = state.activeContract.authorizedPrescriptionIds || [];
  
  const unauthorizedStaged = state.stagedRefillIds.filter((id) => !authorizedIds.includes(id));
  const hasUnauthorized = unauthorizedStaged.length > 0;
  const isOverMaxSpend = calc.totalCost > maxSpend;
  const isOverThreshold = calc.totalCost >= threshold;
  const hasIneligible = calc.ineligibleIds.length > 0;
  const isActionScopeRestricted = state.activeContract.actionScope === 'prepare_only';

  const isBlocked = hasUnauthorized || isOverMaxSpend || hasIneligible;

  const itemsHtml = calc.items.map((item) => {
    const isAuthed = authorizedIds.includes(item.id);
    return `
      <li class="staged-item-row ${!isAuthed ? 'staged-item-unauthorized' : ''}">
        <div class="staged-item-info">
          <strong>${item.medication} ${item.dosage}</strong>
          <span class="staged-item-rx"><code>${item.id}</code> (Qty: ${item.quantity}) ${!isAuthed ? '<span class="text-danger font-semibold">&bull; Outside Authorized Scope</span>' : ''}</span>
        </div>
        <span class="staged-item-price">$${item.price.toFixed(2)}</span>
      </li>
    `;
  }).join('');

  container.innerHTML = `
    <div class="staged-order-box">
      <ul class="staged-items-list" aria-label="Staged Refill Items">
        ${itemsHtml}
      </ul>

      <div class="staged-summary-totals">
        <div class="calc-row">
          <span>Item Subtotal:</span>
          <span>$${calc.totalCost.toFixed(2)}</span>
        </div>
        <div class="calc-row total-row">
          <strong>Estimated Total:</strong>
          <strong class="total-price">$${calc.totalCost.toFixed(2)}</strong>
        </div>
      </div>

      <!-- Handrail Pre-Flight Authority Check -->
      <div class="handrail-preflight ${isBlocked ? 'preflight-blocked' : 'preflight-allowed'}" role="status">
        <h5 class="preflight-heading">Handrail Policy Pre-Flight:</h5>
        <ul class="preflight-checks">
          <li class="${hasUnauthorized ? 'check-failed' : 'check-passed'}">
            Medication Scope:
            <strong>${hasUnauthorized ? `Unauthorized Rx (${unauthorizedStaged.join(', ')})` : 'All Staged Rx Authorized'}</strong>
          </li>
          <li class="${isActionScopeRestricted ? 'check-warning' : 'check-passed'}">
            Action Scope:
            <strong>${isActionScopeRestricted ? 'Prepare Only (Submission Restricted)' : 'Prepare & Submit Permitted'}</strong>
          </li>
          <li class="${isOverMaxSpend ? 'check-failed' : 'check-passed'}">
            Spend Limit ($${calc.totalCost.toFixed(2)} / $${maxSpend.toFixed(2)} cap):
            <strong>${isOverMaxSpend ? 'Exceeds Maximum Spend' : 'Within Limit'}</strong>
          </li>
          <li class="${isOverThreshold ? 'check-warning' : 'check-passed'}">
            Human Consent Threshold ($${threshold.toFixed(2)}):
            <strong>${isOverThreshold ? 'Requires Explicit Confirmation' : 'Pre-Approved'}</strong>
          </li>
          <li class="${hasIneligible ? 'check-failed' : 'check-passed'}">
            Refill Eligibility:
            <strong>${hasIneligible ? 'Contains Ineligible Prescription' : 'All Prescriptions Eligible'}</strong>
          </li>
        </ul>
      </div>
    </div>
  `;
}

/**
 * Renders the Authority Contract form controls to match state.
 */
function renderAuthorityContractControls() {
  const maxSpendInput = document.getElementById('contract-max-spend');
  const thresholdInput = document.getElementById('contract-threshold');
  const requireConfirmCheck = document.getElementById('contract-require-confirm');
  const contractIdBadge = document.getElementById('contract-id-badge');

  // Medication Scope Checkboxes
  const rxCheckboxes = document.querySelectorAll('input[name="authorizedRx"]');
  const authorizedIds = state.activeContract.authorizedPrescriptionIds || [];
  rxCheckboxes.forEach((cb) => {
    cb.checked = authorizedIds.includes(cb.value);
  });

  // Action Scope Radio
  const actionScopeRadios = document.querySelectorAll('input[name="actionScope"]');
  actionScopeRadios.forEach((radio) => {
    radio.checked = radio.value === state.activeContract.actionScope;
  });

  if (maxSpendInput) maxSpendInput.value = state.activeContract.maxSpendLimit;
  if (thresholdInput) thresholdInput.value = state.activeContract.confirmationThreshold;
  if (requireConfirmCheck) requireConfirmCheck.checked = state.activeContract.requireHumanConfirmation;
  if (contractIdBadge) contractIdBadge.textContent = state.activeContract.contractId;
}

/**
 * Updates the contract fingerprint display in the Trust Panel.
 */
async function updateContractFingerprintDisplay() {
  const fingerprintEl = document.getElementById('contract-fingerprint');
  if (fingerprintEl) {
    const fp = await calculateContractFingerprint(state.activeContract);
    fingerprintEl.textContent = fp;
  }
}

/**
 * Renders the Trust & Integrity Panel and Registered Tools.
 */
function renderTrustPanel() {
  const metrics = getTrustMetrics();
  const invocationsEl = document.getElementById('metric-invocations');
  const approvedEl = document.getElementById('metric-approved');
  const blockedEl = document.getElementById('metric-blocked');
  const confirmationEl = document.getElementById('metric-confirmations');

  if (invocationsEl) invocationsEl.textContent = metrics.totalInvocations;
  if (approvedEl) approvedEl.textContent = metrics.totalApproved;
  if (blockedEl) blockedEl.textContent = metrics.totalBlocked;
  if (confirmationEl) confirmationEl.textContent = metrics.totalConfirmationRequired;

  renderToolRegistryUI();
  renderAgentActivity();
}

/**
 * Renders the Agent Activity panel (Current Authority, Recent Action, Tool Status).
 */
export function renderAgentActivity(statusText = null, statusClass = null) {
  const authorityEl = document.getElementById('activity-current-authority');
  const recentActionEl = document.getElementById('activity-recent-action');
  const statusEl = document.getElementById('agent-status-indicator');

  if (authorityEl && state.activeContract) {
    const auth = state.activeContract;
    const medNames = (auth.authorizedPrescriptionIds || []).map((id) => {
      if (id === 'RX-001') return 'Lisinopril 10 mg (RX-001)';
      if (id === 'RX-002') return 'Atorvastatin 20 mg (RX-002)';
      if (id === 'RX-003') return 'Metformin 500 mg (RX-003)';
      return id;
    });
    const medText = medNames.length > 0 ? medNames.join(', ') : 'None (No medications authorized)';
    const scopeText = auth.actionScope === 'prepare_only' ? 'Prepare only' : 'Prepare & submit';
    const spendText = `$${auth.maxSpendLimit.toFixed(2)}`;
    authorityEl.innerHTML = `<strong>${medText}</strong> &bull; ${scopeText} &bull; Max spend: ${spendText}`;
  }

  if (recentActionEl) {
    const logs = getAuditLogs();
    if (logs && logs.length > 0) {
      const latest = logs[0];
      const badge = getDecisionBadgeMeta(latest.decision);
      recentActionEl.innerHTML = `
        <div class="activity-action-row">
          <span class="audit-decision-badge ${badge.className}" style="font-size: 0.75rem; padding: 0.15rem 0.45rem;">
            <span aria-hidden="true">${badge.iconSymbol}</span> ${badge.tagText}
          </span>
          <span class="activity-tool-code"><code>${latest.toolName}</code></span>
          <span class="activity-time-text">${latest.formattedTime}</span>
        </div>
        <div class="activity-action-summary">${latest.reason}</div>
      `;
    } else {
      recentActionEl.innerHTML = '<span class="text-muted">Session initialized with default contract.</span>';
    }
  }

  if (statusEl && statusText) {
    statusEl.textContent = statusText;
    if (statusClass) {
      statusEl.className = `agent-status ${statusClass}`;
    }
  }
}

/**
 * Renders the WebMCP Tool Registry & Deterministic Trust Inspector UI.
 */
function renderToolRegistryUI() {
  const container = document.getElementById('registered-tools-list');
  const countBadge = document.getElementById('registry-count-badge');
  if (!container) return;

  const tools = toolRegistry.getAllTools();
  if (countBadge) {
    countBadge.textContent = `${tools.length} Registered Tools`;
  }

  container.innerHTML = tools.map((tool) => {
    const isReadOnly = tool.readOnlyHint === true;
    const isTrap = tool.name === 'update_payment_method';
    
    // Check trust heuristics for display
    const trustReport = checkToolTrust(tool);
    let trustBadgeHtml = '';
    if (isTrap) {
      trustBadgeHtml = `<span class="badge-trap" title="Security trap tool - deliberately restricted">⚠️ SECURITY TRAP</span>`;
    } else if (trustReport.isTrusted) {
      trustBadgeHtml = `<span class="badge-trusted">✓ TRUSTED</span>`;
    } else {
      trustBadgeHtml = `<span class="badge-untrusted" title="${trustReport.reason}">⛔ UNTRUSTED (${trustReport.code})</span>`;
    }

    const classBadgeHtml = isReadOnly
      ? `<span class="badge-readonly">📖 READ-ONLY SAFE</span>`
      : `<span class="badge-mutating">⚡ MUTATING / CONSEQUENTIAL</span>`;

    const paramKeys = Object.keys(tool.parameters?.properties || {});
    const schemaSummary = paramKeys.length > 0
      ? `Parameters: [${paramKeys.join(', ')}]`
      : `Parameters: None`;

    return `
      <div class="tool-entry-card" id="tool-card-${tool.name}">
        <div class="tool-entry-header">
          <code class="tool-name-code">${tool.name}</code>
          <div class="tool-badges-row">
            ${classBadgeHtml}
            ${trustBadgeHtml}
          </div>
        </div>
        <p class="tool-desc-text">${tool.description}</p>
        <div class="tool-meta-footer">
          <span>${schemaSummary}</span>
          <span>Registered: ${tool.registrationInfo?.registeredBy || 'core-session'} (${tool.registrationInfo?.sessionId || 'SESSION-RX-2025-001'})</span>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Renders WebMCP registration status info.
 */
function renderWebMcpInfo() {
  const statusBadge = document.getElementById('webmcp-status-badge');
  const statusDesc = document.getElementById('webmcp-status-desc');
  const modelContextStatus = document.getElementById('webmcp-modelcontext-status');
  const registerToolStatus = document.getElementById('webmcp-registertool-status');
  const registeredCountEl = document.getElementById('webmcp-registered-count');

  const avail = checkWebMCPNativeAvailability();

  if (modelContextStatus) {
    modelContextStatus.textContent = avail.hasModelContext ? 'Detected (document.modelContext)' : 'Unavailable';
    modelContextStatus.style.color = avail.hasModelContext ? 'var(--color-success)' : 'var(--color-slate-600)';
  }

  if (registerToolStatus) {
    registerToolStatus.textContent = avail.hasRegisterTool ? 'Active (.registerTool)' : 'Unavailable';
    registerToolStatus.style.color = avail.hasRegisterTool ? 'var(--color-success)' : 'var(--color-slate-600)';
  }

  if (registeredCountEl) {
    registeredCountEl.textContent = `${toolRegistry.getAllTools().length} Tools in Registry (${avail.isAvailable ? 'Native Bound' : 'Test Harness Active'})`;
  }

  if (statusBadge && statusDesc) {
    if (avail.isAvailable) {
      statusBadge.textContent = 'Native WebMCP Active';
      statusBadge.className = 'status-badge status-active';
      statusDesc.innerHTML = `Registered <strong>${state.webMcpStatus.registeredCount || 5} tools</strong> directly with <code>document.modelContext.registerTool</code>.`;
    } else {
      statusBadge.textContent = 'Dev Test Harness Active';
      statusBadge.className = 'status-badge status-harness';
      statusDesc.innerHTML = 'Native WebMCP (<code>document.modelContext.registerTool</code>) is unavailable in this standard browser runtime. Handrail does <strong>not fake or simulate</strong> the API; the canonical first-party JavaScript registration layer is active and validated through the separated deterministic test harness.';
    }
  }
}

/**
 * Reads the form inputs and returns a structured Authority Contract override object.
 */
function readContractFromForm() {
  const maxSpend = parseFloat(document.getElementById('contract-max-spend')?.value) || 0;
  const threshold = parseFloat(document.getElementById('contract-threshold')?.value) || 0;
  const requireConfirm = document.getElementById('contract-require-confirm')?.checked ?? true;

  const checkedRxElements = document.querySelectorAll('input[name="authorizedRx"]:checked');
  const authorizedPrescriptionIds = Array.from(checkedRxElements).map((el) => el.value);

  const selectedActionScope = document.querySelector('input[name="actionScope"]:checked')?.value || 'prepare_and_submit';

  return {
    authorizedPrescriptionIds,
    actionScope: selectedActionScope,
    maxSpendLimit: maxSpend,
    confirmationThreshold: threshold,
    requireHumanConfirmation: requireConfirm,
  };
}

/**
 * Binds Authority Contract input controls.
 */
function bindFormEvents() {
  const form = document.getElementById('authority-contract-form');
  const resetBtn = document.getElementById('reset-contract-btn');
  const saveStatusEl = document.getElementById('contract-save-status');

  const updateContract = async (isExplicitSave = false) => {
    const overrides = readContractFromForm();
    state.activeContract = createAuthorityContract(overrides);

    await updateContractFingerprintDisplay();
    renderPrescriptionList();
    renderPrescriptionDetails(state.selectedPrescriptionId);
    renderRefillPreparation();

    if (saveStatusEl) {
      saveStatusEl.textContent = isExplicitSave ? 'Authority Contract saved!' : 'Authority Contract updated';
      saveStatusEl.style.color = 'var(--color-success)';
      setTimeout(() => {
        if (saveStatusEl) saveStatusEl.textContent = 'Contract active';
      }, 3000);
    }

    if (isExplicitSave) {
      logAuditEvent({
        toolName: 'save_authority_contract',
        action: 'save_authority_contract',
        decision: 'allowed',
        reason: `Contract saved: scope=[${overrides.authorizedPrescriptionIds.join(', ')}], actionScope=${overrides.actionScope}, maxSpend=$${overrides.maxSpendLimit.toFixed(2)}.`,
        userAuthorized: { ...state.activeContract },
        whatHappened: `Human user saved updated authority boundaries with ${overrides.authorizedPrescriptionIds.length} authorized medication(s).`,
        result: { status: 'saved', contract: state.activeContract },
      });
      announce(`Authority Contract saved with ${overrides.authorizedPrescriptionIds.length} authorized medications.`);
    }
  };

  if (form) {
    form.addEventListener('input', () => updateContract(false));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      updateContract(true);
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      state.activeContract = createAuthorityContract(DEFAULT_AUTHORITY_CONTRACT);
      renderAuthorityContractControls();
      await updateContractFingerprintDisplay();
      renderPrescriptionList();
      renderPrescriptionDetails(state.selectedPrescriptionId);
      renderRefillPreparation();
      if (saveStatusEl) {
        saveStatusEl.textContent = 'Contract reset to defaults';
      }
      logAuditEvent({
        toolName: 'reset_authority_contract',
        action: 'reset_authority_contract',
        decision: 'allowed',
        reason: 'Authority Contract reset to default security parameters.',
        userAuthorized: { ...state.activeContract },
        whatHappened: 'Authority contract reset to baseline parameters (Lisinopril only, $25 max spend).',
        result: { status: 'reset', contract: state.activeContract },
      });
      announce('Authority Contract reset to defaults.');
    });
  }
}

/**
 * Binds Agent Simulation harness buttons.
 */
function bindDemoControls() {
  const agentStatusEl = document.getElementById('agent-status-indicator');

  async function runSimulatedAction(name, params, desc) {
    if (state.isAgentBusy) return;
    state.isAgentBusy = true;

    if (agentStatusEl) {
      agentStatusEl.textContent = `Agent executing: ${name}...`;
      agentStatusEl.className = 'agent-status status-busy';
    }
    announce(`Agent started action: ${desc}`);

    try {
      const result = await executeHandrailTool(name, params, state.activeContract);
      renderPrescriptionList();
      renderPrescriptionDetails();
      renderTrustPanel();
      renderRefillPreparation();
      renderReceiptUI();
      renderToolRegistryUI();

      if (agentStatusEl) {
        if (result.success) {
          agentStatusEl.textContent = `Agent completed: ${name} (Verdict: ${result.verdict})`;
          agentStatusEl.className = 'agent-status status-success';
          announce(`Agent completed ${name}. Verdict: ${result.verdict}.`);
        } else if (result.verdict === 'BLOCKED') {
          agentStatusEl.textContent = `Agent blocked: ${name} (${result.code || 'BLOCKED'})`;
          agentStatusEl.className = 'agent-status status-failed';
          const msg = result.error || "Blocked. This tool was not part of your authority contract and failed Handrail's tool-trust check. No confirmation was offered.";
          announce(msg);
        } else {
          agentStatusEl.textContent = `Agent halted: ${name} (Verdict: ${result.verdict} - ${result.code || 'DENIED'})`;
          agentStatusEl.className = 'agent-status status-failed';
          announce(`Agent halted: ${result.error || 'Action denied by user.'}`);
        }
      }
      return result;
    } catch (err) {
      console.error('Agent execution error:', err);
      if (agentStatusEl) {
        agentStatusEl.textContent = `Agent error: ${err.message}`;
        agentStatusEl.className = 'agent-status status-failed';
      }
      announce(`Execution error: ${err.message}`);
      return { success: false, error: err.message, verdict: 'ERROR' };
    } finally {
      state.isAgentBusy = false;
    }
  }

  // =========================================================================
  // Primary Demo Scenarios
  // =========================================================================

  // 1. Run Successful Agent Flow (Canonical 4-Step Sequence)
  const btnRunSuccessful = document.getElementById('sim-run-successful-flow');
  if (btnRunSuccessful) {
    btnRunSuccessful.addEventListener('click', async () => {
      if (state.isAgentBusy) return;

      // 1a. Ensure Authority Contract matches required demo parameters:
      // Lisinopril authorized, prepare & submit allowed, max spend $30.00
      state.activeContract = createAuthorityContract({
        authorizedPrescriptionIds: ['RX-001'],
        actionScope: 'prepare_and_submit',
        maxSpendLimit: 30.00,
        confirmationThreshold: 10.00,
        requireHumanConfirmation: true,
      });

      renderAuthorityContractControls();
      await updateContractFingerprintDisplay();
      renderPrescriptionList();
      renderPrescriptionDetails('RX-001');

      if (agentStatusEl) {
        agentStatusEl.textContent = 'Running Successful Agent Flow (Step 1/4: search_medications)...';
        agentStatusEl.className = 'agent-status status-busy';
      }
      announce('Starting full successful demo flow: Step 1 search_medications');

      // Step 1: search_medications
      const searchRes = await executeHandrailTool('search_medications', { status: 'all' }, state.activeContract);
      renderPrescriptionList();
      renderTrustPanel();

      if (!searchRes.success) {
        if (agentStatusEl) {
          agentStatusEl.textContent = 'Agent flow failed at search step.';
          agentStatusEl.className = 'agent-status status-failed';
        }
        return;
      }

      // Step 2: view_prescription_details
      if (agentStatusEl) {
        agentStatusEl.textContent = 'Running Successful Agent Flow (Step 2/4: view_prescription_details RX-001)...';
        agentStatusEl.className = 'agent-status status-busy';
      }
      announce('Step 2: view_prescription_details for RX-001 Lisinopril');
      state.selectedPrescriptionId = 'RX-001';
      const detailsRes = await executeHandrailTool('view_prescription_details', { prescriptionId: 'RX-001' }, state.activeContract);
      renderPrescriptionDetails('RX-001');
      renderTrustPanel();

      if (!detailsRes.success) {
        if (agentStatusEl) {
          agentStatusEl.textContent = 'Agent flow failed at details step.';
          agentStatusEl.className = 'agent-status status-failed';
        }
        return;
      }

      // Step 3: prepare_refill (Stage Lisinopril 10 mg, 30 qty, $12.40)
      if (agentStatusEl) {
        agentStatusEl.textContent = 'Running Successful Agent Flow (Step 3/4: prepare_refill $12.40)...';
        agentStatusEl.className = 'agent-status status-busy';
      }
      announce('Step 3: prepare_refill Lisinopril 10mg ($12.40)');
      state.stagedRefillIds = ['RX-001'];
      const prepareRes = await executeHandrailTool('prepare_refill', { prescriptionId: 'RX-001', quantity: 30, deliveryMethod: 'pickup' }, state.activeContract);
      renderRefillPreparation();
      renderTrustPanel();

      if (!prepareRes.success) {
        if (agentStatusEl) {
          agentStatusEl.textContent = 'Agent flow failed at prepare step.';
          agentStatusEl.className = 'agent-status status-failed';
        }
        return;
      }

      // Step 4: submit_refill -> Prompts Human Confirmation Dialog!
      if (agentStatusEl) {
        agentStatusEl.textContent = 'Running Successful Agent Flow (Step 4/4: submit_refill - awaiting human confirmation)...';
        agentStatusEl.className = 'agent-status status-busy';
      }
      announce('Step 4: submit_refill order. Awaiting your approval in the confirmation dialog.');

      const submitRes = await executeHandrailTool('submit_refill', { prescriptionIds: ['RX-001'], quantity: 30, deliveryMethod: 'pickup' }, state.activeContract);
      renderPrescriptionList();
      renderPrescriptionDetails('RX-001');
      renderRefillPreparation();
      renderReceiptUI();
      renderTrustPanel();

      if (agentStatusEl) {
        if (submitRes.success) {
          agentStatusEl.textContent = 'Successful Agent Flow complete: Refill confirmed and processed!';
          agentStatusEl.className = 'agent-status status-success';
          announce('Successful agent flow complete! Refill order confirmed and receipt generated.');
        } else if (submitRes.verdict === 'DENIED') {
          agentStatusEl.textContent = 'Agent flow halted: Refill authorization denied by user.';
          agentStatusEl.className = 'agent-status status-failed';
          announce('Refill order denied in confirmation dialog. No records or charges processed.');
        } else {
          agentStatusEl.textContent = `Agent flow blocked: ${submitRes.error || submitRes.code}`;
          agentStatusEl.className = 'agent-status status-failed';
          announce(`Refill order blocked: ${submitRes.error}`);
        }
      }
    });
  }

  // 2. Simulate Out-of-Scope Medication (RX-002 with RX-001-only authority)
  const btnOutOfScope = document.getElementById('sim-out-of-scope-flow');
  if (btnOutOfScope) {
    btnOutOfScope.addEventListener('click', async () => {
      state.activeContract = createAuthorityContract({
        authorizedPrescriptionIds: ['RX-001'], // Lisinopril only
        actionScope: 'prepare_and_submit',
        maxSpendLimit: 30.00,
      });
      renderAuthorityContractControls();
      await updateContractFingerprintDisplay();
      state.stagedRefillIds = ['RX-002'];
      renderPrescriptionList();
      renderRefillPreparation();

      runSimulatedAction(
        'submit_refill',
        { prescriptionIds: ['RX-002'], quantity: 30, deliveryMethod: 'pickup' },
        'Attempt submit_refill(RX-002) with Lisinopril-only scope (Expected: Blocked, No Confirmation)'
      );
    });
  }

  // 3. Simulate Amount Limit Failure ($12.40 vs $10.00 Max)
  const btnAmountLimit = document.getElementById('sim-amount-limit-flow');
  if (btnAmountLimit) {
    btnAmountLimit.addEventListener('click', async () => {
      state.activeContract = createAuthorityContract({
        authorizedPrescriptionIds: ['RX-001'],
        actionScope: 'prepare_and_submit',
        maxSpendLimit: 10.00, // Lisinopril is $12.40 -> exceeds limit
      });
      renderAuthorityContractControls();
      await updateContractFingerprintDisplay();
      state.stagedRefillIds = ['RX-001'];
      renderPrescriptionList();
      renderRefillPreparation();

      runSimulatedAction(
        'submit_refill',
        { prescriptionIds: ['RX-001'], quantity: 30, deliveryMethod: 'pickup' },
        'Attempt submit_refill($12.40) with $10.00 limit (Expected: Blocked, No Confirmation)'
      );
    });
  }

  // 4. Simulate Prepare-Only Restriction (Submit Blocked)
  const btnPrepareOnly = document.getElementById('sim-prepare-only-flow');
  if (btnPrepareOnly) {
    btnPrepareOnly.addEventListener('click', async () => {
      state.activeContract = createAuthorityContract({
        authorizedPrescriptionIds: ['RX-001'],
        actionScope: 'prepare_only',
        maxSpendLimit: 30.00,
      });
      renderAuthorityContractControls();
      await updateContractFingerprintDisplay();

      if (agentStatusEl) {
        agentStatusEl.textContent = 'Simulating prepare-only flow (Step 1: prepare_refill)...';
        agentStatusEl.className = 'agent-status status-busy';
      }
      announce('Simulating prepare-only flow: Step 1 prepare_refill (allowed)');

      state.stagedRefillIds = ['RX-001'];
      const prepRes = await executeHandrailTool('prepare_refill', { prescriptionId: 'RX-001', quantity: 30, deliveryMethod: 'pickup' }, state.activeContract);
      renderRefillPreparation();
      renderTrustPanel();

      if (prepRes.success) {
        announce('Step 2: Attempting submit_refill under prepare-only scope (Expected: Blocked, No Confirmation)');
        runSimulatedAction(
          'submit_refill',
          { prescriptionIds: ['RX-001'], quantity: 30, deliveryMethod: 'pickup' },
          'Attempt submit_refill under prepare-only authority'
        );
      }
    });
  }

  // 5. Simulate Suspicious Security Trap (update_payment_method)
  const btnSuspiciousTrap = document.getElementById('sim-suspicious-trap-flow');
  if (btnSuspiciousTrap) {
    btnSuspiciousTrap.addEventListener('click', () => {
      runSimulatedAction(
        'update_payment_method',
        { cardNumber: '4111-2222-3333-4091', expiry: '12/28', cardType: 'Visa', billingZip: '90210' },
        'Trigger update_payment_method security trap (Expected: Gate 1 Trust Check Fails, No Confirmation)'
      );
    });
  }

  // =========================================================================
  // Individual Step Controls
  // =========================================================================

  // Search Medications
  const btnSearchMedications = document.getElementById('sim-search-medications');
  if (btnSearchMedications) {
    btnSearchMedications.addEventListener('click', () => {
      runSimulatedAction('search_medications', { status: 'all' }, 'Search all patient prescriptions (Read-Only)');
    });
  }

  // View Prescription Details (RX-001 Lisinopril)
  const btnViewLisinopril = document.getElementById('sim-view-details-lisinopril');
  if (btnViewLisinopril) {
    btnViewLisinopril.addEventListener('click', () => {
      state.selectedPrescriptionId = 'RX-001';
      renderPrescriptionDetails('RX-001');
      runSimulatedAction('view_prescription_details', { prescriptionId: 'RX-001' }, 'Inspect details for Lisinopril 10mg (RX-001)');
    });
  }

  // View Prescription Details (RX-003 Metformin)
  const btnViewMetformin = document.getElementById('sim-view-details-metformin');
  if (btnViewMetformin) {
    btnViewMetformin.addEventListener('click', () => {
      state.selectedPrescriptionId = 'RX-003';
      renderPrescriptionDetails('RX-003');
      runSimulatedAction('view_prescription_details', { prescriptionId: 'RX-003' }, 'Inspect details for Metformin 500mg (RX-003)');
    });
  }

  // Stage Lisinopril ($12.40 - RX-001)
  const btnStageLisinopril = document.getElementById('sim-stage-lisinopril');
  if (btnStageLisinopril) {
    btnStageLisinopril.addEventListener('click', () => {
      state.stagedRefillIds = ['RX-001'];
      renderPrescriptionList();
      runSimulatedAction('prepare_refill', { prescriptionId: 'RX-001', quantity: 30, deliveryMethod: 'pickup' }, 'Stage Lisinopril 10mg ($12.40)');
    });
  }

  // Stage Atorvastatin ($18.75 - RX-002)
  const btnStageAtorvastatin = document.getElementById('sim-stage-atorvastatin');
  if (btnStageAtorvastatin) {
    btnStageAtorvastatin.addEventListener('click', () => {
      state.stagedRefillIds = ['RX-002'];
      renderPrescriptionList();
      runSimulatedAction('prepare_refill', { prescriptionId: 'RX-002', quantity: 30, deliveryMethod: 'pickup' }, 'Stage Atorvastatin 20mg ($18.75)');
    });
  }

  // Submit Refill Order for Staged Items
  const btnSubmitAuthorized = document.getElementById('sim-submit-authorized');
  if (btnSubmitAuthorized) {
    btnSubmitAuthorized.addEventListener('click', () => {
      const itemsToSubmit = state.stagedRefillIds.length > 0 ? state.stagedRefillIds : ['RX-001'];
      runSimulatedAction('submit_refill', { prescriptionIds: itemsToSubmit, quantity: 30, deliveryMethod: 'pickup' }, `Submit refill order for ${itemsToSubmit.join(', ')}`);
    });
  }

  // Attempt Ineligible Rx (Metformin RX-003 - 0 refills)
  const btnSubmitIneligible = document.getElementById('sim-submit-ineligible');
  if (btnSubmitIneligible) {
    btnSubmitIneligible.addEventListener('click', () => {
      state.stagedRefillIds = ['RX-003'];
      renderPrescriptionList();
      runSimulatedAction('submit_refill', { prescriptionIds: ['RX-003'], quantity: 30, deliveryMethod: 'pickup' }, 'Submit Metformin (0 refills remaining)');
    });
  }

  // =========================================================================
  // Security Trap & Mid-Session Trust Simulations
  // =========================================================================

  // Unexpected tool registration (Mid-session trap demonstration)
  const btnUnexpectedReg = document.getElementById('sim-unexpected-registration');
  if (btnUnexpectedReg) {
    btnUnexpectedReg.addEventListener('click', () => {
      simulateSuspiciousRegistration('unexpected_payment');
      renderToolRegistryUI();
      runSimulatedAction(
        'update_payment_method',
        { cardNumber: '4111-2222-3333-4091', expiry: '12/28', cardType: 'Visa', billingZip: '90210' },
        'Simulate unexpected mid-session registration of update_payment_method'
      );
    });
  }

  // Unauthorized Action (Direct update_payment_method)
  const btnUnauthorized = document.getElementById('sim-unauthorized-action');
  if (btnUnauthorized) {
    btnUnauthorized.addEventListener('click', () => {
      runSimulatedAction(
        'update_payment_method',
        { cardNumber: '4111-2222-3333-4091', expiry: '12/28', cardType: 'Visa', billingZip: '90210' },
        'Attempt unpermitted payment method change (Security Trap Tool)'
      );
    });
  }

  // Squatted Tool Call (Separator: submit-refill)
  const btnSquatted = document.getElementById('sim-call-squatted-tool');
  if (btnSquatted) {
    btnSquatted.addEventListener('click', () => {
      simulateSuspiciousRegistration('typosquat_submit');
      renderToolRegistryUI();
      runSimulatedAction('submit-refill', { prescriptionIds: ['RX-001'], deliveryMethod: 'pickup' }, 'Simulate invoking separator squatted tool (submit-refill)');
    });
  }

  // Squatted Tool Call (Edit distance: submit_refil)
  const btnSquattedRefil = document.getElementById('sim-call-squatted-refil');
  if (btnSquattedRefil) {
    btnSquattedRefil.addEventListener('click', () => {
      simulateSuspiciousRegistration('typosquat_refil');
      renderToolRegistryUI();
      runSimulatedAction('submit_refil', { prescriptionId: 'RX-001', deliveryMethod: 'pickup' }, 'Simulate invoking typosquatted tool (submit_refil)');
    });
  }

  // Suffix Squatted Tool Call (submit_refill_v2)
  const btnSquattedV2 = document.getElementById('sim-call-squatted-v2');
  if (btnSquattedV2) {
    btnSquattedV2.addEventListener('click', () => {
      simulateSuspiciousRegistration('typosquat_v2');
      renderToolRegistryUI();
      runSimulatedAction('submit_refill_v2', { prescriptionId: 'RX-001', deliveryMethod: 'pickup' }, 'Simulate invoking suffix squatted tool (submit_refill_v2)');
    });
  }

  // Injected Description Tool (fast_refill_helper)
  const btnInjected = document.getElementById('sim-register-injected-tool');
  if (btnInjected) {
    btnInjected.addEventListener('click', () => {
      simulateSuspiciousRegistration('injection_desc');
      renderToolRegistryUI();
      runSimulatedAction('fast_refill_helper', { bypass: true }, 'Simulate invoking tool with prompt injection description');
    });
  }

  // Unknown Unregistered Tool
  const btnUnknown = document.getElementById('sim-call-unknown-tool');
  if (btnUnknown) {
    btnUnknown.addEventListener('click', () => {
      runSimulatedAction('unregistered_rogue_tool', { action: 'dump_database' }, 'Simulate invoking unknown unregistered mutating tool');
    });
  }

  // =========================================================================
  // Developer Utilities: Full Demo Reset & Raw Audit Modal
  // =========================================================================

  // Reset Full Demo State (Contract, Pharmacy, Tools, Stage)
  const btnResetDemoFull = document.getElementById('sim-reset-demo-full');
  if (btnResetDemoFull) {
    btnResetDemoFull.addEventListener('click', async () => {
      resetPharmacyState();
      toolRegistry.reset();
      state.activeContract = createAuthorityContract(DEFAULT_AUTHORITY_CONTRACT);
      state.stagedRefillIds = ['RX-001'];
      state.selectedPrescriptionId = 'RX-001';

      renderAuthorityContractControls();
      await updateContractFingerprintDisplay();
      renderPrescriptionList();
      renderPrescriptionDetails('RX-001');
      renderRefillPreparation();
      renderReceiptUI();
      renderTrustPanel();
      renderToolRegistryUI();

      if (agentStatusEl) {
        agentStatusEl.textContent = 'Demo state reset to clean defaults.';
        agentStatusEl.className = 'agent-status status-idle';
      }

      logAuditEvent({
        toolName: 'reset_demo_state',
        action: 'reset_demo_state',
        decision: 'allowed',
        reason: 'Developer reset demo state: pharmacy database, tool registry, and authority contract restored to defaults.',
        userAuthorized: { ...state.activeContract },
        whatHappened: 'Human developer reset the Handrail demo state to baseline.',
        result: { status: 'reset' },
      });

      announce('Full demo state successfully reset to defaults.');
    });
  }

  // Reset Registry to Baseline Only
  const btnResetRegistry = document.getElementById('sim-reset-registry');
  if (btnResetRegistry) {
    btnResetRegistry.addEventListener('click', () => {
      toolRegistry.reset();
      renderToolRegistryUI();
      announce('WebMCP Tool Registry reset to 5 baseline tools.');
    });
  }

  // View Raw Audit Events (JSON Dialog)
  const btnViewRawAudit = document.getElementById('dev-view-raw-audit-btn');
  const rawAuditDialog = document.getElementById('raw-audit-dialog');
  const rawAuditCode = document.getElementById('raw-audit-json-code');
  const copyRawAuditBtn = document.getElementById('copy-raw-audit-btn');
  const downloadRawAuditBtn = document.getElementById('download-raw-audit-btn');
  const closeRawAuditBtn = document.getElementById('close-raw-audit-btn');
  const copyStatusMsg = document.getElementById('copy-status-msg');

  function openRawAuditViewer() {
    if (!rawAuditDialog) return;
    const logs = getAuditLogs();
    if (rawAuditCode) {
      rawAuditCode.textContent = JSON.stringify(logs, null, 2);
    }
    if (copyStatusMsg) copyStatusMsg.textContent = '';
    rawAuditDialog.showModal();
    if (closeRawAuditBtn) closeRawAuditBtn.focus();
    announce('Opened raw audit events JSON inspector dialog.');
  }

  if (btnViewRawAudit) {
    btnViewRawAudit.addEventListener('click', openRawAuditViewer);
  }

  if (closeRawAuditBtn && rawAuditDialog) {
    closeRawAuditBtn.addEventListener('click', () => {
      rawAuditDialog.close();
      announce('Closed raw audit events dialog.');
    });
  }

  if (copyRawAuditBtn) {
    copyRawAuditBtn.addEventListener('click', async () => {
      const logsJson = JSON.stringify(getAuditLogs(), null, 2);
      try {
        await navigator.clipboard.writeText(logsJson);
        if (copyStatusMsg) {
          copyStatusMsg.textContent = 'JSON copied to clipboard!';
          copyStatusMsg.style.color = 'var(--color-success)';
        }
        announce('Audit events JSON copied to clipboard.');
      } catch (err) {
        if (copyStatusMsg) {
          copyStatusMsg.textContent = 'Failed to copy to clipboard.';
          copyStatusMsg.style.color = 'var(--color-danger)';
        }
      }
    });
  }

  if (downloadRawAuditBtn) {
    downloadRawAuditBtn.addEventListener('click', () => {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(exportAuditLogsAsJSON());
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `handrail-audit-log-${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      announce('Audit log JSON download initiated.');
    });
  }
}

/**
 * Binds Audit Log control buttons and filters.
 */
function bindAuditControls() {
  const clearBtn = document.getElementById('clear-audit-btn');
  const exportBtn = document.getElementById('export-audit-btn');
  const filterButtons = document.querySelectorAll('.audit-filter-group .btn-filter');

  if (filterButtons.length > 0) {
    filterButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const filterValue = btn.getAttribute('data-filter') || 'all';
        filterButtons.forEach((b) => {
          b.classList.remove('filter-active');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('filter-active');
        btn.setAttribute('aria-pressed', 'true');
        setAuditFilter(filterValue);
        announce(`Filtered audit log by ${filterValue}`);
      });
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      clearAuditLogs();
      announce('Audit log cleared.');
    });
  }

  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(exportAuditLogsAsJSON());
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `handrail-audit-log-${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      announce('Audit log JSON export initiated.');
    });
  }
}

/**
 * Binds the Test Suite Runner.
 */
function bindTestRunner() {
  const runBtn = document.getElementById('run-tests-btn');
  const resultsContainer = document.getElementById('test-results-container');

  if (runBtn && resultsContainer) {
    runBtn.addEventListener('click', async () => {
      runBtn.disabled = true;
      runBtn.textContent = 'Running Tests...';
      resultsContainer.innerHTML = '<p class="test-running-notice" role="status">Executing Handrail deterministic test suite...</p>';
      announce('Executing Handrail test suite.');

      const testRun = await runAllAuthorityTests();

      const itemsHtml = testRun.results.map((t) => `
        <li class="test-item ${t.passed ? 'test-passed' : 'test-failed'}">
          <span class="test-indicator" aria-hidden="true">${t.passed ? '✓' : '✗'}</span>
          <div class="test-info">
            <strong>${t.name}</strong>
            <span class="test-detail">${t.message}</span>
          </div>
          <span class="test-badge ${t.passed ? 'badge-pass' : 'badge-fail'}">
            ${t.passed ? 'PASSED' : 'FAILED'}
          </span>
        </li>
      `).join('');

      resultsContainer.innerHTML = `
        <div class="test-summary-header">
          <strong>Test Run Completed:</strong>
          <span>${testRun.passed}/${testRun.total} Passed (${testRun.failed} Failed)</span>
        </div>
        <ul class="test-results-list" aria-label="Test Suite Results">
          ${itemsHtml}
        </ul>
      `;

      runBtn.disabled = false;
      runBtn.textContent = 'Run Test Suite Again';
      announce(`Test suite completed: ${testRun.passed} of ${testRun.total} passed.`);
    });
  }
}

window.handrail = {
  callTool: callNativeTool,
  getTools: () => (document.modelContext?.getTools ? document.modelContext.getTools() : Promise.resolve([])),
  getAuditLogs: getAuditLogs,
};
