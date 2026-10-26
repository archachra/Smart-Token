import { useState, useEffect, useCallback, useRef } from 'react'
import { DEMO_STUDENT_NAMES } from '../data/demoStudents'
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

const SECTION_ID = '043f0728-c357-4e72-b6ce-62823cc064b7'

const initialStudents = [
  { rollNumber: 'CS101-001', name: 'Arnav Chachra', seat: 'Row 1 • Seat 3', tokens: 4, initials: 'AC', color: '#2563eb', isRecent: true },
  { rollNumber: 'CS101-015', name: 'Shaurya', seat: 'Row 3 • Seat 1', tokens: 3, initials: 'S', color: '#0284c7', isRecent: false },
  { rollNumber: 'CS101-014', name: 'Piyush', seat: 'Row 2 • Seat 2', tokens: 5, initials: 'P', color: '#059669', isRecent: false },
  { rollNumber: 'CS101-007', name: 'Rhythm', seat: 'Row 4 • Seat 4', tokens: 2, initials: 'R', color: '#7c3aed', isRecent: false },
  { rollNumber: 'CS101-006', name: 'Kunal', seat: 'Row 1 • Seat 5', tokens: 1, initials: 'K', color: '#d97706', isRecent: false },
  { rollNumber: 'CS101-008', name: 'Aditya Gupta', seat: 'Row 2 • Seat 4', tokens: 2, initials: 'AG', color: '#db2777', isRecent: true },
  { rollNumber: 'CS101-009', name: 'Arjan Singh Sawhney', seat: 'Row 3 • Seat 2', tokens: 5, initials: 'AS', color: '#65a30d', isRecent: true },
  { rollNumber: 'CS101-010', name: 'Ashmeen Kaur', seat: 'Row 1 • Seat 2', tokens: 6, initials: 'AK', color: '#0891b2', isRecent: false },
  { rollNumber: 'CS101-011', name: 'Charvi', seat: 'Row 4 • Seat 1', tokens: 3, initials: 'C', color: '#4f46e5', isRecent: false },
  { rollNumber: 'CS101-012', name: 'Gagandeep Kaur', seat: 'Row 2 • Seat 3', tokens: 4, initials: 'GK', color: '#ca8a04', isRecent: false },
  { rollNumber: 'CS101-013', name: 'Jaskaran Singh', seat: 'Row 3 • Seat 5', tokens: 1, initials: 'JS', color: '#9333ea', isRecent: false },
  { rollNumber: 'CS101-016', name: 'Jasroop', seat: 'Row 1 • Seat 4', tokens: 3, initials: 'J', color: '#e11d48', isRecent: false },
  { rollNumber: 'CS101-017', name: 'Kanishak', seat: 'Row 4 • Seat 2', tokens: 2, initials: 'K', color: '#2563eb', isRecent: false },
  { rollNumber: 'CS101-018', name: 'Kashish Kannojiya', seat: 'Row 1 • Seat 1', tokens: 3, initials: 'KK', color: '#d97706', isRecent: true },
  { rollNumber: 'CS101-019', name: 'Khushi', seat: 'Row 2 • Seat 5', tokens: 7, initials: 'K', color: '#059669', isRecent: true },
]

const presetMap = new Map(initialStudents.map((s) => [s.name.toLowerCase(), s]))

const orderedStudents = DEMO_STUDENT_NAMES.map((name, index) => {
  const preset = presetMap.get(name.toLowerCase())
  const rollNumber = preset?.rollNumber || `CS101-${String(index + 1).padStart(3, '0')}`
  const initials = preset?.initials || name.split(' ').map((part) => part[0]).join('').slice(0, 2)

  return {
    id: `demo-${index + 1}`,
    rollNumber,
    name,
    seat: preset?.seat || `Row ${Math.floor(index / 5) + 1} • Seat ${(index % 5) + 1}`,
    tokens: preset?.tokens || 0,
    serverTokens: preset?.tokens || 0,
    initials,
    color: preset?.color || '#64748b',
    isRecent: Boolean(preset?.isRecent),
  }
})

export default function QuickTokenPage() {
  const [students, setStudents] = useState(orderedStudents)
  const [pendingDeltas, setPendingDeltas] = useState({})
  const [visiblePendingDeltas, setVisiblePendingDeltas] = useState({})
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )
  const [searchQuery, setSearchQuery] = useState('')

  const pendingTimersRef = useRef(new Map())
  const isOnlineRef = useRef(isOnline)
  useEffect(() => {
    isOnlineRef.current = isOnline
  }, [isOnline])

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

    // 1. Try fetching live roster from backend
    try {
      const data = await get(`/api/sections/${SECTION_ID}/students`)
      if (Array.isArray(data.students)) {
        rawStudents = data.students
        // Persist fresh roster into IndexedDB for offline viewing
        if (user?.userId) {
          await cacheRoster(user.userId, SECTION_ID, data.students)
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
    }
  }, [loadRoster, loadPendingDeltas])

  // Total classroom tokens dynamically includes server tokens + pending local tokens
  const totalClassroomTokens = students.reduce((sum, s) => {
    const delta = s.backendId ? (pendingDeltas[s.backendId] || 0) : 0
    return sum + s.tokens + delta
  }, 0)

  const handleAddToken = async (id) => {
    const target = students.find((s) => s.id === id)
    if (!target) return

    const studentId = target.backendId
    const clientEventId = crypto.randomUUID()

    // Persist action safely in IndexedDB BEFORE reporting complete in UI
    if (studentId) {
      try {
        await queueAction({
          actionType: 'TOKEN_AWARD',
          endpoint: '/api/events',
          method: 'POST',
          sectionId: SECTION_ID,
          studentId: studentId,
          studentName: target.name,
          rollNumber: target.rollNumber,
          tokenChange: 1,
          description: 'Awarded token for Quick Token response in class',
          payload: {
            sectionId: SECTION_ID,
            studentId: studentId,
            tokenChange: 1,
            eventType: 'TOKEN_AWARD',
            description: 'Awarded token for Quick Token response in class',
            clientEventId,
          },
        })

        // Optimistically update display token balance immediately
        setPendingDeltas((prev) => ({
          ...prev,
          [studentId]: (prev[studentId] || 0) + 1,
        }))

        // For pending badge: if offline, show immediately.
        // If online, only show if sync does not complete within prompt grace period.
        if (!isOnlineRef.current) {
          setVisiblePendingDeltas((prev) => ({
            ...prev,
            [studentId]: (prev[studentId] || 0) + 1,
          }))
        } else {
          const timerId = setTimeout(() => {
            pendingTimersRef.current.delete(clientEventId)
            setVisiblePendingDeltas((prev) => ({
              ...prev,
              [studentId]: (prev[studentId] || 0) + 1,
            }))
          }, PROMPT_SYNC_MS)
          pendingTimersRef.current.set(clientEventId, timerId)
        }
      } catch (err) {
        console.error('Failed to queue token award into IndexedDB:', err)
      }
    } else {
      setStudents((prev) =>
        prev.map((s) => (s.id === id ? { ...s, tokens: s.tokens + 1 } : s))
      )
    }
  }

  const handleSubtractToken = async (id) => {
    const target = students.find((s) => s.id === id)
    if (!target) return

    const studentId = target.backendId
    const clientEventId = crypto.randomUUID()

    // Persist action safely in IndexedDB BEFORE reporting complete in UI
    if (studentId) {
      try {
        await queueAction({
          actionType: 'CORRECTION',
          endpoint: '/api/events',
          method: 'POST',
          sectionId: SECTION_ID,
          studentId: studentId,
          studentName: target.name,
          rollNumber: target.rollNumber,
          tokenChange: -1,
          description: 'Corrected accidental token award',
          payload: {
            sectionId: SECTION_ID,
            studentId: studentId,
            tokenChange: -1,
            eventType: 'CORRECTION',
            description: 'Corrected accidental token award',
            clientEventId,
          },
        })

        // Optimistically update display token balance immediately
        setPendingDeltas((prev) => ({
          ...prev,
          [studentId]: (prev[studentId] || 0) - 1,
        }))

        // For pending badge: if offline, show immediately.
        // If online, only show if sync does not complete within prompt grace period.
        if (!isOnlineRef.current) {
          setVisiblePendingDeltas((prev) => ({
            ...prev,
            [studentId]: (prev[studentId] || 0) - 1,
          }))
        } else {
          const timerId = setTimeout(() => {
            pendingTimersRef.current.delete(clientEventId)
            setVisiblePendingDeltas((prev) => ({
              ...prev,
              [studentId]: (prev[studentId] || 0) - 1,
            }))
          }, PROMPT_SYNC_MS)
          pendingTimersRef.current.set(clientEventId, timerId)
        }
      } catch (err) {
        console.error('Failed to queue token correction into IndexedDB:', err)
      }
    } else {
      setStudents((prev) =>
        prev.map((s) => (s.id === id ? { ...s, tokens: Math.max(0, s.tokens - 1) } : s))
      )
    }
  }

  // Filter students by search query
  const filteredStudents = students.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.rollNumber.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const recentStudents = students.slice(0, 5)

  return (
    <div className="quick-token-container">
      {/* Header & Overall Metric */}
      <div className="quick-token-header">
        <div>
          <h2>Quick Token</h2>
          <p className="page-subtitle">Computer Science 101 • Section A</p>
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
              <h3 className="section-title">⚡ Recently Selected Students</h3>
              <p className="section-subtitle">Quick-access token awarding for recently active students</p>
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

                    <button
                      className="token-action-btn"
                      onClick={() => handleAddToken(student.id)}
                    >
                      +1 Token
                    </button>
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
                    <div className="col-action action-btn-group">
                      <button
                        className="ctrl-btn dec"
                        onClick={() => handleSubtractToken(student.id)}
                        title="Decrease token count by 1"
                      >
                        -
                      </button>
                      <button
                        className="token-action-btn"
                        onClick={() => handleAddToken(student.id)}
                      >
                        +1 Token
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
