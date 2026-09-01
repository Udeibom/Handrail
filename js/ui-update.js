/**
 * @file ui-update.js
 * @description Shared UI update functions for post-execution rendering.
 * This file exists to avoid circular dependencies between app.js and tools.js.
 */

import { notifyExecutionComplete } from './execution-callback.js';

/**
 * Updates all UI elements after a tool execution.
 * Called by both demo button handlers (app.js) and native WebMCP execute callbacks (tools.js).
 * @param {object} result - The result from executeHandrailTool()
 * @param {string} toolName - The name of the tool that was executed
 */
export function updateUIAfterExecution(result, toolName) {
  // Use the callback registry to notify app.js to update UI
  // This avoids circular dependencies
  notifyExecutionComplete(result, toolName);
}
