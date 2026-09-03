# Handrail — WebMCP Human Consent & Authority Layer

> **An accessibility-first deterministic authority, tool-trust, and human-consent layer for AI agents invoking WebMCP tools on behalf of screen-reader and keyboard-only users.**

---

## The Idea

WebMCP gives AI agents hands. Handrail gives people a say in what those hands are allowed to do.

As websites expose structured tools directly to agents, delegation becomes dramatically more powerful -- but capability is not the same thing as authority. Handrail is an accessibility-first human authority layer for WebMCP: users define deterministic boundaries on what an agent may do, Handrail verifies every invocation against those boundaries, suspicious tools are blocked before they ever reach the user, and consequential actions pause for accessible human approval.

The RefillRx prescription portal is the demonstration environment -- proof that an agent can search, inspect, and prepare refills, but cannot silently exceed the authority a human granted it.

---

## Overview

**Handrail** is an open-source human-control layer for web-based autonomous AI agents. It has zero runtime dependencies — no React, no Angular, no frontend framework. The entire application is vanilla HTML, CSS, and JavaScript ES modules.

As AI agents gain the ability to interact directly with web applications via **WebMCP** (Web Model Context Protocol — a browser standard exposing `document.modelContext` for structured tool invocation), users—especially those who rely on screen readers and keyboard navigation—require transparent, reliable, and accessible safeguards against unintended, out-of-scope, or malicious tool invocations.

In this demonstration, Handrail is deployed on **RefillRx**, a fictional accessible patient prescription portal (all data is synthetic). Users establish a structured **Authority Contract** specifying allowed medications, permitted action scopes, and maximum spending limits. Before any WebMCP tool executes, Handrail deterministically checks tool trust and evaluates authority boundaries, presenting an accessible confirmation dialog whenever a consequential action is requested.

---

## The Problem

### The Accessibility and Control Gap
Autonomous AI agents can execute multi-step workflows rapidly, invoking browser tools, managing accounts, and placing orders. However:

1. **Lack of User Agency for Assistive Tech Users**: Screen-reader and keyboard-only users often cannot perceive rapid background agent actions in real time. Without an explicit, accessible control boundary, an agent could perform irreversible financial or medical actions without the user's informed consent.
2. **WebMCP Provides Semantics, Not Policy**: WebMCP (`document.modelContext.registerTool`) allows websites to expose structured APIs and schema metadata to AI models. While WebMCP standardizes *how* tools are invoked, it does **not** provide an authorization contract, spend-limit bounds, tool-trust heuristic, or accessible human confirmation gate.
3. **The Confirmation Fallacy**: Presenting confirmation dialogs for *every* action leads to cognitive overload and approval fatigue, while failing to verify authority bounds beforehand allows malicious or out-of-scope agent requests to harass the user.

---

## The Solution

I grew up with a simple idea of what it means to help someone: when you see someone struggling, you step in. But there's a line between helping and deciding for them -- and that line gets easy to cross once the "helper" is an AI agent that can act in seconds, faster than a person can watch.

Picture yourself managing something important through an agent -- trusting it to search, decide, and act on your behalf and asking: at what point did I stop delegating a task and start surrendering control of the outcome?

Handrail is my answer: delegate the task, keep the authority. A handrail doesn't climb the stairs for you, and it doesn't stop you from climbing. It's just there when you need something to hold onto. That's what this is for agentic computing.

Handrail introduces a 4-layer defense-in-depth model coupled with accessible confirmation and structured provenance receipts:

```
                      +------------------------------------------+
                      |         WebMCP Tool Invocation           |
                      +------------------------------------------+
                                           |
                                           v
                      +------------------------------------------+
                      |     Gate 1: Tool-Trust Check             |
                      |     (Squatting, Injections, Traps)       |
                      +------------------------------------------+
                                           |
                                           v
                      +------------------------------------------+
                      |     Gate 2: Deterministic Authority      |
                      |     (Medication Scope, Spend Caps)       |
                      +------------------------------------------+
                                           |
                                           v
                      +------------------------------------------+
                      |     Gate 3: Accessible Confirmation      |
                      |     (Only if Authorized + Consequential) |
                      +------------------------------------------+
                                           |
                                           v
                      +------------------------------------------+
                      |     Gate 4: Stateful Execution           |
                      |     (Pharmacy Order Placement)           |
                      +------------------------------------------+
                                           |
                                           v
                      +------------------------------------------+
                      |     Result / Audit Receipt               |
                      |     (Structured 5-Facet Provenance)      |
                      +------------------------------------------+
```

### The 4 Core Layers:

1. **Tool Registration & Classification**: Tools are registered with explicit metadata (`name`, `description`, `inputSchema`, `readOnlyHint`). Read-only operations (`readOnlyHint: true`) are separated from mutating/consequential operations (`readOnlyHint: false`).
2. **Authority Contract**: A user-authored, immutable policy configuration defining:
   - `authorizedPrescriptionIds`: Whitelist of permitted medications (e.g., `["RX-001"]`).
   - `actionScope`: Permitted operational level (`prepare_only` vs. `prepare_and_submit`).
   - `maxSpendLimit`: Hard financial ceiling in USD.
   - `requireHumanConfirmation`: Boolean enforcing human confirmation before final submission.
   - `confirmationThreshold`: Dollar amount above which confirmation is mandatory.
3. **Deterministic Authority Check**: A mathematical, zero-hallucination policy evaluator (`evaluateAuthority`) that verifies tool arguments directly against the contract.
4. **Tool-Trust Check**: Gate 1 heuristic (`checkToolTrust`) detecting tool-name squatting (Levenshtein distance, hyphen/casing variations), instruction-like prompt injections in descriptions, and unexpected mid-session tool registrations.

### Accessible Human Confirmation
When an action is authorized and consequential, Handrail halts execution and opens a modal `<dialog role="alertdialog">` with strict keyboard focus trapping, high-contrast labels, non-color visual badges, and screen-reader announcements.

**Response Time Tracking**: The confirmation dialog includes a small stopwatch that starts when the dialog opens and stops when the user approves or denies. The elapsed time (in seconds) is included in the confirmation result as `responseTimeSeconds`, enabling measurement of human response times for usability research. The stopwatch is `aria-hidden` so it does not interfere with screen reader announcements.

### Structured Audit Receipt
Every decision generates an immutable audit record capturing 5 distinct provenance facets:
1. **User Authorized**: Exact contract snapshot at execution time.
2. **Agent Requested**: Structured arguments passed by the AI agent.
3. **Handrail Decided**: Deterministic verdict (`ALLOWED`, `BLOCKED`, `CONFIRMED`, `DENIED`, `EXECUTED`).
4. **What Happened**: Human-readable narrative explanation.
5. **Final Result**: Structured output data, transaction ID, or failure reason.

---

## Security Model & Policy Execution

### Linear Gate Ordering
Execution follows a strict linear pipeline:
$$\text{Trust Check (Gate 1)} \longrightarrow \text{Authority Check (Gate 2)} \longrightarrow \text{Human Confirmation (Gate 3)} \longrightarrow \text{Execution (Gate 4)}$$

> **Defaults-to-Safe Principle**: Gate 1 runs before Gate 2 and Gate 3. A suspicious, squatted, or untrusted tool defaults to safe immediately and **NEVER reaches the human confirmation dialog**.

### Policy Decision Matrix

| Condition | Gate | Verdict | Outcome | Confirmation Dialog? |
| :--- | :--- | :--- | :--- | :--- |
| **Untrusted / Squatted Tool** | Gate 1 | `BLOCKED` | Halted immediately (`UNTRUSTED_NAME_SQUATTING`) | **No (Never)** |
| **Prompt Injection in Description** | Gate 1 | `BLOCKED` | Halted immediately (`UNTRUSTED_INSTRUCTION_DESCRIPTION`) | **No (Never)** |
| **Out-of-Scope Medication** | Gate 2 | `BLOCKED` | Halted immediately (`BLOCKED_UNAUTHORIZED_RX`) | **No** |
| **Action Scope Disallowed (`prepare_only`)**| Gate 2 | `BLOCKED` | Halted immediately (`BLOCKED_UNAUTHORIZED_ACTION`) | **No** |
| **Spend Limit Exceeded ($ > Max)** | Gate 2 | `BLOCKED` | Halted immediately (`BLOCKED_SPEND_LIMIT`) | **No** |
| **Ineligible Medication (0 Refills)** | Gate 2 | `BLOCKED` | Halted immediately (`BLOCKED_INELIGIBLE_RX`) | **No** |
| **Authorized Read-Only** | Gate 2 &rarr; 4 | `ALLOWED` | Executed immediately, data returned | **No** |
| **Authorized Consequential Mutation** | Gate 2 &rarr; 3 &rarr; 4 | `CONFIRMED` | Awaits user approval; executes on approval, aborts on denial | **Yes (Accessible Modal)** |

### Critical Security Rule:
> **Confirmation does not grant authority.**  
> Human confirmation only verifies a consequential action that is **already strictly within the Authority Contract**. If an agent attempts an unauthorized action, Handrail defaults to safe at Gate 2 without prompting the user.

---

## WebMCP Tools

Handrail registers **five primary WebMCP tools** via `document.modelContext.registerTool()`. The tool registry also maintains five internal aliases that normalize to primary names — these are not registered natively and exist only for name-resolution safety.

### 1. `search_medications`
- **Purpose**: Search the patient's active medication catalog by name or condition.
- **Classification**: Read-Only (`readOnlyHint: true`).
- **Security Behavior**: Executes unconditionally across active records. Does not mutate pharmacy state.

### 2. `view_prescription_details`
- **Purpose**: Retrieve clinical instructions, dosage, copay pricing, and refill counts for a specific prescription ID.
- **Classification**: Read-Only (`readOnlyHint: true`).
- **Security Behavior**: Executes unconditionally. Returns detailed medication metadata.

### 3. `prepare_refill`
- **Purpose**: Pre-calculates order totals and copays, validating parameters without committing changes.
- **Classification**: Non-Committal Staging (`readOnlyHint: false`, non-committal).
- **Security Behavior**: Evaluates Gate 1 (Trust) and Gate 2 (Authority). Verifies the prescription ID is in the user's authorized contract and within spend caps. Does **not** decrement refills or submit orders.

### 4. `submit_refill`
- **Purpose**: Submits a finalized prescription refill order to the pharmacy.
- **Classification**: Consequential Mutating (`readOnlyHint: false`, mutating).
- **Security Behavior**: Evaluates Gate 1 (Trust), Gate 2 (Authority), and Gate 3 (Human Confirmation). If approved by the human, decrements refills remaining, commits the order, and issues a confirmation receipt. Preserves exact state invariance if denied or blocked.

### 5. `update_payment_method`
- **Purpose**: Deliberately registered security trap simulating an agent attempting to modify financial credentials or payment accounts.
- **Classification**: High-Risk Security Trap (`readOnlyHint: false`).
- **Security Behavior**: Fails closed at Gate 1 (`UNTRUSTED_INSTRUCTION_DESCRIPTION` / `BLOCKED_SECURITY_TRAP`). Never reaches the user confirmation dialog.

---

## Accessibility (a11y) Implementation

RefillRx and Handrail are engineered from the ground up for full accessibility compliance:

- **Semantic HTML5 Landmarks**: Strict structure using `<header role="banner">`, `<main role="main">`, `<aside>`, `<section>`, and `<footer>`.
- **Keyboard Navigation**: All interactive elements are reachable via `Tab` / `Shift+Tab` and actionable with `Enter` or `Space`. No mouse-only interactions.
- **High-Contrast Visible Focus**: Explicit `:focus-visible` outline rings (`3px solid #0284c7` with `2px` offset) ensuring clear keyboard focus visibility.
- **Accessible Confirmation Modal**:
  - Implemented using native `<dialog role="alertdialog">` with `aria-modal="true"`.
  - Accessible name (`aria-labelledby="dialog-title"`) and description (`aria-describedby="dialog-description"`).
  - Strict **focus trapping** keeping Tab focus inside the active dialog.
  - Closes safely on `Escape` key, defaulting to a denial that keeps you safe.
  - Automatically restores focus to the invoking element upon closure.
 - **Live-Region Announcements**: `aria-live="polite"` and `aria-live="assertive"` regions announce status changes, agent execution results, and policy decisions to screen readers in real time.
- **No Color-Only State Indicators**: Statuses (`ALLOWED`, `BLOCKED`, `DENIED`, `CONFIRMED`, `EXECUTED`) always combine text tags, structural badges, and unicode symbols so information is never conveyed by color alone.
- **Reduced Motion**: Respects `prefers-reduced-motion: reduce` by disabling non-essential transitions and animations.

---

## Testing & Verification

### Automated Test Suites
Handrail includes comprehensive, dependency-free automated test suites running directly on Node.js or in the browser:

```bash
# Run 4-gate consent and defaults-to-safe test suite (39 assertions)
node tests/security-suite.js

# Run full authority, policy, and contract test suite (104 assertions)
node tests/authority-tests.js
```

### Manual Interactive Test Scenarios

You can verify all security flows directly in the UI using the **Demo Scenarios** panel:

1. **Successful Flow (Lisinopril $12.40)**:
    - Click **"Run Successful Agent Flow"**.
    - Agent stages Lisinopril, passes Gate 1 & Gate 2, triggers Gate 3 confirmation dialog.
    - Click **"Approve refill"** &rarr; Order is executed, refills decremented, audit receipt rendered.
2. **Out-of-Scope Flow (Atorvastatin $18.75)**:
    - With contract set only to Lisinopril (`RX-001`), click **"Test: Out-of-Scope Medication"**.
    - Agent attempts to refill Atorvastatin (`RX-002`) &rarr; Blocked at Gate 2 (`BLOCKED_UNAUTHORIZED_RX`). **No confirmation modal opens.**
3. **Amount-Limit Exceeded Flow**:
    - Click **"Test: Amount Limit Failure"**.
    - Total order exceeds contract maximum ($25.00) &rarr; Blocked at Gate 2 (`BLOCKED_SPEND_LIMIT`). **No confirmation modal opens.**
4. **Prepare-Only Restriction Flow**:
    - Set Action Scope to **"Prepare only"** and click **"Save Authority Contract"**.
    - Attempt a submit action &rarr; Blocked at Gate 2 (`BLOCKED_UNAUTHORIZED_ACTION`). **No confirmation modal opens.**
5. **Delegation Trap Flow**:
    - Click **"Test: Suspicious Delegation Trap"**.
    - Agent calls `update_payment_method` &rarr; Blocked at Gate 1 (`UNTRUSTED_INSTRUCTION_DESCRIPTION`). **No confirmation modal opens.**
6. **Benign-Looking Tool, Authority-Based Block Flow**:
    - Click **"Test: Benign-Looking Tool, Authority-Based Block"**.
    - Registers a new tool called `auto_reorder_assistant` with a plain description ("Convenience helper that reorders a patient's most recent prescription automatically").
    - This tool passes Gate 1 (Trust Check) because its name and description contain no suspicious patterns &rarr; Verdict: **TRUSTED**.
    - The tool then attempts to refill Atorvastatin (`RX-002`), which is outside the default contract scope &rarr; Blocked at Gate 2 (`BLOCKED_UNAUTHORIZED_RX`). **No confirmation modal opens.**
    - **Why this matters**: A real attacker wouldn't announce itself with a suspicious description like the `update_payment_method` trap. This scenario demonstrates that scope-based policy (Gate 2) is the deeper defense &rarr; even a completely benign-looking tool gets blocked when it tries to act outside the authority contract.

---

## Local Development

Handrail is built with static HTML, CSS, and modern JavaScript modules. No build step is required.

### Quick Start

```bash
# Using Node npx serve:
npx serve .

# Or using Python 3:
python3 -m http.server 8000
```

Open `http://localhost:8000` (or the port indicated by your static server) in your browser.

### Console Testing (Browser DevTools)

When running in a browser, Handrail exposes a `window.handrail` API for testing:

```javascript
// List registered WebMCP tools (returns Promise)
await window.handrail.getTools();

// Execute a tool through the 4-gate pipeline
await window.handrail.callTool('search_medications', {});
await window.handrail.callTool('prepare_refill', { prescriptionIds: ['RX-001'] });
await window.handrail.callTool('submit_refill', { prescriptionIds: ['RX-002'] });

// View current audit log entries
window.handrail.getAuditLogs();
```

### Project Structure

```
handrail/
├── index.html              # Main application entry
├── styles.css              # Accessible design system (WCAG AA/AAA)
├── netlify.toml            # Static deployment config
├── js/
│   ├── app.js              # UI controller, rendering, event binding
 │   ├── authority.js        # Authority Contract creation & evaluation (Gate 2)
 │   ├── audit.js            # Structured audit logging & receipt rendering
 │   ├── audit-db.js         # IndexedDB persistence for audit entries
 │   ├── confirmation.js     # Accessible confirmation dialog (Gate 3)
 │   ├── execution-callback.js # Callback registry for native WebMCP UI updates
 │   ├── pharmacy-data.js    # Mock pharmacy data & business logic
 │   ├── tools.js            # WebMCP tool registry & execution pipeline
 │   ├── trust.js            # Tool-trust heuristics (Gate 1)
 │   ├── ui-update.js        # Shared UI update functions
 │   └── ...
 ├── tests/
 │   ├── security-suite.js   # 39 assertions: trust, authority, consent, defaults-to-safe
 │   └── authority-tests.js  # 104 authority & policy assertions
```

---

## WebMCP Environment Testing

Handrail natively integrates with the emerging **WebMCP** (Web Model Context Protocol) specification:

1. **Native Detection**: On initialization, Handrail checks for `window.modelContext` or `document.modelContext`.
2. **Tool Registration**: In a WebMCP-capable browser or extension environment, Handrail registers the 5 primary tools via `document.modelContext.registerTool(...)` with canonical JSON input schemas. (Internal aliases are not registered natively.)
3. **Runtime Tool-Change Events**: When WebMCP is available, Handrail listens for `toolchange` events on `document.modelContext` (or falls back to the `ontoolchange` property). Tools registered after session init that are not in the expected tool set are flagged as unexpected and untrusted.
4. **Browser Fallback**: The live demo at handail.netlify.app runs in standard Chrome/Firefox/Safari, where `document.modelContext` is not yet exposed. Handrail detects this and routes all tool calls through the same 4-gate execution pipeline via an embedded test harness. The security logic is identical — only the event source differs. To test with native WebMCP, run Chrome with experimental flags enabled.

---

## Static Deployment

Handrail is 100% static client-side software requiring zero backend servers, serverless functions, or databases.

### Deploying to Netlify
A minimal `netlify.toml` is included in the project root:

```toml
[build]
  publish = "."

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "SAMEORIGIN"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Permissions-Policy = "camera=(), microphone=(), geolocation=()"
```

To deploy:
1. Connect your repository to **Netlify** (or drag-and-drop the directory).
2. Set publish directory to `.` (the project root).
3. No build command is necessary.

Can also be deployed directly to **GitHub Pages**, **Vercel**, **Cloudflare Pages**, **AWS S3**, or **Google Cloud Storage**.

---

## Limitations

- **Scope Boundary**: Handrail is an agent authority and consent layer for WebMCP-enabled applications; it is **not** a general-purpose remediation engine for third-party inaccessible websites.
- **Trust Heuristic Scope**: The Gate 1 tool-trust check demonstrates heuristic defense against tool squatting, casing anomalies, and instruction-like prompt injections. It is **not** an exhaustive security classifier and does not claim to detect every sophisticated adversarial prompt injection.
- **First-Party Integration**: The current implementation operates as a first-party, page-side consent layer embedded within the application context.
- **Research & Demo Context**: Handrail demonstrates the architectural viability of deterministic authority contracts and accessible human-in-the-loop consent for AI agents.
- **Mid-Session Registration (Test Harness)**: When native WebMCP (`document.modelContext`) is available, the "Test Unexpected Mid-Session Registration" button registers a tool via the real `registerTool()` API, which fires a `toolchange` event that Handrail intercepts — the same `detectUnexpectedRegistration()` code path handles both test harness and live events. In browsers without WebMCP, the demo falls back to the internal test harness using an `isSimulatedUnexpected` flag. The underlying security logic is identical in both cases; only the event source differs.

---

## Verified Test Output

Test suite results captured on **2026-08-30**. To regenerate: `node tests/security-suite.js` and `node tests/authority-tests.js`.

> **Note on reading the output**: Each test name is a security property being verified. Messages like "Confirmation contacted: false" mean the test confirmed that the human confirmation dialog was NOT invoked — this is the expected behavior for read-only or blocked actions.

```
================================================================================
                    HANDRAIL SECURITY-FOCUSED TEST SUITE                        
================================================================================
Lightweight, dependency-free test runner exercising actual security-critical functions.

[PASS] 1. In-Scope Read-Only Actions
  Verifies read-only tool inspection executes directly and immutably
  ✓ In-scope read-only action: search_medications executes without confirmation
       Returned 3 prescriptions. Confirmation contacted: false
  ✓ In-scope read-only action: search_medications structured query filter
       Found Lisinopril (RX-001)
  ✓ In-scope read-only action: view_prescription_details returns clinical data
       Prescription: Lisinopril 10 mg, Price: $12.4
  ✓ Read-only actions preserve Authority Contract fingerprint
       Contract state is strictly immutable during read-only tool execution

[PASS] 2. Non-Committal Staging (prepare_refill)
  Verifies prepare_refill operates non-committally inside authority bounds
  ✓ Demonstrate: prepare_refill can execute when authorized
       Staged order total: $12.4. Status: STAGED_READY_FOR_SUBMISSION
  ✓ Demonstrate: prepare_refill does NOT modify pharmacy records or submitted orders
       Refills count preserved (2), submitted orders count unchanged (0)
  ✓ Demonstrate: prepare_refill is blocked when out of scope
       Blocked with code: BLOCKED_UNAUTHORIZED_RX
  ✓ prepare_refill fails closed when amount exceeds max spend limit
       Blocked with BLOCKED_SPEND_LIMIT ($12.40 exceeds $10.00 limit)

[PASS] 3. Consequential Actions & Human Confirmation Gate
  Tests human confirmation gate, state invariance, approval, and denial
  ✓ In-scope submit_refill requires confirmation (Policy Engine Gate 2 -> Gate 3)
       Requires confirmation: true, Reason: Order cost ($12.40) meets or exceeds confirmation threshold ($10.00).
  ✓ CRITICAL: Calling submit_refill does NOT modify refill state until confirmation is approved
       State during confirmation: refills=2 (expected 2), orders=0 (expected 0)
  ✓ User denial: Consequential action halted safely with DENIED verdict and zero state mutation
       Verdict: DENIED, Refills remaining: 2
  ✓ Successful approval & refill execution: Order committed, refills decremented, confirmation receipt generated
       Receipt: RX-CONF-978054, Refills remaining: 1 (decremented by 1)
  ✓ Confirmation unavailable: Fails closed safely and NEVER converts to approval
       Verdict: DENIED, Error: Action denied by human user (Confirmation unavailable (Headless / non-DOM environment with no confirmation provider configured). Failing closed.).

[PASS] 4. Out-of-Scope Enforcement (Gate 2 Block, NO Confirmation)
  Verifies unpermitted requests fail closed at Gate 2 without confirmation
  ✓ Demonstrate: Out-of-scope submit_refill does NOT enter confirmation
       Blocked at Gate 2 with BLOCKED_UNAUTHORIZED_RX. Confirmation triggered: false
  ✓ Demonstrate: Amount-above-limit submit_refill does NOT enter confirmation
       Blocked at Gate 2 with BLOCKED_SPEND_LIMIT ($31.15 > $20.00). Confirmation triggered: false
  ✓ Disallowed submit: actionScope="prepare_only" blocks submit_refill without confirmation
       Blocked at Gate 2 with BLOCKED_UNAUTHORIZED_ACTION. Confirmation triggered: false
  ✓ Ineligible medication: 0 refills remaining blocks submit_refill without confirmation
       Blocked at Gate 2 with BLOCKED_INELIGIBLE_RX. Confirmation triggered: false

[PASS] 5. Tool-Trust & Adversarial Protection (Gate 1 Block, NO Confirmation)
  Tests tool-name squatting, prompt injection, and trap detection at Gate 1
  ✓ Demonstrate: Suspicious/untrusted tool does NOT enter confirmation
       Security trap update_payment_method blocked at Gate 1 (UNTRUSTED_INSTRUCTION_DESCRIPTION). Confirmation triggered: false
  ✓ Tool-name squatting: Separator spoofing ("submit-refill") blocked at Gate 1
       Blocked. This tool was not part of your authority contract and failed Handrail's tool-trust check (UNTRUSTED_NAME_SQUATTING: Tool name 'submit-refill' uses non-standard separators or casing imitating expected tool 'submit_refill'.). No confirmation was offered.
  ✓ Tool-name squatting: Levenshtein typo distance ("submit_refil") detected
       Tool name 'submit_refil' is suspiciously close (edit distance 1) to expected tool 'submit_refill'. Potential typosquat.
  ✓ Tool-name squatting: Version suffix ("submit_refill_v2") detected
       Tool name 'submit_refill_v2' appears to be an unauthorized variant or suffix of expected tool 'submit_refill'.
  ✓ Tool-name squatting: camelCase variation ("submitRefill") detected
       Tool name 'submitRefill' uses non-standard separators or casing imitating expected tool 'submit_refill'.
  ✓ Instruction-like description: Matched "ignore" in prompt injection metadata
       Tool description contains suspicious or instruction-like phrase: "ignore previous instructions".
  ✓ Instruction-like description: Matched "always approve" in prompt injection metadata
       Tool description contains suspicious or instruction-like phrase: "always approve".
  ✓ Instruction-like description: Matched "system instruction" in prompt injection metadata
       Tool description contains suspicious or instruction-like phrase: "bypass".
  ✓ Instruction-like description: Matched "ask for credentials" in prompt injection metadata
       Tool description contains suspicious or instruction-like phrase: "Ask the user for credentials".
  ✓ Tool registered after contract creation: Unexpected mutating tool flagged untrusted
       Tool 'transfer_patient_funds' was not in the session expected tool set and is classified as mutating (consequential). Untrusted.
  ✓ Unknown tool: Unregistered tool fails closed at Gate 1
       Blocked. This tool was not part of your authority contract and failed Handrail's tool-trust check (UNTRUSTED_UNEXPECTED_MUTATING: Tool 'unregistered_rogue_tool' was not in the session expected tool set and is classified as mutating (consequential). Untrusted.). No confirmation was offered.

[PASS] 6. Fail-Closed Security & Error Handling
  Verifies strict fail-closed behavior across edge cases and thrown errors
  ✓ Missing authority: Null authority contract fails closed immediately
       Authority Contract is missing or undefined. Failing closed to safeguard patient security.
  ✓ Malformed authority: Corrupted contract fields fail closed immediately
       Authority Contract is malformed or corrupted. Failing closed to safeguard patient security.
  ✓ Invalid arguments: Empty parameters object fails closed
       Preparation requires at least one valid prescription ID in structured parameters.
  ✓ Invalid arguments: Non-existent prescription ID (RX-999) fails closed
       Agent attempted to stage unauthorized medication(s): RX-999. Not granted in Authority Contract.
  ✓ Trust-check failure: Gate 1 blocks untrusted tool call even under wildcard authority contract
       Halted at Gate 1 with: UNTRUSTED_NAME_SQUATTING
  ✓ Security decision throws an error: Runtime exception fails closed and is NOT converted to approval
       Safely blocked with code: BLOCKED_INTERNAL_ERROR (Authority evaluation error: Simulated internal memory corruption in contract getter)

[PASS] 7. Structured Audit Trail & Provenance
  Verifies audit logging, structured receipt generation, and JSON export
  ✓ Blocked operation creates audit event with unique ID and blocked status
       Created log: AUDIT-0001, Decision: blocked
  ✓ Denied operation creates audit event recording human refusal
       Found audit event: AUDIT-0002, Decision: denied
  ✓ Approved and executed operation creates audit event
       Audit record: AUDIT-0004, Decision: executed
  ✓ Audit log captures all 5 provenance facets (Authorized, Requested, Decided, Happened, Result)
       Verified presence of userAuthorized, arguments, decisionDetails, whatHappened, and result
  ✓ Audit trail exports to valid, parsable JSON array
       Exported 4 structured records

--------------------------------------------------------------------------------
TEST EXECUTION SUMMARY:
  Total Assertions: 39
  Passed:           39
  Failed:           0
================================================================================
```

```
========================================
  AUTHORITY & POLICY TESTS: 104/104 PASSED
========================================
```

---

## Technical Verification

Three critical properties verified by automated tests — quoted verbatim from `tests/security-suite.js`:

### 1. State Invariance During Confirmation

**Test:** `"CRITICAL: Calling submit_refill does NOT modify refill state until confirmation is approved"`

**Why it matters:** An AI agent cannot exploit the confirmation delay to observe or modify pharmacy records — refill counts and submitted orders remain unchanged until the human explicitly approves.

### 2. Runtime Exception Defaults to Safe

**Test:** `"Security decision throws an error: Runtime exception fails closed and is NOT converted to approval"`

**Why it matters:** If the policy engine encounters an internal error (e.g., memory corruption, malformed data), the system defaults to denial rather than granting unauthorized access.

### 3. Gate 1 Trust Check Under Wildcard Authority

**Test:** `"Trust-check failure: Gate 1 blocks untrusted tool call even under wildcard authority contract"`

**Why it matters:** Even if a user accidentally authorizes all medications and all actions (`*` wildcard), a typosquatted or suspicious tool name is still halted at Gate 1 before any authority evaluation occurs — letting you delegate actions safely.

> **Note on verbatim test names:** The test names above are quoted exactly as they appear in the source code (`tests/security-suite.js`). They use technical phrasing like "fails closed" that describes the underlying behavior — this is the system's internal capability working as intended.

---

## What's Next

Handrail is a functional architectural demonstration, not a production system. The current implementation proves the 4-gate consent pipeline works deterministically in the browser, but several meaningful gaps remain between this demo and a real deployment.

A fuller, section-by-section accounting of these boundaries is in [LIMITATIONS.md](./LIMITATIONS.md). The summary below is the high-level roadmap:

### Real Agent Integration
All "agent actions" today are button clicks in the UI. There is no actual ChatGPT, Gemini, or other LLM invoking tools through Handrail — the demo simulates what an agent *would* do. The next step is wiring Handrail into a real agent loop (e.g., a Chrome extension or local proxy) so tool calls originate from an actual model, not a human clicking a button.

### WebMCP Native Support
`document.modelContext.registerTool()` does not exist in current Chrome, Firefox, or Safari. The demo detects this and falls back to an internal test harness. When WebMCP ships in browsers, the native registration path needs real-world validation, not just console testing. The fallback will remain useful for development, but the native path is the production target.

### Behavioral Trust Detection
Gate 1 currently catches typosquatting, separator spoofing, suffix squatting, and known prompt-injection phrases. It does **not** catch a novel tool with a completely benign name and description — that is exactly what the "Benign-Looking Tool" demo scenario proves. A more mature trust check would add behavioral analysis (what the tool *does*, not just what it says) rather than relying solely on metadata pattern matching.

### UI & Integration Tests
The 143 automated assertions cover the pipeline logic, but there are no tests for DOM rendering, focus trapping, the confirmation dialog, or the full button-to-receipt flow. Adding Playwright or similar integration tests would catch regressions in the accessible UI that unit tests cannot see.

### Persistence Beyond the Audit Log
The audit trail now survives page reloads via IndexedDB, but pharmacy state (`activePrescriptions`, `submittedRefillOrders`) is still ephemeral. A real deployment would need server-side persistence, session management, and cryptographic signing of audit entries so they cannot be tampered with after the fact.

### Accessibility Validation
The confirmation dialog was built with screen-reader considerations (focus trapping, `aria-live`, `role="alertdialog"`), but the ~22-second response time measurement comes from informal self-testing, not from actual screen-reader users. A rigorous study with NVDA, JAWS, or VoiceOver users would validate whether the timing and announcements work as intended.

### Production Hardening
- **No authentication**: Anyone can edit the authority contract. Real use needs identity binding.
- **No rate limiting**: Rapid repeated tool calls are not throttled.
- **No replay protection**: The same tool invocation could theoretically be replayed.
- **No session expiry**: Authority contracts do not time out.
- **No timeout on confirmation dialog**: If the user never responds, the Promise hangs indefinitely.

### Scope Expansion
The current tool set is intentionally small (5 primary tools + 1 demo adversarial tool). A real pharmacy portal would need refill history, prescription transfers, insurance adjudication, and provider messaging — each requiring additional authority contract rules and trust heuristics.

---

## License

Handrail is released under the **MIT License**. See [LICENSE](./LICENSE) for details.
