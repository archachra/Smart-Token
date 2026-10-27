/**
 * Utility for managing and ranking recently & frequently selected students.
 * Synchronizes between Quick Token page and Home page via localStorage and custom window events.
 */

const RECENT_AWARDS_KEY = 'smarttoken_recent_awards';

/**
 * Record a token award action for a student to boost their recency & frequency.
 */
export function recordStudentAward(student) {
  if (!student) return;
  const id = student.backendId || student.id || student.studentIdNumber || student.rollNumber;
  const name = (student.name || '').toLowerCase().trim();

  try {
    const raw = localStorage.getItem(RECENT_AWARDS_KEY);
    const map = raw ? JSON.parse(raw) : {};

    const existing = map[id] || map[name] || { count: 0, lastAwardedAt: 0 };
    const currentTokens = Number(student.tokens ?? student.balance ?? 0) + 1;
    const newCount = Math.max((existing.count || 0) + 1, currentTokens);

    const updated = {
      id,
      name: student.name,
      count: newCount,
      lastAwardedAt: Date.now(),
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
 * Rank a list of students so that students who frequently get tokens stay at the top,
 * with recency used to rank newly active students and break ties.
 * High-frequency students (e.g. 10 awards) will not be abruptly overtaken by a student receiving 1 award.
 */
export function rankStudentsByActivity(students = [], events = []) {
  if (!Array.isArray(students) || students.length === 0) return [];

  const localMap = getRecentAwardMap();

  // Aggregate event ledger stats for each student
  const eventMap = {};
  if (Array.isArray(events)) {
    for (const evt of events) {
      const studentId = evt.studentId || evt.student_id;
      const studentName = (evt.studentName || evt.name || '').toLowerCase().trim();
      const time = new Date(evt.createdAt || evt.created_at || 0).getTime();
      const change = Number(evt.tokenChange ?? evt.token_change ?? 0);

      const keys = [studentId, studentName].filter(Boolean);
      for (const k of keys) {
        if (!eventMap[k]) {
          eventMap[k] = { count: 0, lastAwardedAt: 0 };
        }
        if (change > 0) {
          eventMap[k].count += change;
        }
        if (time > eventMap[k].lastAwardedAt) {
          eventMap[k].lastAwardedAt = time;
        }
      }
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

    const aEvt = eventMap[aId] || eventMap[aName];
    const bEvt = eventMap[bId] || eventMap[bName];

    // Compute total award frequency (from local clicks, ledger events, and token balance)
    const aTokens = Number(a.tokens ?? a.balance ?? 0);
    const bTokens = Number(b.tokens ?? b.balance ?? 0);

    const aFreq = Math.max(aLocal?.count || 0, aEvt?.count || 0, aTokens);
    const bFreq = Math.max(bLocal?.count || 0, bEvt?.count || 0, bTokens);

    // 1. Primary: Higher frequency stays at the top (e.g. 10 tokens > 1 token)
    if (aFreq !== bFreq) {
      return bFreq - aFreq;
    }

    // 2. Secondary / Tie-breaker: Among students with equal frequency, the more recently awarded student comes first
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
