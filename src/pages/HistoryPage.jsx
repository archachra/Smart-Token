import { useState } from 'react'

const mockEvents = [
  {
    id: 1,
    time: 'Today, 2:45 PM',
    studentName: 'Sarah Chen',
    rollNumber: 'CS101-015',
    type: 'Token Award',
    tokenChange: '+1',
    description: 'Awarded token for Quick Token response in class',
    isCorrection: false,
  },
  {
    id: 2,
    time: 'Today, 2:30 PM',
    studentName: 'Marcus Vance',
    rollNumber: 'CS101-014',
    type: 'Correction',
    tokenChange: '-1',
    description: 'Corrected accidental duplicate token award',
    isCorrection: true,
    originalAction: 'Original Action: Awarded +2 Tokens for Q2 answer at 2:15 PM',
    correctionNote: 'Correction Applied: Deducted -1 Token (Adjusted Total: +1 Token)',
  },
  {
    id: 3,
    time: 'Today, 2:15 PM',
    studentName: 'Marcus Vance',
    rollNumber: 'CS101-014',
    type: 'Token Award',
    tokenChange: '+2',
    description: 'Awarded tokens for Q2 classroom presentation',
    isCorrection: false,
  },
  {
    id: 4,
    time: 'Today, 1:50 PM',
    studentName: 'David Kim',
    rollNumber: 'CS101-006',
    type: 'Participation',
    tokenChange: '+1',
    description: 'Recorded live speech participation during discussion',
    isCorrection: false,
  },
  {
    id: 5,
    time: 'Today, 1:30 PM',
    studentName: 'Alex Johnson',
    rollNumber: 'CS101-001',
    type: 'Correction',
    tokenChange: '0',
    description: 'Corrected initial roll call attendance status',
    isCorrection: true,
    originalAction: 'Original Action: Marked Absent at 1:00 PM',
    correctionNote: 'Correction Applied: Updated status to Present (Late Arrival)',
  },
  {
    id: 6,
    time: 'Today, 1:00 PM',
    studentName: 'Alex Johnson',
    rollNumber: 'CS101-001',
    type: 'Attendance',
    tokenChange: '0',
    description: 'Marked Absent during initial class roll call',
    isCorrection: false,
  },
  {
    id: 7,
    time: 'Yesterday, 4:20 PM',
    studentName: 'Emily Rodriguez',
    rollNumber: 'CS101-007',
    type: 'Token Award',
    tokenChange: '+3',
    description: 'Approved Lab 3 submission token reward',
    isCorrection: false,
  },
  {
    id: 8,
    time: 'Yesterday, 3:10 PM',
    studentName: 'Amanda Foster',
    rollNumber: 'CS101-002',
    type: 'Attendance',
    tokenChange: '0',
    description: 'Marked Present during class roll call',
    isCorrection: false,
  },
]

const studentOptions = [
  'All Students',
  'Alex Johnson',
  'Amanda Foster',
  'David Kim',
  'Emily Rodriguez',
  'Marcus Vance',
  'Sarah Chen',
]

const eventTypeOptions = [
  'All Types',
  'Attendance',
  'Participation',
  'Token Award',
  'Correction',
]

export default function HistoryPage() {
  const [selectedType, setSelectedType] = useState('All Types')
  const [selectedStudent, setSelectedStudent] = useState('All Students')

  const filteredEvents = mockEvents.filter((evt) => {
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
        {filteredEvents.length === 0 ? (
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
