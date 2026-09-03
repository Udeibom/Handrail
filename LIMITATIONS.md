# Where This Stands Today

Handrail is a working reference implementation of a four-gate consent layer for WebMCP tools, verified end-to-end against the real native `document.modelContext` API and against real external agents (ChatGPT's in-app browser, Gemini via the Model Context Tool Inspector). The sections below name the boundaries of that implementation honestly, rather than leaving them for a reviewer to find.

## 1. State is shared across browser tabs and sessions

Prescription data, audit logs, and tool-registration flags are held in module-level singletons (`activePrescriptions` and `submittedRefillOrders` in `pharmacy-data.js`, `auditLogs` in `audit.js`, registration state in `tools.js`). Two tabs open on the same origin share one in-memory state, and the audit log persists per-browser via IndexedDB rather than per-session.

This is a deliberate simplification for a single-user demo, not an oversight. A production version would scope state to an authenticated session (server-side or via a signed, session-bound client store) so concurrent tabs or users never observe or mutate each other's data.

## 2. Trust Check (Gate 1) is necessarily pattern-based, not behavioral

Gate 1's squatting and injected-instruction detection works by comparing tool names against expected names (Levenshtein distance, separator/suffix normalization) and scanning descriptions for instruction-like phrases. This reliably catches unsophisticated attacks — a tool named `submit_refill_v2`, or a description containing "always approve" — but a genuinely novel attack with a benign name and a benign-sounding description will pass Gate 1 by construction, since there is nothing suspicious in its metadata to detect.

This is why Handrail does not rely on Gate 1 alone. Gate 2 (Authority Check) is the deeper, behavior-based defense: it evaluates what a tool actually tries to do — which medication, what spend, what action — against a deterministic, user-set contract, regardless of how innocuous the tool's name or description looks. The `auto_reorder_assistant` demo scenario is a live, reproducible proof of exactly this: a tool with a plain, non-alarming name and description (`"Convenience helper that reorders a patient's most recent prescription automatically"`) passes Gate 1 with a `TRUSTED` verdict, then is correctly blocked at Gate 2 with `BLOCKED_UNAUTHORIZED_RX` when it attempts to act on a medication outside the authorized scope. The two gates are meant to be read together, not Gate 1 in isolation.

## 3. No timeout on an unanswered confirmation dialog

Gate 3 (Human Confirmation) returns a Promise that resolves when the user clicks Approve or Deny. If a dialog is opened and never answered, that Promise simply never resolves — there is no timeout that auto-denies or auto-expires a stale confirmation request. In a single-user demo this is harmless; in a real multi-agent or long-running-session environment, an abandoned confirmation request should eventually expire and fail closed, rather than waiting indefinitely.

## 4. This is a static, client-side demo with fictional data

There is no backend, no authentication, and no real pharmacy or healthcare system behind any of this — `pharmacy-data.js` is a fixed, synthetic dataset, and the "patient" is not a real account. Moving toward a production system would require, at minimum:
- Real authentication and session management, so the Authority Contract is tied to a verified identity rather than editable by anyone with the page open
- A real backend for prescription data, replacing the in-memory fixture
- Persistence of the Authority Contract itself (not just the audit log) across sessions and devices
- Integration with an actual pharmacy system's API for eligibility, pricing, and fulfillment, replacing the synthetic calculations currently done client-side

## 5. A few smaller, known rough edges

- `trust.js` checks an internal `isSimulatedUnexpected` flag as part of its evaluation logic — a detail of how this demo's test-scenario tooling registers tools, not something a real third-party tool registration would ever carry. It doesn't affect the correctness of any live agent-triggered test in this project, but it's an implementation detail that wouldn't exist in a non-demo deployment.
- The read-only pharmacy dataset (prescriptions, contract state) is not persisted — only the audit trail survives a page reload. This was a deliberate priority call: the audit trail is the accountability record and needed to survive; the demo data resetting is expected and matches the "Reset Demo State" controls already in the UI.

---

None of the above were discovered by a reviewer after the fact — they're named here because a project whose whole premise is deterministic, auditable trust boundaries should hold itself to the same standard about its own edges.
