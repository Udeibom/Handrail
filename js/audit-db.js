/**
 * @file audit-db.js
 * @description IndexedDB persistence for audit log entries.
 * Allows audit trail to survive page reloads.
 */

const DB_NAME = 'handrail-audit-db';
const DB_VERSION = 1;
const STORE_NAME = 'audit-log';

let dbPromise = null;

/**
 * Opens (and if necessary creates) the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this environment'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('decision', 'decision', { unique: false });
        store.createIndex('toolName', 'toolName', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      reject(new Error(`Failed to open IndexedDB: ${event.target.error?.message || 'Unknown error'}`));
    };
  });

  return dbPromise;
}

/**
 * Persists a single audit log entry to IndexedDB.
 * @param {object} entry - The audit log entry to store
 * @returns {Promise<void>}
 */
export async function persistAuditEntry(entry) {
  if (typeof indexedDB === 'undefined') return;

  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('[AuditDB] Failed to persist entry:', err);
  }
}

/**
 * Retrieves all audit log entries from IndexedDB, sorted by timestamp descending (newest first).
 * @returns {Promise<object[]>}
 */
export async function loadAuditEntries() {
  if (typeof indexedDB === 'undefined') return [];

  try {
    const db = await openDB();
    const entries = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });

    // Sort by timestamp descending (newest first)
    return entries.sort((a, b) => {
      const tsA = new Date(a.timestamp).getTime() || 0;
      const tsB = new Date(b.timestamp).getTime() || 0;
      return tsB - tsA;
    });
  } catch (err) {
    console.error('[AuditDB] Failed to load entries:', err);
    return [];
  }
}

/**
 * Clears all audit log entries from IndexedDB.
 * @returns {Promise<void>}
 */
export async function clearAuditEntries() {
  if (typeof indexedDB === 'undefined') return;

  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('[AuditDB] Failed to clear entries:', err);
  }
}

/**
 * Exports all audit log entries as a JSON string.
 * @returns {Promise<string>} JSON string of all entries
 */
export async function exportAuditEntriesJSON() {
  const entries = await loadAuditEntries();
  return JSON.stringify(entries, null, 2);
}

/**
 * Gets the count of persisted audit entries.
 * @returns {Promise<number>}
 */
export async function getAuditEntryCount() {
  if (typeof indexedDB === 'undefined') return 0;

  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.count();
      request.onsuccess = () => resolve(request.result || 0);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('[AuditDB] Failed to get count:', err);
    return 0;
  }
}
