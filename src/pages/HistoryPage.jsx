import { useState, useEffect, useRef } from 'react'
import { get } from '../utils/api.js'

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

  const fetchEvents = async () => {
    try {
      const data = await get(`/api/sections/${SECTION_ID}/events`)
      if (Array.isArray(data.events)) {
        const mapped = data.events.map((raw) => ({
          id: raw.id,
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
        }))
        setEvents(mapped)
      }
    } catch (err) {
      console.error('Failed to load events:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEvents()
    pollTimerRef.current = setInterval(fetchEvents, 2500)
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [])

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
          <p className="page-subtitle">Computer Science 101 • Section A</p>
        </div>

        <div className="event-count-badge">
          <span>📜 {filteredEvents.length} Events</span>
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
                  className={`history-row ${evt.isCorrection ? 'is-correction-row' : ''}`}
                >
                  <span className="col-time time-text">{evt.time}</span>

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
