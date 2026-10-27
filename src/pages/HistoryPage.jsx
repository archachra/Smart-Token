import { useState, useEffect, useRef, useCallback } from 'react'
import { get, del } from '../utils/api.js'
import { getCurrentUser } from '../utils/syncManager.js'
import {
  cacheHistory,
  getCachedHistory,
  getPendingActionsForSection,
} from '../utils/offlineDb.js'
import { clearRecentAwards } from '../utils/recentStudents.js'

const SECTION_ID = '043f0728-c357-4e72-b6ce-62823cc064b7'

const eventTypeOptions = [
  'All Types',
  'Attendance',
  'Participation',
  'Token Award',
  'Correction',
]

function formatEventTime(dateInput) {
  if (!dateInput) return ''
  const date = new Date(dateInput)
  if (isNaN(date.getTime())) return String(dateInput)

  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = date.toDateString() === yesterday.toDateString()

  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })

  if (isToday) {
    return `Today, ${timeStr}`
  }
  if (isYesterday) {
    return `Yesterday, ${timeStr}`
  }
  const dateStr = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  })
  return `${dateStr}, ${timeStr}`
}

function formatEventType(type) {
  if (!type) return 'Other'
  switch (String(type).toUpperCase()) {
    case 'TOKEN_AWARD':
      return 'Token Award'
    case 'PARTICIPATION':
      return 'Participation'
    case 'ATTENDANCE':
      return 'Attendance'
    case 'CORRECTION':
      return 'Correction'
    default:
      return type
  }
}

function formatTokenChange(tokenChange) {
  const num = Number(tokenChange)
  if (isNaN(num)) return '0'
  if (num > 0) return `+${num}`
  return String(num)
}

export default function HistoryPage() {
  const [events, setEvents] = useState([])
  const [selectedType, setSelectedType] = useState('All Types')
  const [selectedStudent, setSelectedStudent] = useState('All Students')
  const [loading, setLoading] = useState(true)
  const pollTimerRef = useRef(null)

  const fetchEvents = useCallback(async () => {
    const user = getCurrentUser()
    let serverEvents = []

    // 1. Fetch server events if online
    if (typeof navigator === 'undefined' || navigator.onLine) {
      try {
        const data = await get(`/api/sections/${SECTION_ID}/events`)
        if (Array.isArray(data.events)) {
          serverEvents = data.events
          if (user?.userId) {
            await cacheHistory(user.userId, SECTION_ID, data.events)
          }
        }
      } catch (err) {
        console.warn('Network error loading history, reading from IndexedDB cache:', err.message)
      }
    }

    // 2. If serverEvents is empty (e.g. offline), read from IndexedDB cache
    if (serverEvents.length === 0 && user?.userId) {
      const cached = await getCachedHistory(user.userId, SECTION_ID)
      if (Array.isArray(cached)) {
        serverEvents = cached
      }
    }

    // Map server-confirmed events
    const mappedServerEvents = serverEvents.map((raw) => ({
      id: raw.id,
      clientEventId: raw.clientEventId,
      time: formatEventTime(raw.createdAt),
      studentName: raw.studentName || 'Unknown Student',
      rollNumber: raw.rollNumber || '—',
      type: formatEventType(raw.eventType),
      tokenChange: formatTokenChange(raw.tokenChange),
      description: raw.description || 'Classroom event recorded',
      isCorrection: Boolean(raw.isCorrection || raw.eventType === 'CORRECTION' || raw.correctionOf),
      originalAction: raw.originalAction,
      correctionNote: raw.correctionNote,
      createdAt: raw.createdAt,
      isPending: false,
    }))

    // 3. Load locally pending actions from IndexedDB
    let pendingEvents = []
    try {
      const pendingActions = await getPendingActionsForSection(SECTION_ID)
      // Exclude any pending items that have already been confirmed by server (matched by clientEventId)
      const confirmedIds = new Set(mappedServerEvents.map((e) => e.clientEventId).filter(Boolean))

      pendingEvents = pendingActions
        .filter((act) => !confirmedIds.has(act.clientEventId))
        .map((act) => ({
          id: `pending-${act.clientEventId}`,
          clientEventId: act.clientEventId,
          time: `${formatEventTime(act.createdAt)}`,
          studentName: act.studentName || 'Unknown Student',
          rollNumber: act.rollNumber || '—',
          type: formatEventType(act.actionType),
          tokenChange: formatTokenChange(act.tokenChange),
          description: act.description || 'Locally queued action awaiting synchronization',
          isCorrection: act.actionType === 'CORRECTION',
          createdAt: act.createdAt,
          isPending: true,
          status: act.status,
          permanentError: act.permanentError,
          lastError: act.lastError,
        }))
    } catch (e) {
      console.warn('Failed to load pending history items:', e)
    }

    // Combine pending (top) and server events
    setEvents([...pendingEvents, ...mappedServerEvents])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchEvents()

    // Poll every 3 seconds
    pollTimerRef.current = setInterval(() => {
      fetchEvents()
    }, 3000)

    const handleActionSynced = () => {
      fetchEvents()
    }
    const handleSyncState = () => {
      fetchEvents()
    }

    window.addEventListener('smarttoken-action-synced', handleActionSynced)
    window.addEventListener('smarttoken-sync-state', handleSyncState)

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
      window.removeEventListener('smarttoken-action-synced', handleActionSynced)
      window.removeEventListener('smarttoken-sync-state', handleSyncState)
    }
  }, [fetchEvents])

  const [clearing, setClearing] = useState(false)

  const handleClearHistory = async () => {
    if (!window.confirm('Are you sure you want to clear all token history and reset student token balances to 0 for this class?')) {
      return
    }
    setClearing(true)
    try {
      await del(`/api/sections/${SECTION_ID}/events`)
      clearRecentAwards()
      const user = getCurrentUser()
      if (user?.userId) {
        await cacheHistory(user.userId, SECTION_ID, [])
      }
      await fetchEvents()
    } catch (err) {
      console.error('Failed to clear history:', err)
      alert('Failed to clear history: ' + (err.message || err))
    } finally {
      setClearing(false)
    }
  }

  const studentOptions = [
    'All Students',
    ...Array.from(new Set(events.map((evt) => evt.studentName).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b)
    ),
  ]

  const filteredEvents = events.filter((evt) => {
    const matchesType =
      selectedType === 'All Types' || evt.type === selectedType
    const matchesStudent =
      selectedStudent === 'All Students' || evt.studentName === selectedStudent
    return matchesType && matchesStudent
  })

  return (
    <div className="history-container">
      {/* Header */}
      <div className="history-header">
        <div>
          <h2>History</h2>
          <p className="page-subtitle">3Q13</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="event-count-badge">
            <span>📜 {filteredEvents.length} Events</span>
          </div>
          <button
            className="history-clear-btn"
            onClick={handleClearHistory}
            disabled={clearing || events.length === 0}
            title="Clear all token history and reset student token balances to 0"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.45rem 0.85rem',
              fontSize: '0.8rem',
              fontWeight: 600,
              background: '#fee2e2',
              color: '#dc2626',
              border: '1px solid #fca5a5',
              borderRadius: 'var(--radius-sm)',
              cursor: events.length === 0 ? 'not-allowed' : 'pointer',
              opacity: events.length === 0 ? 0.6 : 1,
              transition: 'var(--transition-fast)'
            }}
          >
            🗑️ {clearing ? 'Clearing...' : 'Clear History'}
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="history-filters-card card">
        <div className="filter-group">
          <label className="filter-label">Filter by Event Type:</label>
          <select
            className="filter-select"
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
          >
            {eventTypeOptions.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label className="filter-label">Filter by Student:</label>
          <select
            className="filter-select"
            value={selectedStudent}
            onChange={(e) => setSelectedStudent(e.target.value)}
          >
            {studentOptions.map((student) => (
              <option key={student} value={student}>
                {student}
              </option>
            ))}
          </select>
        </div>

        {(selectedType !== 'All Types' || selectedStudent !== 'All Students') && (
          <button
            className="reset-filters-btn"
            onClick={() => {
              setSelectedType('All Types')
              setSelectedStudent('All Students')
            }}
          >
            Reset Filters
          </button>
        )}
      </div>

      {/* History Events Table */}
      <div className="history-table-card card">
        {loading && events.length === 0 ? (
          <div className="no-events">
            <p>Loading history events...</p>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="no-events">
            <p>No events found matching the selected filters.</p>
          </div>
        ) : (
          <div className="history-table">
            <div className="history-table-header">
              <span className="col-time">Time</span>
              <span className="col-student">Student</span>
              <span className="col-type">Event Type</span>
              <span className="col-change">Token Change</span>
              <span className="col-desc">Description & Audit Details</span>
            </div>

            <div className="history-table-body">
              {filteredEvents.map((evt) => (
                <div
                  key={evt.id}
                  className={`history-row ${
                    evt.isPending ? 'pending-row-highlight' : evt.isCorrection ? 'is-correction-row' : ''
                  }`}
                >
                  <span className="col-time time-text">
                    {evt.time}
                    {evt.isPending && (
                      <span
                        className="pending-token-tag"
                        style={{
                          display: 'block',
                          width: 'fit-content',
                          marginTop: '0.2rem',
                          backgroundColor: evt.permanentError ? '#fee2e2' : '#fef3c7',
                          color: evt.permanentError ? '#991b1b' : '#92400e',
                          borderColor: evt.permanentError ? '#fca5a5' : '#fde68a',
                        }}
                      >
                        {evt.permanentError
                          ? 'Server rejected'
                          : evt.status === 'syncing'
                          ? 'Syncing...'
                          : 'Queued locally'}
                      </span>
                    )}
                  </span>

                  <div className="col-student">
                    <span className="student-name-text">{evt.studentName}</span>
                    <span className="student-roll">{evt.rollNumber}</span>
                  </div>

                  <div className="col-type">
                    <span
                      className={`type-pill ${evt.type.toLowerCase().replace(' ', '-')}`}
                    >
                      {evt.type}
                    </span>
                  </div>

                  <span
                    className={`col-change change-val ${
                      evt.tokenChange.startsWith('+')
                        ? 'pos'
                        : evt.tokenChange.startsWith('-')
                        ? 'neg'
                        : 'neutral'
                    }`}
                  >
                    {evt.tokenChange}
                  </span>

                  <div className="col-desc">
                    <p className="event-desc">{evt.description}</p>
                    {evt.isCorrection && (
                      <div className="correction-details-box">
                        <span className="orig-action">{evt.originalAction}</span>
                        <span className="corr-note">{evt.correctionNote}</span>
                      </div>
                    )}
                    {evt.isPending && evt.lastError && (
                      <div style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '0.25rem' }}>
                        Error: {evt.lastError}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
