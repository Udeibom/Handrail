/**
 * @file execution-callback.js
 * @description Callback registry for post-execution UI updates.
 * Allows tools.js to trigger UI updates without circular dependencies.
 */

let postExecutionCallback = null;

/**
 * Registers a callback to be called after tool execution completes.
 * @param {Function} callback - Function(result, toolName) => void
 */
export function setPostExecutionCallback(callback) {
  postExecutionCallback = callback;
}

/**
 * Calls the registered post-execution callback if one exists.
 * @param {object} result - The result from executeHandrailTool()
 * @param {string} toolName - The name of the tool that was executed
 */
export function notifyExecutionComplete(result, toolName) {
  if (typeof postExecutionCallback === 'function') {
    postExecutionCallback(result, toolName);
  }
}
