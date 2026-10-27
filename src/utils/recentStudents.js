/**
 * Utility for managing and ranking recently & frequently selected students.
 * Synchronizes between Quick Token page and Home page via localStorage and custom window events.
 * 
 * NOTE: Lifetime total token balances do NOT affect ranking.
 * Only the frequency of tokens awarded over the recent session ("over a day or so", rolling 36h)
 * determines priority, with recency serving as the tie-breaker.
 */

const RECENT_AWARDS_KEY = 'smarttoken_recent_awards';

// Rolling window for "over a day or so" (36 hours)
export const RECENT_WINDOW_MS = 36 * 60 * 60 * 1000;

/**
 * Record a token award action for a student, updating their rolling timestamps.
 */
export function recordStudentAward(student) {
  if (!student) return;
  const id = student.backendId || student.id || student.studentIdNumber || student.rollNumber;
  const name = (student.name || '').toLowerCase().trim();
  const now = Date.now();

  try {
    const raw = localStorage.getItem(RECENT_AWARDS_KEY);
    const map = raw ? JSON.parse(raw) : {};

    const existing = map[id] || map[name] || { timestamps: [] };
    const validTimestamps = (existing.timestamps || [])
      .filter((t) => typeof t === 'number' && now - t <= RECENT_WINDOW_MS);
    validTimestamps.push(now);

    const updated = {
      id,
      name: student.name,
      timestamps: validTimestamps,
      count: validTimestamps.length,
      lastAwardedAt: now,
    };

    map[id] = updated;
    if (name) map[name] = updated;

    localStorage.setItem(RECENT_AWARDS_KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent('recent-students-updated', { detail: updated }));
  } catch (err) {
    console.warn('Failed to record student award in localStorage:', err);
  }
}

/**
 * Record a token correction / decrement for a student, rolling back their latest award.
 */
export function recordStudentCorrection(student) {
  if (!student) return;
  const id = student.backendId || student.id || student.studentIdNumber || student.rollNumber;
  const name = (student.name || '').toLowerCase().trim();
  const now = Date.now();

  try {
    const raw = localStorage.getItem(RECENT_AWARDS_KEY);
    const map = raw ? JSON.parse(raw) : {};

    const existing = map[id] || map[name] || { timestamps: [] };
    const validTimestamps = (existing.timestamps || [])
      .filter((t) => typeof t === 'number' && now - t <= RECENT_WINDOW_MS);

    if (validTimestamps.length > 0) {
      validTimestamps.pop();
    }

    const updated = {
      id,
      name: student.name,
      timestamps: validTimestamps,
      count: validTimestamps.length,
      lastAwardedAt: validTimestamps[validTimestamps.length - 1] || 0,
    };

    map[id] = updated;
    if (name) map[name] = updated;

    localStorage.setItem(RECENT_AWARDS_KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent('recent-students-updated', { detail: updated }));
  } catch (err) {
    console.warn('Failed to record student correction in localStorage:', err);
  }
}

/**
 * Get map of locally recorded recent awards.
 */
export function getRecentAwardMap() {
  try {
    const raw = localStorage.getItem(RECENT_AWARDS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Clear all locally recorded recent awards from localStorage.
 */
export function clearRecentAwards() {
  try {
    localStorage.removeItem(RECENT_AWARDS_KEY);
    window.dispatchEvent(new CustomEvent('recent-students-updated', { detail: {} }));
  } catch (err) {
    console.warn('Failed to clear recent awards from localStorage:', err);
  }
}

/**
 * Rank students based strictly on award frequency in the last day or so (rolling 36 hours).
 * Total lifetime tokens are completely ignored.
 */
export function rankStudentsByActivity(students = [], events = []) {
  if (!Array.isArray(students) || students.length === 0) return [];

  const now = Date.now();
  const localMap = getRecentAwardMap();

  // Aggregate event ledger stats strictly within the recent window (last 36 hours)
  const eventMap = {};
  if (Array.isArray(events)) {
    for (const evt of events) {
      const time = new Date(evt.createdAt || evt.created_at || 0).getTime();
      // Ignore historical events older than 36 hours
      if (now - time > RECENT_WINDOW_MS) {
        continue;
      }

      const studentId = evt.studentId || evt.student_id;
      const studentName = (evt.studentName || evt.name || '').toLowerCase().trim();
      const studentRoll = (evt.rollNumber || evt.student_id_number || '').toLowerCase().trim();
      const change = Number(evt.tokenChange ?? evt.token_change ?? 0);

      const keys = [studentId, studentName, studentRoll].filter(Boolean);
      for (const k of keys) {
        if (!eventMap[k]) {
          eventMap[k] = { count: 0, lastAwardedAt: 0 };
        }
        if (change > 0) {
          eventMap[k].count += change;
        } else if (change < 0) {
          eventMap[k].count = Math.max(0, eventMap[k].count + change);
        }
        if (time > eventMap[k].lastAwardedAt) {
          eventMap[k].lastAwardedAt = time;
        }
      }
    }
  }

  // Auto-prune stale localStorage ghost entries that have no matching ledger events or current tokens
  if (Array.isArray(events) && events.length > 0) {
    let pruned = false;
    for (const key of Object.keys(localMap)) {
      if (!eventMap[key]) {
        delete localMap[key];
        pruned = true;
      }
    }
    if (pruned) {
      try {
        localStorage.setItem(RECENT_AWARDS_KEY, JSON.stringify(localMap));
      } catch {}
    }
  }

  // Clone and sort students
  return [...students].sort((a, b) => {
    const aId = a.backendId || a.id;
    const aName = (a.name || '').toLowerCase().trim();
    const aRoll = (a.rollNumber || a.studentIdNumber || '').toLowerCase().trim();

    const bId = b.backendId || b.id;
    const bName = (b.name || '').toLowerCase().trim();
    const bRoll = (b.rollNumber || b.studentIdNumber || '').toLowerCase().trim();

    const aLocal = localMap[aId] || localMap[aName] || localMap[aRoll];
    const bLocal = localMap[bId] || localMap[bName] || localMap[bRoll];

    const aEvt = eventMap[aId] || eventMap[aName] || eventMap[aRoll];
    const bEvt = eventMap[bId] || eventMap[bName] || eventMap[bRoll];

    const aEvtCount = aEvt?.count || 0;
    const bEvtCount = bEvt?.count || 0;

    // Count local awards within the rolling window
    let aLocalCount = (aLocal?.timestamps || [])
      .filter((t) => typeof t === 'number' && now - t <= RECENT_WINDOW_MS).length || (
        aLocal?.lastAwardedAt && (now - aLocal.lastAwardedAt <= RECENT_WINDOW_MS) ? aLocal.count : 0
      );
    let bLocalCount = (bLocal?.timestamps || [])
      .filter((t) => typeof t === 'number' && now - t <= RECENT_WINDOW_MS).length || (
        bLocal?.lastAwardedAt && (now - bLocal.lastAwardedAt <= RECENT_WINDOW_MS) ? bLocal.count : 0
      );

    // If a student has ZERO events on the ledger and ZERO current tokens,
    // residual localStorage entries from an old wiped session are invalid ghosts and must be discarded.
    if (aEvtCount === 0 && (Number(a.tokens) || 0) === 0 && (a.pendingDelta || 0) === 0) {
      aLocalCount = 0;
    }
    if (bEvtCount === 0 && (Number(b.tokens) || 0) === 0 && (b.pendingDelta || 0) === 0) {
      bLocalCount = 0;
    }

    // Recent award frequency over the last day or so
    const aFreq = Math.max(aLocalCount, aEvtCount);
    const bFreq = Math.max(bLocalCount, bEvtCount);

    // 1. Primary: Frequency of awarding over the last day or so
    if (aFreq !== bFreq) {
      return bFreq - aFreq;
    }

    // 2. Secondary / Tie-breaker: Among students with equal recent frequency, the more recently awarded student comes first
    const aLastTime = Math.max(aLocal?.lastAwardedAt || 0, aEvt?.lastAwardedAt || 0);
    const bLastTime = Math.max(bLocal?.lastAwardedAt || 0, bEvt?.lastAwardedAt || 0);

    if (aLastTime !== bLastTime) {
      return bLastTime - aLastTime;
    }

    // 3. Fallback: Alphabetical order by name
    return (a.name || '').localeCompare(b.name || '');
  });
}

/**
 * Get top N recently/frequently active students.
 */
export function getRecentlySelectedStudents(students = [], events = [], limit = 5) {
  return rankStudentsByActivity(students, events).slice(0, limit);
}
