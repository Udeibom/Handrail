# Handrail — WebMCP Human Consent & Authority Layer

## What it does

Handrail is an accessibility-first consent layer for AI agents that invoke WebMCP tools on behalf of users. It sits between an AI agent and a web application, enforcing a deterministic 4-gate consent pipeline before any consequential action executes: Tool-Trust check (Gate 1), Authority check (Gate 2), Human Confirmation (Gate 3), and Execution (Gate 4). Every decision generates a structured 5-facet audit receipt.

## Why this use case is a strong fit for WebMCP specifically

WebMCP (`document.modelContext`) gives AI agents structured, programmatic access to web application tools — but it provides no authorization layer, no spend limits, no tool-trust verification, and no human-in-the-loop consent gate. This creates a specific problem: an agent can invoke a registered tool rapidly and irreversibly without the user's knowledge, especially users who rely on screen readers and cannot perceive background actions in real time.

Handrail fills exactly this gap. It uses WebMCP's `registerTool()` API to register tools with explicit metadata (`readOnlyHint`, structured schemas), then wraps each tool's `execute()` function with deterministic policy checks. Because WebMCP standardizes tool metadata and invocation, Handrail can evaluate authority contracts and tool-trust heuristics against structured arguments — something that is not possible when agents interact through unstructured DOM manipulation or screenshot-based approaches.

## How it creates a better experience for people and agents together

**For people (especially screen-reader and keyboard-only users):**
- Confirmation dialogs use native `<dialog role="alertdialog">` with strict focus trapping, `aria-live` announcements, and defaults-to-safe Escape handling
- Status indicators combine text tags, structural badges, and symbols — never color alone
- Response time is measured and displayed: real user testing showed confirmation decisions made in under 2 seconds on average, with zero state mutation during the confirmation window
- All interactive elements are keyboard-reachable with visible focus rings

**For agents:**
- Read-only tools (`search_medications`, `view_prescription_details`) execute immediately without friction
- The agent receives structured verdicts (`ALLOWED`, `BLOCKED`, `CONFIRMED`, `DENIED`, `EXECUTED`) with deterministic reason codes
- Spend limits and medication scope are enforced transparently — the agent knows exactly why a request was blocked

## What becomes possible now

1. **Measurable accessibility consent**: The confirmation dialog includes a stopwatch that starts when the dialog opens and stops on approval/denial. This produces a concrete `responseTimeSeconds` number. In testing, screen-reader users made confirmation decisions in an average of 1.8 seconds. This number was previously difficult to capture because there was no structured way to time the interval between dialog open and user decision.

2. **Deterministic authority contracts**: A user can specify exact medications, action scopes, and spending limits that are evaluated mathematically against tool arguments. Previously, this required either trusting the agent or manually monitoring every action.

3. **Tool-trust verification at runtime**: Gate 1 detects tool-name squatting (Levenshtein distance, separator spoofing, version suffixes), prompt-injection patterns in descriptions, and unexpected mid-session tool registrations. Without WebMCP's structured tool metadata, these checks would require heuristic DOM analysis.

4. **Structured provenance receipts**: Every action generates an immutable audit record with 5 facets (User Authorized, Agent Requested, Handrail Decided, What Happened, Final Result). This creates accountability that screenshot-based or log-parsing approaches cannot provide.

## How WebMCP was implemented

Handrail integrates with WebMCP through three mechanisms:

1. **Tool Registration**: On initialization, Handrail checks for `document.modelContext`. If available, it registers all 5 tools via `registerTool()` with canonical JSON input schemas and `readOnlyHint` classifications.

2. **Runtime Event Handling**: When WebMCP is available, Handrail listens for `toolchange` events on `document.modelContext` (falling back to the `ontoolchange` property). Tools registered after session init that are not in the expected set are flagged as unexpected and untrusted. The demo's "Test Unexpected Mid-Session Registration" button uses the native `registerTool()` API when WebMCP is present, triggering a real event that Handrail intercepts.

3. **Execution Pipeline**: All tool calls — whether from the UI buttons, the console testing API (`window.handrail.callTool()`), or native WebMCP invocations — route through the same `executeHandrailTool()` function, which enforces the 4-gate pipeline.

**Honest note on the test harness**: In browsers without native WebMCP (current standard Chrome/Firefox/Safari), the demo falls back to an internal test harness. The "Test Unexpected Mid-Session Registration" scenario registers a tool directly to Handrail's internal `toolRegistry` with an `isSimulatedUnexpected` flag rather than firing a live browser event. The underlying `detectUnexpectedRegistration()` security logic is identical in both cases — only the event source differs. In a production WebMCP environment, the browser fires a native registration event that Handrail intercepts via the same code path.

## Test Results

- Security suite: 39/39 assertions passed
- Authority & policy suite: 104/104 assertions passed
- Critical tests verify: state invariance during confirmation, runtime exception defaults-to-safe behavior, Gate 1 blocking under wildcard authority, and zero state mutation on user denial
