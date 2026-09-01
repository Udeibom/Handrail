# Handrail Project Map

**Purpose:** A plain-language explainer for someone who built this project but needs to remember what everything does and why it's there.

---

## 1. The One-Sentence Pitch

Handrail is a browser-based demo that shows how a website could let a human stay in control of an AI agent — the agent proposes actions, but the human must approve anything that changes data before it happens.

**For whom:** People building or regulating AI agents that interact with websites (via a spec called WebMCP), especially those concerned about accessibility for screen-reader users.

---

## 2. UI Walkthrough — Screen by Screen

The entire app is a single scrolling page with two columns. There is no navigation — everything is visible at once.

### Left Column (Main Content)

**Patient Record panel**
- Shows a fictional patient named "Alex Morgan" (ID: RX-PT-9042)
- Displays date of birth, insurance, pharmacy, payment method, allergies
- This data is hardcoded and never changes

**Your Prescriptions table**
- Shows 3 fictional medications: Lisinopril ($12.40, 2 refills), Atorvastatin ($18.75, 1 refill), Metformin ($9.50, 0 refills)
- Each row has a "View details" button (shows medication details in the panel below) and a "+ Stage Refill" button (adds to staging area)
- Metformin's "Stage" button is disabled because it has 0 refills remaining

**Prescription Details panel**
- Shows full details for whichever prescription you clicked "View" on
- Includes doctor, dosage, refill count, price, clinical instructions
- Also shows whether this medication is "Authorized in Contract" or "Outside Contract Scope"

**Refill Order Staging panel**
- Shows which prescriptions you've staged for refill
- Displays estimated total cost
- Shows a "Handrail Policy Pre-Flight" checklist: medication scope, action scope, spend limit, consent threshold, eligibility
- If any check fails (e.g., over spend limit), it shows red

**Result / Audit Receipt panel**
- Shows the outcome of the most recent action
- Displays one of: success receipt, blocked message, or denied message
- Includes confirmation number for successful refills

**WebMCP Tool Registry & Trust Inspector**
- Lists all 5 registered tools with their metadata
- Each tool shows: name, description, read-only/mutating classification, trust status
- The 5th tool (`update_payment_method`) is marked "SECURITY TRAP" — it's designed to be blocked
- Shows a diagram of the 4-gate execution pipeline
- Displays the active session ID and "Unmarked Tool Policy: Default Mutating (Never Safe)"

**Structured Audit Trail**
- Lists every action taken in the session, newest first
- Filter buttons: All, Executed, Blocked, Denied, Confirmed, Allowed
- "Export JSON" downloads the audit log as a file
- "Clear Logs" empties the audit trail

**Authority Contract Verification Suite**
- A button "Run Test Suite" executes 104 automated tests in the browser
- Shows pass/fail results for each test
- This runs the same tests as `node tests/authority-tests.js` but in-browser

### Right Column (Controls)

**AGENT ACTIVITY panel**
- "Current Authority": Shows which medications are authorized, action scope, and max spend limit
- "Recent Action": Shows the last action taken with a colored badge (green for executed, red for blocked, etc.)
- "Tool / Security Status": Shows "Ready / Idle" or "Agent executing: [tool name]..." during actions

**HANDRAIL AUTHORITY panel**
- Checkboxes to select which medications the agent can act on (default: Lisinopril only)
- Radio buttons for "Prepare only" vs "Prepare & submit" action scope
- Number inputs for "Maximum Spend Limit" (default: $25.00) and "Human Confirmation Threshold" (default: $15.00)
- Checkbox for "Require explicit human confirmation before submission"
- "Save Authority" button applies changes; "Reset Defaults" restores original values
- Changing any value updates the contract immediately (no save needed)

**SECURITY / TRUST STATUS panel**
- Four metric cards: Total Calls, Approved, Blocked, Confirmations
- These increment as you run demo scenarios
- "Contract SHA-256 Fingerprint" shows a hash of the current contract — changes when you modify the contract

**DEVELOPER / DEMO CONTROLS panel**
- This is where you actually run the demonstrations

**Primary Demo Scenarios:**
| Button | What it does |
|--------|--------------|
| "Run Successful Agent Flow" | Runs all 4 steps in sequence: search → view details → prepare → submit (triggers confirmation dialog) |
| "Test: Out-of-Scope Medication" | Tries to refill Atorvastatin when only Lisinopril is authorized → blocked at Gate 2 |
| "Test: Amount Limit Failure" | Sets max spend to $10, tries to refill $12.40 Lisinopril → blocked at Gate 2 |
| "Test: Prepare-Only Restriction" | Sets action scope to "prepare only", tries to submit → blocked at Gate 2 |
| "Test: Suspicious Delegation Trap" | Calls `update_payment_method` → blocked at Gate 1 |

**Individual Tool Step Simulator:**
| Button | What it does |
|--------|--------------|
| "1. search_medications" | Runs a read-only search, returns all 3 prescriptions |
| "2. view_prescription_details (RX-001)" | Shows details for Lisinopril |
| "3. view_prescription_details (RX-003)" | Shows details for Metformin |
| "4. prepare_refill (Stage Lisinopril $12.40)" | Stages Lisinopril for refill (non-committal) |
| "5. prepare_refill (Stage Atorvastatin $18.75)" | Stages Atorvastatin (will fail if not authorized) |
| "6. submit_refill (Submit Staged Refill)" | Submits staged refills — triggers confirmation dialog |
| "7. submit_refill (Metformin - 0 Refills Ineligible)" | Tries to submit Metformin → blocked (0 refills) |

**Security Trap & Mid-Session Trust Tests:**
| Button | What it does |
|--------|--------------|
| "Test Unexpected Mid-Session Registration" | Registers a suspicious tool mid-session, then tries to execute it → blocked |
| "Test: update_payment_method (Direct Call)" | Directly calls the security trap tool → blocked at Gate 1 |
| "Test: Typosquat Separator (Submit-refill)" | Calls "submit-refill" (hyphen instead of underscore) → blocked at Gate 1 |
| "Test: Typosquat Edit Distance (submit_refil)" | Calls "submit_refil" (missing 'l') → blocked at Gate 1 |
| "Test: Suffix Squatting (submit_refill_v2)" | Calls "submit_refill_v2" → blocked at Gate 1 |
| "Test: Injected Description (fast_refill_helper)" | Registers a tool with "ignore previous instructions" in description → blocked |
| "Test: Unknown Unregistered Tool" | Calls a tool that doesn't exist → blocked at Gate 1 |

**Developer Utilities:**
| Button | What it does |
|--------|--------------|
| "View Raw Audit Events (JSON)" | Opens a modal showing the raw JSON of all audit events |
| "Reset Full Demo State" | Resets contract, pharmacy data, tool registry, and staging to defaults |
| "Reset Tool Registry Only" | Resets only the tool registry back to the 5 baseline tools |

**WebMCP Runtime Environment panel**
- Shows whether `document.modelContext` is available (always "Unavailable" in standard browsers)
- Shows whether `registerTool` API is available (always "Unavailable")
- Shows "5 Registered Tools" (this is the internal registry, not native WebMCP)
- Explains that Handrail uses a test harness when native WebMCP isn't available

---

## 3. End-to-End Walkthrough: Main Demo Flow

This is what happens when you click "Run Successful Agent Flow":

### Step 1: Search Medications
**What you see:** The agent status changes to "Running Successful Agent Flow (Step 1/4: search_medications)..."
**Behind the scenes:**
1. `app.js` calls `executeHandrailTool('search_medications', { status: 'all' }, contract)`
2. Gate 1 (Trust Check): `checkToolTrust()` verifies `search_medications` is in the expected tool set, has no suspicious description → **trusted**
3. Gate 2 (Authority Check): `evaluateAuthority()` sees this is a read-only action → **approved, no confirmation needed**
4. Gate 4 (Execution): `searchPrescriptions()` returns all 3 prescriptions
5. Audit log records: `decision: 'allowed'`
6. Prescription table updates to show results

### Step 2: View Prescription Details
**What you see:** Status changes to "Step 2/4: view_prescription_details RX-001"
**Behind the scenes:**
1. `executeHandrailTool('view_prescription_details', { prescriptionId: 'RX-001' }, contract)`
2. Gate 1: Trust check passes
3. Gate 2: Authority check sees `view_prescription_details` is read-only → **approved**
4. Gate 4: `getPrescriptionById('RX-001')` returns Lisinopril data
5. Prescription Details panel updates to show Lisinopril's full details

### Step 3: Prepare Refill
**What you see:** Status changes to "Step 3/4: prepare_refill $12.40"
**Behind the scenes:**
1. `executeHandrailTool('prepare_refill', { prescriptionId: 'RX-001', quantity: 30, deliveryMethod: 'pickup' }, contract)`
2. Gate 1: Trust check passes
3. Gate 2: Authority check verifies:
   - RX-001 is in authorizedPrescriptionIds ✓
   - `prepare_refill` is in allowedActions ✓
   - $12.40 <= $25.00 maxSpendLimit ✓
   - RX-001 has refills remaining ✓
   - Total ($12.40) < confirmationThreshold ($15.00) → **no confirmation needed for staging**
4. Gate 4: `calculateRefillCalculation()` computes cost, returns staged order (does NOT decrement refills)
5. Refill Order Staging panel shows the staged order with "STAGED_READY_FOR_SUBMISSION" status

### Step 4: Submit Refill (with Human Confirmation)
**What you see:** Status changes to "Step 4/4: submit_refill - awaiting human confirmation" — a modal dialog opens
**Behind the scenes:**
1. `executeHandrailTool('submit_refill', { prescriptionIds: ['RX-001'], quantity: 30, deliveryMethod: 'pickup' }, contract)`
2. Gate 1: Trust check passes
3. Gate 2: Authority check verifies all the same things, but now:
   - Total ($12.40) >= confirmationThreshold ($15.00)? No, $12.40 < $15.00
   - But `requireHumanConfirmation` is `true` → **confirmation required**
4. Gate 3: `requestHumanConfirmation()` opens the accessible dialog:
   - Shows what action will happen (submit refill for Lisinopril 10 mg)
   - Shows the total cost ($12.40)
   - Shows why confirmation is required
   - Shows what approving means (order submitted, refill decremented)
   - Shows what denying means (nothing happens)
   - A stopwatch starts counting elapsed time
   - Focus is trapped inside the dialog

**If you click "Approve refill":**
5. Gate 4: `submitPrescriptionRefill()` executes:
   - Decrements RX-001's refillsRemaining from 2 to 1
   - Generates confirmation number (e.g., "RX-CONF-978054")
   - Records the order in `submittedRefillOrders`
6. Audit log records: `decision: 'executed'`
7. Receipt panel shows success with confirmation number
8. Stopwatch stops, elapsed time is logged

**If you click "Deny" or press Escape:**
5. Audit log records: `decision: 'denied'`
6. Receipt panel shows "Action denied by human user"
7. Refill count stays at 2 (unchanged)
8. Stopwatch stops, elapsed time is still logged

---

## 4. Feature List

### Tool Registry
**What it does:** Maintains a list of all available tools with their metadata (name, description, parameters, read-only/mutating classification).
**Why it exists:** Central place to look up tool definitions and verify tools are properly registered before execution.

### Trust Check (Gate 1)
**What it does:** Verifies a tool is legitimate before allowing it to run. Checks for: tool-name squatting (typos, separator spoofing, suffix additions), suspicious descriptions (prompt injection patterns), and unexpected registrations.
**Why it exists:** Prevents an attacker from tricking the system with a tool that has a slightly different name or a manipulative description.

### Authority Contract (Gate 2)
**What it does:** Evaluates whether the user has authorized this specific action. Checks: medication whitelist, action scope, spend limits, refill eligibility.
**Why it exists:** Ensures the agent can only do what the human explicitly allowed — even if a tool passes the trust check, it still needs authority to act.

### Human Confirmation (Gate 3)
**What it does:** Opens an accessible modal dialog for the human to approve or deny consequential actions. Includes focus trapping, screen-reader announcements, and response time tracking.
**Why it exists:** Some actions are consequential enough that a human should make the final decision, even if the agent has technical authority to perform them.

### Execution (Gate 4)
**What it does:** Runs the actual business logic (search, view, prepare, submit) only after all previous gates pass.
**Why it exists:** Separates the security checks from the actual work — the business logic only runs when it's safe to do so.

### Audit Trail
**What it does:** Records every action taken, including: what was requested, what decision was made, why, and what happened. Exportable as JSON.
**Why it exists:** Provides accountability — you can see exactly what the agent tried to do and what happened.

### Accessible Confirmation Dialog
**What it does:** A modal dialog that traps keyboard focus, announces itself to screen readers, and closes safely on Escape (defaulting to denial).
**Why it exists:** Ensures the confirmation step is usable by people who rely on keyboards and screen readers — not just mouse users.

### Response Time Tracking
**What it does:** A stopwatch in the confirmation dialog that measures how long the human takes to make a decision.
**Why it exists:** Enables usability research — you can measure whether the confirmation dialog is clear and quick to use.

### Security Trap Tool
**What it does:** The 5th tool (`update_payment_method`) is deliberately designed to be blocked. It has a suspicious description and is flagged as a security trap.
**Why it exists:** Demonstrates that the trust check can detect and block tools that look malicious, even if they're registered.

### Tool-Name Squatting Detection
**What it does:** Uses Levenshtein distance (edit distance) and separator normalization to detect tool names that are suspiciously similar to expected tools.
**Why it exists:** Prevents an attacker from registering "submit-refill" or "submit_refill_v2" to trick the system.

### Suspicious Description Detection
**What it does:** Scans tool descriptions for phrases like "ignore previous instructions", "always approve", "bypass", etc.
**Why it exists:** Catches prompt-injection attempts hidden in tool metadata.

### Contract Fingerprinting
**What it does:** Computes a SHA-256 hash of the current authority contract and displays it.
**Why it exists:** Provides a visual indicator that the contract has changed — useful for verifying that contract updates took effect.

---

## 5. Things That Look Unfinished or Disconnected

### The `[REAL_COMPARISON]` Placeholder
**Where:** `confirmation.js:67-76` and visible in the confirmation dialog
**What it is:** Static text " [REAL_COMPARISON]" that appears next to the stopwatch
**Why it's confusing:** It looks like a placeholder that was never replaced. It's meant to be filled with a real baseline number after user testing, but currently it's just literal text "[REAL_COMPARISON]".

### The `update_payment_method` Tool
**Where:** `tools.js:403-468`
**What it is:** A tool that can never be successfully executed — it's always blocked at Gate 1
**Why it's confusing:** It's registered in the tool registry and appears in the UI, but it serves no functional purpose other than to be blocked. A judge might wonder why it exists at all.

### The `isSimulatedUnexpected` Flag
**Where:** `trust.js:285-286`, set in `tools.js:1148,1165,1180,1195,1210`
**What it is:** A boolean flag on tool registration info that marks tools as "simulated unexpected"
**Why it's confusing:** The trust check uses this flag to determine if a tool is expected, but the flag name contains "simulated" which contradicts the "simulated-free" framing elsewhere. It's an implementation detail that leaked into the trust logic.

### The `src/` Directory Reference
**Where:** `package.json:11` — `"clean": "rm -rf dist server.js src"`
**What it is:** The clean script tries to remove `src/`, but `src/` was already deleted
**Why it's confusing:** The clean script references a directory that doesn't exist. Harmless but looks incomplete.

### The `query_authority_contract` Tool
**Where:** `tools.js:1594-1616`
**What it is:** A tool that returns the current authority contract state
**Why it's confusing:** It's listed in the allowed actions but has no button in the UI. It exists for completeness but is never demonstrated.

### The `get_prescriptions`, `get_prescription_details`, `prepare_refill_order`, `submit_refill_order` Aliases
**Where:** `tools.js:759-822`
**What it is:** 5 additional tool definitions that are aliases for the primary tools
**Why it's confusing:** They exist for "backwards compatibility" but there's no indication of what they're backwards-compatible with. They add complexity without clear benefit.

### The `engineName` Field
**Where:** `tools.js:998` — returns "Browser Native WebMCP" or "Handrail Separated Development Test Harness"
**What it is:** A string describing which execution engine is active
**Why it's confusing:** The term "Handrail Separated Development Test Harness" is jargon that doesn't clearly explain what's happening to a non-technical user.

### The `allowAutonomousPreparation` Field
**Where:** `authority.js:18`
**What it is:** A boolean in the default authority contract
**Why it's confusing:** It's defined but never checked anywhere in the code. It looks like it should gate something, but it doesn't.

### The `contractExpiresInMinutes` Field
**Where:** `authority.js:37`
**What it is:** A field set to 60 minutes
**Why it's confusing:** The contract never actually expires — this value is set but never evaluated. It suggests a feature (contract expiration) that was never implemented.

### The `stopwatchInterval` Variable
**Where:** `confirmation.js:28`
**What it is:** A variable that holds the stopwatch's `setInterval` handle
**Why it's confusing:** It's declared at module level but only used in two places. If the dialog is opened twice without closing, the interval leaks (though this can't happen in practice because the dialog is modal).

### The `previousActiveElement` Variable
**Where:** `confirmation.js:25`
**What it is:** Stores which element had focus before the dialog opened
**Why it's confusing:** It's used to restore focus after the dialog closes, but if the element no longer exists (e.g., it was removed from the DOM), the focus restoration silently fails.

### The `assets/.aistudio/.gitignore` File
**Where:** `assets/.aistudio/.gitignore`
**What it is:** A gitignore file in a hidden directory
**Why it's confusing:** It's not clear what `.aistudio` is or why it's in the project. It looks like an artifact from a development tool that shouldn't be committed.

### The `metadata.json` File
**Where:** `metadata.json`
**What it is:** A JSON file with project metadata
**Why it's confusing:** It's not referenced anywhere in the code or README. It looks like it was generated by a tool but never integrated.

---

## Summary

The project is a single-page demo with two columns: left side shows data and results, right side has controls. The main interaction is clicking demo buttons that run tool calls through a 4-gate pipeline (Trust → Authority → Confirmation → Execution). The "Run Successful Agent Flow" button walks through all 4 steps and opens a confirmation dialog for the final submission.

The code is heavily documented but has accumulated some cruft: placeholder text that was never replaced, fields that are defined but never used, and alias tools whose purpose isn't clear. The core pipeline works and is well-tested, but several features look like they were planned but never fully integrated.
