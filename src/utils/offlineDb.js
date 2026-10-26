/**
 * offlineDb.js
 * Durable browser-side storage using IndexedDB for SmartToken offline mode.
 * 
 * Stores:
 *  - pending_queue: Durable FIFO queue of pending token awards, corrections, and attendance changes.
 *  - roster_cache: Scoped cache of classroom student rosters and balances for offline viewing.
 *  - history_cache: Scoped cache of event history for offline viewing.
 */

const DB_NAME = 'smarttoken_offline_v1';
const DB_VERSION = 1;

let dbInstance = null;

/**
 * Open (or create) the IndexedDB database instance.
 */
export function openDb() {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB is not supported in this environment'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // 1. Pending actions queue
      if (!db.objectStoreNames.contains('pending_queue')) {
        const queueStore = db.createObjectStore('pending_queue', { keyPath: 'clientEventId' });
        queueStore.createIndex('createdAt', 'createdAt', { unique: false });
        queueStore.createIndex('status', 'status', { unique: false });
        queueStore.createIndex('sectionId', 'sectionId', { unique: false });
        queueStore.createIndex('actionType', 'actionType', { unique: false });
      }

      // 2. Cached rosters (keyed by `${userId}_${sectionId}` for security & isolation)
      if (!db.objectStoreNames.contains('roster_cache')) {
        db.createObjectStore('roster_cache', { keyPath: 'cacheKey' });
      }

      // 3. Cached history (keyed by `${userId}_${sectionId}`)
      if (!db.objectStoreNames.contains('history_cache')) {
        db.createObjectStore('history_cache', { keyPath: 'cacheKey' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      dbInstance.onclose = () => {
        dbInstance = null;
      };
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('[IndexedDB] Failed to open database:', event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * Enqueue an action into the durable pending_queue.
 * Resolves only after IndexedDB transaction commits, ensuring action is
 * safely stored before UI reports success.
 */
export async function enqueuePendingAction(action) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending_queue', 'readwrite');
    const store = tx.objectStore('pending_queue');

    const entry = {
      clientEventId: action.clientEventId,
      userId: action.userId || null,
      actionType: action.actionType, // 'TOKEN_AWARD' | 'CORRECTION' | 'ATTENDANCE'
      endpoint: action.endpoint,
      method: action.method || 'POST',
      payload: action.payload,
      sectionId: action.sectionId,
      studentId: action.studentId,
      studentName: action.studentName || 'Student',
      rollNumber: action.rollNumber || '—',
      tokenChange: Number(action.tokenChange) || 0,
      attendanceStatus: action.attendanceStatus || null,
      description: action.description || '',
      status: 'pending', // 'pending' | 'syncing' | 'failed'
      attempts: 0,
      lastAttemptAt: null,
      lastError: null,
      permanentError: false,
      createdAt: action.createdAt || new Date().toISOString(),
    };

    const request = store.put(entry);

    tx.oncomplete = () => {
      resolve(entry);
    };

    tx.onerror = (evt) => {
      console.error('[IndexedDB] Enqueue transaction failed:', evt.target.error);
      reject(evt.target.error);
    };

    request.onerror = (evt) => {
      console.error('[IndexedDB] Put request failed:', evt.target.error);
      reject(evt.target.error);
    };
  });
}

/**
 * Get all pending actions from IndexedDB ordered by createdAt (FIFO).
 */
export async function getAllPendingActions() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending_queue', 'readonly');
    const store = tx.objectStore('pending_queue');
    const index = store.index('createdAt');
    const request = index.getAll();

    request.onsuccess = () => {
      resolve(request.result || []);
    };

    request.onerror = (evt) => {
      reject(evt.target.error);
    };
  });
}

/**
 * Get pending actions filtered by sectionId.
 */
export async function getPendingActionsForSection(sectionId) {
  const all = await getAllPendingActions();
  if (!sectionId) return all;
  return all.filter((item) => item.sectionId === sectionId);
}

/**
 * Update the state of a pending action (e.g. status, attempts, lastError).
 */
export async function updatePendingAction(clientEventId, updates) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending_queue', 'readwrite');
    const store = tx.objectStore('pending_queue');
    const getReq = store.get(clientEventId);

    getReq.onsuccess = () => {
      const existing = getReq.result;
      if (!existing) {
        return resolve(null);
      }
      const updated = { ...existing, ...updates };
      const putReq = store.put(updated);
      putReq.onsuccess = () => resolve(updated);
      putReq.onerror = (e) => reject(e.target.error);
    };

    getReq.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Remove an action from the queue once acknowledged by the server.
 */
export async function removePendingAction(clientEventId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending_queue', 'readwrite');
    const store = tx.objectStore('pending_queue');
    const req = store.delete(clientEventId);

    tx.oncomplete = () => resolve(true);
    tx.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Count total number of pending actions across all sections.
 */
export async function countPendingActions() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending_queue', 'readonly');
    const store = tx.objectStore('pending_queue');
    const countReq = store.count();

    countReq.onsuccess = () => resolve(countReq.result);
    countReq.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Cache student roster for a specific user and section.
 * Keying by userId ensures isolation between users on a shared device.
 */
export async function cacheRoster(userId, sectionId, students) {
  if (!userId || !sectionId || !Array.isArray(students)) return;
  const db = await openDb();
  const cacheKey = `${userId}_${sectionId}`;

  return new Promise((resolve, reject) => {
    const tx = db.transaction('roster_cache', 'readwrite');
    const store = tx.objectStore('roster_cache');
    const entry = {
      cacheKey,
      userId,
      sectionId,
      students,
      updatedAt: new Date().toISOString(),
    };
    store.put(entry);
    tx.oncomplete = () => resolve(entry);
    tx.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Retrieve cached student roster.
 */
export async function getCachedRoster(userId, sectionId) {
  if (!userId || !sectionId) return null;
  const db = await openDb();
  const cacheKey = `${userId}_${sectionId}`;

  return new Promise((resolve, reject) => {
    const tx = db.transaction('roster_cache', 'readonly');
    const store = tx.objectStore('roster_cache');
    const req = store.get(cacheKey);

    req.onsuccess = () => {
      resolve(req.result ? req.result.students : null);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Cache history events for a specific user and section.
 */
export async function cacheHistory(userId, sectionId, events) {
  if (!userId || !sectionId || !Array.isArray(events)) return;
  const db = await openDb();
  const cacheKey = `${userId}_${sectionId}`;

  return new Promise((resolve, reject) => {
    const tx = db.transaction('history_cache', 'readwrite');
    const store = tx.objectStore('history_cache');
    const entry = {
      cacheKey,
      userId,
      sectionId,
      events,
      updatedAt: new Date().toISOString(),
    };
    store.put(entry);
    tx.oncomplete = () => resolve(entry);
    tx.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Retrieve cached history events.
 */
export async function getCachedHistory(userId, sectionId) {
  if (!userId || !sectionId) return null;
  const db = await openDb();
  const cacheKey = `${userId}_${sectionId}`;

  return new Promise((resolve, reject) => {
    const tx = db.transaction('history_cache', 'readonly');
    const store = tx.objectStore('history_cache');
    const req = store.get(cacheKey);

    req.onsuccess = () => {
      resolve(req.result ? req.result.events : null);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Clear cached data for a user on logout to preserve privacy.
 */
export async function clearUserCache(userId) {
  if (!userId) return;
  try {
    const db = await openDb();
    const clearStore = (storeName) =>
      new Promise((resolve) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.openCursor();
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            if (cursor.value.userId === userId) {
              cursor.delete();
            }
            cursor.continue();
          } else {
            resolve();
          }
        };
        req.onerror = () => resolve();
      });

    await clearStore('roster_cache');
    await clearStore('history_cache');
  } catch (err) {
    console.warn('[IndexedDB] Failed to clear user cache:', err);
  }
}
