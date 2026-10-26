/**
 * syncManager.js
 * Connectivity and Synchronization Engine for SmartToken Offline Mode.
 * 
 * - Verifies true backend reachability via GET /api/health with timeout.
 * - Manages durable FIFO queue synchronization with PostgreSQL ledger.
 * - Handles idempotent acknowledgements, auth expiry, and validation errors.
 * - Applies bounded backoff retries and broadcasts real-time sync status.
 */

import {
  getAllPendingActions,
  updatePendingAction,
  removePendingAction,
  countPendingActions,
  enqueuePendingAction,
} from './offlineDb.js';

let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
let isSyncing = false;
let isDrainRunning = false;
let pendingCount = 0;
let permanentErrorsCount = 0;
let authExpired = false;
let lastSyncTime = null;
let retryTimeoutId = null;
let backoffDelayMs = 2000;
const MAX_BACKOFF_MS = 30000;

export const PROMPT_SYNC_MS = 400;

export function getIsOnline() {
  return isOnline;
}

export function getSyncState() {
  return {
    isOnline,
    isSyncing,
    pendingCount,
    permanentErrorsCount,
    authExpired,
    lastSyncTime,
  };
}

const listeners = new Set();

function getAuthToken() {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem('smarttoken_token');
}

export function getCurrentUser() {
  const token = getAuthToken();
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

/**
 * Broadcast current sync state to all subscribers and dispatch window event.
 */
function broadcastState() {
  const state = {
    isOnline,
    isSyncing,
    pendingCount,
    permanentErrorsCount,
    authExpired,
    lastSyncTime,
  };

  listeners.forEach((callback) => {
    try {
      callback(state);
    } catch (e) {
      console.warn('[SyncManager] Error in listener callback:', e);
    }
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('smarttoken-sync-state', { detail: state })
    );
  }
}

/**
 * Subscribe to sync engine state updates.
 */
export function subscribeSyncState(callback) {
  listeners.add(callback);
  // Send initial state immediately
  callback({
    isOnline,
    isSyncing,
    pendingCount,
    permanentErrorsCount,
    authExpired,
    lastSyncTime,
  });
  return () => {
    listeners.delete(callback);
  };
}

/**
 * Actively probe backend reachability via public /api/health endpoint.
 * Does not rely merely on navigator.onLine.
 */
export async function checkReachability() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);

    const res = await fetch('/api/health', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);

    const reached = res.ok;
    if (isOnline !== reached) {
      isOnline = reached;
      broadcastState();
      if (reached && pendingCount > 0) {
        drainQueue().catch((e) => console.warn('[SyncManager] Auto-drain on reachability restoration:', e));
      }
    }
    return reached;
  } catch {
    if (isOnline) {
      isOnline = false;
      broadcastState();
    }
    return false;
  }
}

/**
 * Refresh count of pending items and permanent error items from IndexedDB.
 */
export async function refreshPendingCounts() {
  try {
    const all = await getAllPendingActions();
    pendingCount = all.filter((a) => !a.permanentError).length;
    permanentErrorsCount = all.filter((a) => a.permanentError).length;
    broadcastState();
  } catch (err) {
    console.warn('[SyncManager] Failed to refresh counts:', err);
  }
}

/**
 * Queue a new token or attendance action safely into IndexedDB.
 * Guarantees action is persisted locally before returning.
 */
export async function queueAction({
  actionType,
  endpoint,
  method = 'POST',
  payload,
  sectionId,
  studentId,
  studentName,
  rollNumber,
  tokenChange,
  attendanceStatus,
  description,
}) {
  const currentUser = getCurrentUser();
  const userId = currentUser?.userId || null;
  const clientEventId = payload.clientEventId || crypto.randomUUID();
  payload.clientEventId = clientEventId;

  const entry = await enqueuePendingAction({
    clientEventId,
    userId,
    actionType,
    endpoint,
    method,
    payload,
    sectionId,
    studentId,
    studentName,
    rollNumber,
    tokenChange,
    attendanceStatus,
    description,
    createdAt: new Date().toISOString(),
  });

  await refreshPendingCounts();

  // Try immediate sync if online
  if (isOnline && !isSyncing) {
    drainQueue().catch((err) => console.warn('[SyncManager] Drain error:', err));
  }

  return entry;
}

/**
 * Drain the FIFO pending queue item by item until all syncable items for the current user are processed.
 */
export async function drainQueue() {
  if (isDrainRunning) return;
  isDrainRunning = true;

  try {
    const reachable = await checkReachability();
    if (!reachable) {
      scheduleRetry();
      return;
    }

    const token = getAuthToken();
    const currentUser = getCurrentUser();
    if (!token || !currentUser?.userId) {
      authExpired = true;
      broadcastState();
      return;
    }

    isSyncing = true;
    broadcastState();

    let hasMore = true;
    while (hasMore) {
      // Re-verify auth token before each request
      const currentToken = getAuthToken();
      if (!currentToken) {
        authExpired = true;
        break;
      }

      const queue = await getAllPendingActions();
      // Filter items for current user that are not marked as permanent server validation errors
      const syncableItems = queue.filter(
        (item) => !item.permanentError && (!item.userId || item.userId === currentUser.userId)
      );

      if (syncableItems.length === 0) {
        hasMore = false;
        break;
      }

      const item = syncableItems[0];

      await updatePendingAction(item.clientEventId, {
        status: 'syncing',
        lastAttemptAt: new Date().toISOString(),
      });

      let res;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);

        res = await fetch(item.endpoint, {
          method: item.method || 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${currentToken}`,
          },
          body: JSON.stringify(item.payload),
          signal: controller.signal,
        });
        clearTimeout(timeout);
      } catch (networkErr) {
        // Network failure / server disconnect
        console.warn(`[SyncManager] Network error syncing ${item.clientEventId}:`, networkErr.message);
        await updatePendingAction(item.clientEventId, {
          status: 'pending',
          attempts: (item.attempts || 0) + 1,
          lastError: 'Network error: ' + networkErr.message,
        });
        isOnline = false;
        scheduleRetry();
        break;
      }

      // Handle server responses
      if (res.status === 200 || res.status === 201) {
        // Success or Idempotent replay acknowledgement
        const resData = await res.json().catch(() => ({}));
        await removePendingAction(item.clientEventId);
        backoffDelayMs = 2000; // Reset backoff on success
        lastSyncTime = new Date().toISOString();

        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('smarttoken-action-synced', {
              detail: { clientEventId: item.clientEventId, item, resData },
            })
          );
        }
      } else if (res.status === 401) {
        // Auth expired
        console.warn(`[SyncManager] Auth expired (401) syncing ${item.clientEventId}`);
        authExpired = true;
        await updatePendingAction(item.clientEventId, {
          status: 'pending',
          lastError: 'Session expired. Please log in to sync.',
        });
        break;
      } else if (res.status === 400 || res.status === 404) {
        // Server rejected action (e.g. invalid UUID, student un-enrolled)
        let errorMsg = 'Validation rejected';
        try {
          const body = await res.json();
          errorMsg = body.error || errorMsg;
        } catch {}

        console.error(`[SyncManager] Validation error (status ${res.status}):`, errorMsg);
        await updatePendingAction(item.clientEventId, {
          status: 'failed',
          permanentError: true,
          attempts: (item.attempts || 0) + 1,
          lastError: errorMsg,
        });
        // Continue loop to process subsequent items
      } else {
        // 5xx Server Error or temporary error
        console.warn(`[SyncManager] Server error (status ${res.status}) syncing ${item.clientEventId}`);
        await updatePendingAction(item.clientEventId, {
          status: 'pending',
          attempts: (item.attempts || 0) + 1,
          lastError: `Server error HTTP ${res.status}`,
        });
        scheduleRetry();
        break;
      }
    }
  } finally {
    isSyncing = false;
    isDrainRunning = false;
    await refreshPendingCounts();
    broadcastState();
  }
}

/**
 * Schedule bounded exponential backoff retry.
 */
function scheduleRetry() {
  if (retryTimeoutId) clearTimeout(retryTimeoutId);
  retryTimeoutId = setTimeout(() => {
    drainQueue().catch((e) => console.warn('[SyncManager] Retry drain error:', e));
  }, backoffDelayMs);

  backoffDelayMs = Math.min(backoffDelayMs * 1.5, MAX_BACKOFF_MS);
}

/**
 * Trigger an immediate manual sync attempt.
 */
export async function syncNow() {
  if (retryTimeoutId) clearTimeout(retryTimeoutId);
  backoffDelayMs = 2000;
  authExpired = false;
  return drainQueue();
}

/**
 * Initialize event listeners for browser online/offline and tab visibility.
 */
export function initSyncEngine() {
  if (typeof window === 'undefined') return;

  refreshPendingCounts();

  window.addEventListener('online', () => {
    checkReachability().then((ok) => {
      if (ok) syncNow();
    });
  });

  window.addEventListener('offline', () => {
    isOnline = false;
    broadcastState();
  });

  window.addEventListener('focus', () => {
    checkReachability().then((ok) => {
      if (ok && pendingCount > 0) syncNow();
    });
  });

  // Periodic heartbeat: faster when offline or pending, standard 15s when idle
  setInterval(() => {
    checkReachability().then((ok) => {
      if (ok && pendingCount > 0 && !isSyncing) {
        drainQueue();
      }
    });
  }, 3000);
}
