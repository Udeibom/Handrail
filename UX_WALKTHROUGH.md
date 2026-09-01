# UX Walkthrough: Main Demo Flow

**Scenario:** A hackathon judge with 2-3 minutes, no documentation, first time seeing the app.
**Task:** Run the main demo flow and understand what happened.
**Starting point:** Fresh page load at `http://localhost:3000`.

---

## Screen 1: Initial Page Load

**What's immediately clear:**
- This is something called "Handrail" related to prescriptions/medications
- There's a list of 3 medications with prices and refill counts
- The patient is "Alex Morgan" with ID RX-PT-9042

**What requires guessing:**
- What is the actual purpose of this page? There's a subtitle ("Review your active prescriptions, set your Handrail Authority Contract parameters, and safely authorize medication refills with accessible human-in-the-loop consent") but it's jargon-dense.
- What should I do first? There are ~15 visible panels/sections.
- What is "Handrail Authority Contract" vs "Authority Contract" — are these the same thing?

**Friction point #1 (CRITICAL): No clear starting action**
The page presents everything at once. There's no visual hierarchy that says "start here." The most important button ("Run Successful Agent Flow") is buried in a right-column panel under a heading that says "DEVELOPER / DEMO CONTROLS" with a badge that says "Developer / Demo Mode." A judge will hesitate: *"Is this meant for me, or is this a developer testing area?"*

> **Smallest fix:** Rename the panel to "Demo Scenarios" and move it above the Authority Contract panel. Make the "Run Successful Agent Flow" button visually distinct (larger, primary color, with a play icon).

**Friction point #2 (MODERATE): The "Developer / Demo Mode" badge sounds like a warning**
The literal text "Developer / Demo Mode" with a badge suggests this section is for developers, not for running the main demonstration. A judge might avoid clicking anything in this section.

> **Smallest fix:** Remove the word "Developer" from the badge. Change to "Interactive Demos" or "Demo Scenarios."

---

## Screen 2: Clicking "Run Successful Agent Flow"

**What happens:** The button is clicked. Steps 1-3 execute automatically.

**What's immediately clear:**
- The AGENT ACTIVITY panel shows "Agent executing: search_medications..." then changes through steps
- A status message appears: "Running Successful Agent Flow (Step 1/4: search_medications)..."

**What requires guessing:**
- The steps happen very fast (milliseconds each). A judge sees the status text flicker through "Step 1/4", "Step 2/4", "Step 3/4" but has no time to read or understand what each step did.
- The prescription table on the left updates after Step 1 (search), but there's no visual highlight showing what changed.
- The Prescription Details panel populates after Step 2 — this is visible but happens automatically.
- The Refill Order Staging panel populates after Step 3 — also visible but automatic.

**Friction point #3 (CRITICAL): Steps 1-3 happen too fast to perceive**
A judge clicking "Run Successful Agent Flow" expects to see something happen. Instead, three steps execute in under a second, and then a dialog pops up. The judge has no sense of what Steps 1-3 actually did. They might think the button just opens a dialog.

> **Smallest fix:** Add a 400-600ms delay between steps with a brief highlight on the panel that just updated (e.g., flash the Prescription Details panel background green when it populates).

**Friction point #4 (MODERATE): No connection between the button and the dialog**
After clicking one button, a modal dialog appears asking for approval. A judge might not connect that the dialog is the culmination of the 4-step flow — it looks like a separate thing.

> **Smallest fix:** Change the dialog title from "Confirm refill" to "Step 4: Confirm refill" to show it's part of a sequence.

---

## Screen 3: The Confirmation Dialog

**What's immediately clear:**
- A modal dialog has opened
- It's asking to approve or deny a refill
- The medication is Lisinopril 10 mg for $12.40
- There are two buttons: "Deny" and "Approve refill"

**What requires guessing:**
- The dialog contains 7 sections including an expandable "Auditable Structured Parameters" section. A judge might not know they can ignore this.
- There's a stopwatch counting up (⏱ 1.2s) with text "[REAL_COMPARISON]" next to it. This looks like a bug or incomplete feature.
- The dialog says "Handrail policy requires human confirmation because this is a mutating pharmacy transaction and the copay ($12.40) meets or exceeds your consent threshold ($15.00)." But $12.40 does NOT exceed $15.00. This is technically correct (the threshold check is `>=` but `requireHumanConfirmation` is also `true`), but the wording is confusing.

**Friction point #5 (MODERATE): The `[REAL_COMPARISON]` placeholder looks like a bug**
Visible in the dialog: `⏱ 1.3s [REAL_COMPARISON]`. A judge will either think: (a) this is unfinished, or (b) they're supposed to know what this means. Neither is good.

> **Smallest fix:** Remove the placeholder text entirely. Add it back later when there's an actual baseline number.

**Friction point #6 (MODERATE): Confusing threshold explanation**
The dialog says the copay "meets or exceeds" the threshold, but $12.40 < $15.00. The actual reason confirmation is required is that `requireHumanConfirmation` is `true` in the contract, not the threshold. A judge who does the math will be confused.

> **Smallest fix:** Change the explanation to: "Handrail policy requires human confirmation for all refill orders." (This is accurate given the current contract settings.)

**Friction point #7 (MINOR): Too much information in the dialog**
The dialog has 7 numbered sections. A judge only needs: (1) what's happening, (2) how much, (3) what approve/deny means. The rest is noise for a demo.

> **Smallest fix:** Collapse sections 5-7 into an expandable "Details" section that's closed by default.

---

## Screen 4: Clicking "Approve refill"

**What happens:**
- The dialog closes
- The AGENT ACTIVITY panel shows "Successful Agent Flow complete: Refill confirmed and processed!"
- The Result / Audit Receipt panel shows a success receipt with confirmation number

**What's immediately clear:**
- Something succeeded — there's a confirmation number (e.g., RX-CONF-978054)
- The receipt shows medication, total charged, delivery method, confirmation number

**What requires guessing:**
- Did anything actually change? The prescription table still shows "2 refills" for Lisinopril (or does it? Let me check... after submit, refills decrement from 2 to 1, and the table re-renders). Actually the table DOES update, but there's no visual highlight showing the change.
- The audit trail at the bottom of the page has new entries, but it's far down the page and a judge might not scroll to see it.
- The metric cards (Total Calls, Approved, Blocked, Confirmations) have incremented, but they're small numbers in the right column.

**Friction point #8 (MODERATE): State change (refill decrement) happens without feedback**
After approval, Lisinopril's refills go from 2 to 1. This is the most important state change in the entire demo, but it happens silently. A judge might not notice unless they're specifically looking at the prescription table at the exact moment of submission.

> **Smallest fix:** After approval, briefly highlight the updated prescription row (e.g., flash the refills cell green for 1 second) and update the status text to say: "Lisinopril refills decremented from 2 to 1."

**Friction point #9 (MINOR): The audit trail is at the bottom of a long page**
The structured audit trail is a key feature, but it's at the very bottom of a long scrolling page. A judge who doesn't scroll won't see it.

> **Smallest fix:** After a successful flow, scroll the audit trail into view automatically.

---

## Screen 5: After the Flow Completes

**What's immediately clear:**
- The demo completed successfully
- There's a receipt with a confirmation number

**What requires guessing:**
- Can I run it again? (Yes, but the refills are now decremented, so the next run will fail when Lisinopril reaches 0 refills.)
- What do the other buttons do? (No indication of what to explore next.)
- What was the point of the demo? (A judge might understand "human approved a refill" but not the broader "4-gate pipeline" concept unless they read the Tool Registry section.)

**Friction point #10 (MINOR): No "what next" guidance**
After completing the flow, the page just sits there. A judge might wonder if there's more to see or if that's the whole demo.

> **Smallest fix:** After successful completion, show a subtle text below the receipt: "Try the security trap tests in the right column →" with an arrow.

---

## Overall Assessment: Could a Judge Complete This Unassisted?

**Verdict: Probably, but with confusion.**

A determined judge would:
1. Eventually find "Run Successful Agent Flow" (despite the "Developer" label)
2. Click it, see steps flash by
3. Encounter the confirmation dialog
4. Click "Approve refill"
5. See a success receipt

They would complete the flow in under 2 minutes. But they would likely:
- Miss what Steps 1-3 actually did
- Be confused by the `[REAL_COMPARISON]` placeholder
- Not notice the refill decrement
- Not explore the audit trail
- Leave without understanding the "4-gate pipeline" concept

**The core problem:** The demo works, but it doesn't *explain* itself. A judge sees a series of UI states change but has no narrative connecting them.

---

## Ranked Friction Points Summary

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| 1 | CRITICAL | No clear starting point; button buried in "Developer" panel | Rename panel, make button visually primary |
| 2 | CRITICAL | "Developer / Demo Mode" sounds like a testing area | Remove "Developer" from badge |
| 3 | CRITICAL | Steps 1-3 happen too fast to perceive | Add delays + visual highlights between steps |
| 4 | MODERATE | No connection between button click and dialog | Label dialog "Step 4: Confirm refill" |
| 5 | MODERATE | `[REAL_COMPARISON]` placeholder looks like a bug | Remove the placeholder text |
| 6 | MODERATE | Confusing threshold explanation ($12.40 "exceeds" $15.00) | Simplify to "all refills require confirmation" |
| 7 | MODERATE | Dialog has too many sections (7) | Collapse sections 5-7 into expandable "Details" |
| 8 | MODERATE | Refill decrement happens silently | Flash the updated cell + status text |
| 9 | MINOR | Audit trail at bottom of long page | Auto-scroll to audit trail after flow |
| 10 | MINOR | No "what next" guidance | Show subtle "Try security traps →" hint |
