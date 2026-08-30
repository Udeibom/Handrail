## Issue: No Standardized Classification for Read-Only vs. Mutating Tools

**Repository:** webmachinelearning/webmcp

### Problem

While building a consent layer on top of WebMCP, we needed to determine whether a tool invocation should require human confirmation. The natural distinction is between read-only operations (safe to execute immediately) and mutating operations (state-changing, consequential).

We adopted a `readOnlyHint` boolean field on tool metadata to make this classification, but:

1. **It's not in the current WebMCP spec** — we invented it out of necessity.
2. **No guidance on defaults** — when a tool omits this field, should it be treated as read-only or mutating? We defaulted to `false` (mutating) for security, but this is a guess, not a spec.
3. **No way to signal "non-committal staging"** — some tools prepare data without committing changes (e.g., calculating order totals). These are technically mutating (they don't fit `readOnlyHint: true`) but shouldn't require confirmation. We had no way to express this nuance.

### What We Did

In our implementation (`tools.js`), every tool must declare `readOnlyHint`:
- `true` = read-only, executes without confirmation
- `false` = mutating/consequential, requires authority check + confirmation
- Unmarked tools default to `false` (fail-closed)

We also added a separate concept of "non-committal staging" in the tool handler logic, but this is entirely our own convention.

### Suggestion

Consider adding an official tool classification field to the WebMCP spec, such as:
- `accessMode: "read" | "write" | "stage"` (or similar)
- Clear guidance on default behavior when unspecified
- Documentation on how user agents should communicate tool classification to assistive technologies

This would help builders make consistent security decisions and give screen-reader users reliable information about what a tool will do before it executes.

### Context

We built Handrail (a WebMCP human consent layer) for the DevPost hackathon. The full implementation is at [github.com/Udeibom/Handrail](https://github.com/Udeibom/Handrail).
