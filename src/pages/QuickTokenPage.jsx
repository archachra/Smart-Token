import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { CLASS_3Q13_STUDENTS } from '../data/demoStudents'
import { get } from '../utils/api.js'
import {
  queueAction,
  getCurrentUser,
  subscribeSyncState,
  PROMPT_SYNC_MS,
} from '../utils/syncManager.js'
import {
  cacheRoster,
  getCachedRoster,
  getPendingActionsForSection,
} from '../utils/offlineDb.js'
import {
  recordStudentAward,
  recordStudentCorrection,
  getRecentlySelectedStudents,
} from '../utils/recentStudents.js'

const SECTION_ID = '043f0728-c357-4e72-b6ce-62823cc064b7'

const COLOR_PALETTE = ['#2563eb', '#0284c7', '#059669', '#7c3aed', '#d97706', '#db2777', '#65a30d', '#0891b2', '#4f46e5']

const orderedStudents = CLASS_3Q13_STUDENTS.map((student, index) => {
  const initials = student.name.split(' ').map((part) => part[0]).join('').slice(0, 2)

  return {
    id: `demo-${index + 1}`,
    rollNumber: student.rollNumber,
    name: student.name,
    seat: `Row ${Math.floor(index / 5) + 1} • Seat ${(index % 5) + 1}`,
    tokens: 0,
    serverTokens: 0,
    initials,
    color: COLOR_PALETTE[index % COLOR_PALETTE.length],
    isRecent: false,
  }
})

export default function QuickTokenPage() {
  const [students, setStudents] = useState(orderedStudents)
  const [events, setEvents] = useState([])
  const [recentTrigger, setRecentTrigger] = useState(0)
  const [pendingDeltas, setPendingDeltas] = useState({})
  const [visiblePendingDeltas, setVisiblePendingDeltas] = useState({})
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )
  const [searchQuery, setSearchQuery] = useState('')

  const pendingTimersRef = useRef(new Map())
  const batchAwardRef = useRef(new Map())
  const isOnlineRef = useRef(isOnline)
  useEffect(() => {
    isOnlineRef.current = isOnline
  }, [isOnline])

  // Listen for real-time recent student award updates across pages
  useEffect(() => {
    const handleRecent = () => setRecentTrigger((c) => c + 1)
    window.addEventListener('recent-students-updated', handleRecent)
    return () => window.removeEventListener('recent-students-updated', handleRecent)
  }, [])

  const loadPendingDeltas = useCallback(async () => {
    try {
      const actions = await getPendingActionsForSection(SECTION_ID)
      const deltas = {}
      const visibleDeltas = {}
      const now = Date.now()
      const currentIsOnline = isOnlineRef.current

      actions.forEach((act) => {
        if (
          act.studentId &&
          !act.permanentError &&
          (act.actionType === 'TOKEN_AWARD' || act.actionType === 'CORRECTION')
        ) {
          deltas[act.studentId] = (deltas[act.studentId] || 0) + act.tokenChange

          // If offline, or if the action was created >= PROMPT_SYNC_MS ago, or has failed/retried:
          const age = now - new Date(act.createdAt).getTime()
          if (!currentIsOnline || age >= PROMPT_SYNC_MS || act.attempts > 0 || act.status === 'failed') {
            visibleDeltas[act.studentId] = (visibleDeltas[act.studentId] || 0) + act.tokenChange
          }
        }
      })
      setPendingDeltas(deltas)
      setVisiblePendingDeltas(visibleDeltas)
    } catch (e) {
      console.warn('Failed to load pending deltas:', e)
    }
  }, [])

  const loadRoster = useCallback(async () => {
    const user = getCurrentUser()
    let rawStudents = null

    // 1. Try fetching live roster and event history from backend
    try {
      const [rosterData, eventsData] = await Promise.all([
        get(`/api/sections/${SECTION_ID}/students`),
        get(`/api/sections/${SECTION_ID}/events`).catch(() => ({ events: [] })),
      ])

      if (Array.isArray(eventsData?.events)) {
        setEvents(eventsData.events)
      }

      if (Array.isArray(rosterData?.students)) {
        rawStudents = rosterData.students
        // Persist fresh roster into IndexedDB for offline viewing
        if (user?.userId) {
          await cacheRoster(user.userId, SECTION_ID, rosterData.students)
        }
      }
    } catch (err) {
      console.warn('Network fetch failed, attempting IndexedDB cache:', err.message)
      // 2. Offline fallback: load cached roster from IndexedDB
      if (user?.userId) {
        rawStudents = await getCachedRoster(user.userId, SECTION_ID)
      }
    }

    if (Array.isArray(rawStudents)) {
      setStudents(() => {
        const claimedBackendIds = new Set()

        const updated = orderedStudents.map((student) => {
          const matched = rawStudents.find(
            (bs) =>
              !claimedBackendIds.has(bs.id) &&
              bs.name.toLowerCase().trim() === student.name.toLowerCase().trim()
          )
          if (matched) {
            claimedBackendIds.add(matched.id)
            return {
              ...student,
              backendId: matched.id,
              rollNumber: matched.studentIdNumber || student.rollNumber,
              serverTokens: Number(matched.balance) || 0,
              tokens: Number(matched.balance) || student.tokens,
            }
          }
          return student
        })

        const seenBackendIds = new Set()
        const extraStudents = []

        for (const bs of rawStudents) {
          if (!bs.id || claimedBackendIds.has(bs.id) || seenBackendIds.has(bs.id)) {
            continue
          }
          seenBackendIds.add(bs.id)
          extraStudents.push({
            id: `backend-${bs.id}`,
            backendId: bs.id,
            rollNumber: bs.studentIdNumber || '—',
            name: bs.name,
            tokens: Number(bs.balance) || 0,
            serverTokens: Number(bs.balance) || 0,
            initials: bs.name.split(' ').map((p) => p[0]).join('').slice(0, 2),
            color: '#0284c7',
            isRecent: false,
          })
        }

        return [...updated, ...extraStudents]
      })
    }

    await loadPendingDeltas()
  }, [loadPendingDeltas])

  useEffect(() => {
    loadRoster()

    const unsubscribe = subscribeSyncState((state) => {
      setIsOnline(state.isOnline)
      isOnlineRef.current = state.isOnline
      loadPendingDeltas()
    })

    // Listen for sync events so balances and pending tags update immediately
    const handleActionSynced = (e) => {
      const clientEventId = e.detail?.clientEventId
      if (clientEventId && pendingTimersRef.current.has(clientEventId)) {
        clearTimeout(pendingTimersRef.current.get(clientEventId))
        pendingTimersRef.current.delete(clientEventId)
      }
      loadRoster()
    }

    window.addEventListener('smarttoken-action-synced', handleActionSynced)

    return () => {
      unsubscribe()
      window.removeEventListener('smarttoken-action-synced', handleActionSynced)
      pendingTimersRef.current.forEach((timerId) => clearTimeout(timerId))
      pendingTimersRef.current.clear()
      batchAwardRef.current.forEach((batch) => {
        clearTimeout(batch.timerId)
        batch.flush()
      })
      batchAwardRef.current.clear()
    }
  }, [loadRoster, loadPendingDeltas])

  // Total classroom tokens dynamically includes server tokens + pending local tokens
  const totalClassroomTokens = students.reduce((sum, s) => {
    const delta = s.backendId ? (pendingDeltas[s.backendId] || 0) : 0
    return sum + s.tokens + delta
  }, 0)

  // Debounced batch accumulator: multiple rapid clicks (+1, +1, +1) are aggregated
  // into a single transaction (e.g. +3 direct) in the history ledger and backend.
  const handleModifyToken = (id, delta) => {
    const target = students.find((s) => s.id === id)
    if (!target) return

    if (delta > 0) {
      recordStudentAward(target)
    } else if (delta < 0) {
      recordStudentCorrection(target)
    }
    setRecentTrigger((c) => c + 1)

    const studentId = target.backendId
    if (!studentId) {
      setStudents((prev) =>
        prev.map((s) => (s.id === id ? { ...s, tokens: Math.max(0, s.tokens + delta) } : s))
      )
      return
    }

    // 1. Immediately update displayed optimistic token count with zero delay
    setPendingDeltas((prev) => ({
      ...prev,
      [studentId]: (prev[studentId] || 0) + delta,
    }))

    // 2. Debounce and aggregate rapid clicks within 850ms window
    const existing = batchAwardRef.current.get(studentId)
    let newDelta = delta
    if (existing) {
      clearTimeout(existing.timerId)
      newDelta = existing.accumulatedDelta + delta
    }

    const commitBatch = async (accumulatedDelta) => {
      batchAwardRef.current.delete(studentId)
      if (accumulatedDelta === 0) return

      const isAward = accumulatedDelta > 0
      const actionType = isAward ? 'TOKEN_AWARD' : 'CORRECTION'
      const count = Math.abs(accumulatedDelta)
      const tokenWord = count === 1 ? 'token' : 'tokens'
      const description = isAward
        ? `Awarded ${count} ${tokenWord} for Quick Token response in class`
        : `Corrected accidental token award (${count} ${tokenWord})`
      const clientEventId = crypto.randomUUID()

      try {
        await queueAction({
          actionType,
          endpoint: '/api/events',
          method: 'POST',
          sectionId: SECTION_ID,
          studentId: studentId,
          studentName: target.name,
          rollNumber: target.rollNumber,
          tokenChange: accumulatedDelta,
          description,
          payload: {
            sectionId: SECTION_ID,
            studentId: studentId,
            tokenChange: accumulatedDelta,
            eventType: actionType,
            description,
            clientEventId,
          },
        })

        // Optimistically add single aggregated event to events state
        const optimisticEvent = {
          id: clientEventId,
          clientEventId,
          sectionId: SECTION_ID,
          studentId: studentId,
          studentName: target.name,
          rollNumber: target.rollNumber,
          eventType: actionType,
          tokenChange: accumulatedDelta,
          description,
          createdAt: new Date().toISOString(),
        }
        setEvents((prev) => [optimisticEvent, ...prev])

        // For pending badge: if offline, show immediately.
        // If online, only show if sync does not complete within prompt grace period.
        if (!isOnlineRef.current) {
          setVisiblePendingDeltas((prev) => ({
            ...prev,
            [studentId]: (prev[studentId] || 0) + accumulatedDelta,
          }))
        } else {
          const timerId = setTimeout(() => {
            pendingTimersRef.current.delete(clientEventId)
            setVisiblePendingDeltas((prev) => ({
              ...prev,
              [studentId]: (prev[studentId] || 0) + accumulatedDelta,
            }))
          }, PROMPT_SYNC_MS)
          pendingTimersRef.current.set(clientEventId, timerId)
        }
      } catch (err) {
        console.error('Failed to queue token award/correction into IndexedDB:', err)
      }
    }

    const timerId = setTimeout(() => {
      commitBatch(newDelta)
    }, 850)

    batchAwardRef.current.set(studentId, {
      accumulatedDelta: newDelta,
      timerId,
      flush: () => commitBatch(newDelta),
    })
  }

  const handleAddToken = (id) => handleModifyToken(id, 1)
  const handleSubtractToken = (id) => handleModifyToken(id, -1)

  // Filter students by search query
  const filteredStudents = students.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.rollNumber.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Attach current active deltas to students for real-time ranking
  const studentsWithDeltas = useMemo(() => {
    return students.map((s) => ({
      ...s,
      pendingDelta: s.backendId ? (pendingDeltas[s.backendId] || 0) : 0,
      tokens: s.tokens + (s.backendId ? (pendingDeltas[s.backendId] || 0) : 0),
    }))
  }, [students, pendingDeltas])

  // Rank students so frequently & recently awarded students appear at the top
  const recentStudents = useMemo(() => {
    return getRecentlySelectedStudents(studentsWithDeltas, events, 5)
  }, [studentsWithDeltas, events, recentTrigger])

  return (
    <div className="quick-token-container">
      {/* Header & Overall Metric */}
      <div className="quick-token-header">
        <div>
          <h2>Quick Token</h2>
          <p className="page-subtitle">3Q13</p>
        </div>

        {/* Overall Total Tokens Summary Card */}
        <div className="total-tokens-summary-card">
          <span className="total-tokens-icon">🪙</span>
          <div className="total-tokens-info">
            <span className="total-tokens-value">{totalClassroomTokens}</span>
            <span className="total-tokens-label">Total Classroom Tokens</span>
          </div>
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="search-bar-wrapper">
        <span className="search-icon">🔍</span>
        <input
          type="text"
          className="search-input"
          placeholder="Search student by name or roll number..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            className="clear-search-btn"
            onClick={() => setSearchQuery('')}
          >
            ✕
          </button>
        )}
      </div>

      {/* Recently Selected Students Section (only show if no search filter active) */}
      {!searchQuery && (
        <section className="quick-token-section">
          <div className="section-header">
            <div>
              <h3 className="section-title">⚡ Frequently & Recently Selected</h3>
              <p className="section-subtitle">Quick-access token awarding prioritized by award frequency & recent activity</p>
            </div>
          </div>

          <div className="student-grid">
            {recentStudents.map((student) => {
              const delta = student.backendId ? (pendingDeltas[student.backendId] || 0) : 0
              const visibleDelta = student.backendId ? (visiblePendingDeltas[student.backendId] || 0) : 0
              const displayTokens = student.tokens + delta

              return (
                <div key={student.id} className="student-card">
                  <div className="student-header">
                    <div
                      className="student-avatar"
                      style={{ backgroundColor: student.color }}
                    >
                      {student.initials}
                    </div>
                    <div className="student-details">
                      <h4 className="student-name">{student.name}</h4>
                      <span className="student-seat">{student.rollNumber}</span>
                    </div>
                  </div>

                  <div className="student-body">
                    <div className="token-counter">
                      <button
                        className="ctrl-btn dec"
                        onClick={() => handleSubtractToken(student.id)}
                        title="Decrease token count by 1"
                      >
                        -
                      </button>
                      <span className="token-icon">🪙</span>
                      <span className="token-count">{displayTokens}</span>
                      <span className="token-unit">tokens</span>
                      {visibleDelta !== 0 && (
                        <span className="pending-token-tag" title="Locally queued, awaiting ledger sync">
                          {visibleDelta > 0 ? `+${visibleDelta}` : visibleDelta} pending
                        </span>
                      )}
                    </div>

                    <div className="token-btn-group" style={{ display: 'flex', gap: '6px' }}>
                      <button
                        className="token-action-btn"
                        onClick={() => handleModifyToken(student.id, 1)}
                        title="Click to add token (+1, tap multiple times to batch)"
                      >
                        +1
                      </button>
                      <button
                        className="token-action-btn"
                        style={{
                          background: 'linear-gradient(135deg, #7c3aed, #6366f1)',
                          borderColor: '#6d28d9',
                          fontWeight: 700,
                          padding: '8px 12px',
                        }}
                        onClick={() => handleModifyToken(student.id, 3)}
                        title="Award 3 tokens directly"
                      >
                        +3
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Full Alphabetical Student List */}
      <section className="full-roster-section card">
        <div className="section-header">
          <h3 className="section-title">Classroom Roster</h3>
          <span className="roster-count">{filteredStudents.length} Students</span>
        </div>

        {filteredStudents.length === 0 ? (
          <div className="no-results">
            <p>No students found matching "{searchQuery}"</p>
          </div>
        ) : (
          <div className="token-roster-table">
            <div className="token-table-header">
              <span className="col-roll">Roll Number</span>
              <span className="col-name">Student Name</span>
              <span className="col-total">Total Tokens</span>
              <span className="col-action">Action</span>
            </div>

            <div className="token-table-body">
              {filteredStudents.map((student) => {
                const delta = student.backendId ? (pendingDeltas[student.backendId] || 0) : 0
                const visibleDelta = student.backendId ? (visiblePendingDeltas[student.backendId] || 0) : 0
                const displayTokens = student.tokens + delta

                return (
                  <div
                    key={student.id}
                    className={`token-table-row ${visibleDelta !== 0 ? 'pending-row-highlight' : ''}`}
                  >
                    <span className="col-roll roll-number">{student.rollNumber}</span>
                    <span className="col-name student-name-text">{student.name}</span>
                    <span className="col-total token-total-text">
                      🪙 {displayTokens} tokens
                      {visibleDelta !== 0 && (
                        <span className="pending-token-tag" title="Locally queued, awaiting ledger sync">
                          {visibleDelta > 0 ? `+${visibleDelta}` : visibleDelta} pending
                        </span>
                      )}
                    </span>
                    <div className="col-action action-btn-group" style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <button
                        className="ctrl-btn dec"
                        onClick={() => handleModifyToken(student.id, -1)}
                        title="Decrease token count by 1"
                      >
                        -
                      </button>
                      <button
                        className="token-action-btn"
                        onClick={() => handleModifyToken(student.id, 1)}
                        title="Click to add token (+1, tap multiple times to batch)"
                      >
                        +1
                      </button>
                      <button
                        className="token-action-btn"
                        style={{
                          background: 'linear-gradient(135deg, #7c3aed, #6366f1)',
                          borderColor: '#6d28d9',
                          fontWeight: 700,
                          padding: '6px 12px',
                        }}
                        onClick={() => handleModifyToken(student.id, 3)}
                        title="Award 3 tokens directly"
                      >
                        +3
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
