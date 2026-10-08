import { useState } from 'react'
import { DEMO_STUDENT_NAMES } from '../data/demoStudents'

const initialStudents = [
  { id: 1, rollNumber: 'CS101-001', name: 'Arnav Chachra', seat: 'Row 1 • Seat 3', tokens: 4, initials: 'AC', color: '#2563eb', isRecent: true },
  { id: 2, rollNumber: 'CS101-002', name: 'Shaurya', seat: 'Row 3 • Seat 1', tokens: 3, initials: 'S', color: '#0284c7', isRecent: false },
  { id: 3, rollNumber: 'CS101-003', name: 'Piyush', seat: 'Row 2 • Seat 2', tokens: 5, initials: 'P', color: '#059669', isRecent: false },
  { id: 4, rollNumber: 'CS101-004', name: 'Rhythm', seat: 'Row 4 • Seat 4', tokens: 2, initials: 'R', color: '#7c3aed', isRecent: false },
  { id: 5, rollNumber: 'CS101-005', name: 'Kunal', seat: 'Row 1 • Seat 5', tokens: 1, initials: 'K', color: '#d97706', isRecent: false },
  { id: 6, rollNumber: 'CS101-006', name: 'Aditya Gupta', seat: 'Row 2 • Seat 4', tokens: 2, initials: 'AG', color: '#db2777', isRecent: true },
  { id: 7, rollNumber: 'CS101-007', name: 'Arjan Singh Sawhney', seat: 'Row 3 • Seat 2', tokens: 5, initials: 'AS', color: '#65a30d', isRecent: true },
  { id: 8, rollNumber: 'CS101-008', name: 'Ashmeen Kaur', seat: 'Row 1 • Seat 2', tokens: 6, initials: 'AK', color: '#0891b2', isRecent: false },
  { id: 9, rollNumber: 'CS101-009', name: 'Charvi', seat: 'Row 4 • Seat 1', tokens: 3, initials: 'C', color: '#4f46e5', isRecent: false },
  { id: 10, rollNumber: 'CS101-010', name: 'Gagandeep Kaur', seat: 'Row 2 • Seat 3', tokens: 4, initials: 'GK', color: '#ca8a04', isRecent: false },
  { id: 11, rollNumber: 'CS101-011', name: 'Jaskaran Singh', seat: 'Row 3 • Seat 5', tokens: 1, initials: 'JS', color: '#9333ea', isRecent: false },
  { id: 12, rollNumber: 'CS101-012', name: 'Jasroop', seat: 'Row 1 • Seat 4', tokens: 3, initials: 'J', color: '#e11d48', isRecent: false },
  { id: 13, rollNumber: 'CS101-013', name: 'Kanishak', seat: 'Row 4 • Seat 2', tokens: 2, initials: 'K', color: '#2563eb', isRecent: false },
  { id: 14, rollNumber: 'CS101-014', name: 'Kashish Kannojiya', seat: 'Row 1 • Seat 1', tokens: 3, initials: 'KK', color: '#d97706', isRecent: true },
  { id: 15, rollNumber: 'CS101-015', name: 'Khushi', seat: 'Row 2 • Seat 5', tokens: 7, initials: 'K', color: '#059669', isRecent: true },
]

const orderedStudents = DEMO_STUDENT_NAMES.map((name, index) =>
  initialStudents.find((student) => student.name === name) || {
    id: index + 1,
    rollNumber: `CS101-${String(index + 1).padStart(3, '0')}`,
    name,
    tokens: 0,
    initials: name.split(' ').map((part) => part[0]).join('').slice(0, 2),
    color: '#64748b',
    isRecent: false,
  }
)

export default function QuickTokenPage() {
  const [students, setStudents] = useState(orderedStudents)
  const [searchQuery, setSearchQuery] = useState('')

  // Calculate total classroom tokens dynamically
  const totalClassroomTokens = students.reduce((sum, s) => sum + s.tokens, 0)

  const handleAddToken = (id) => {
    setStudents((prev) =>
      prev.map((s) => (s.id === id ? { ...s, tokens: s.tokens + 1 } : s))
    )
  }

  const handleSubtractToken = (id) => {
    setStudents((prev) =>
      prev.map((s) => (s.id === id ? { ...s, tokens: s.tokens - 1 } : s))
    )
  }

  // Filter students by search query
  const filteredStudents = students.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.rollNumber.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Keep the quick-access cards aligned with the required demo roster order.
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
            {recentStudents.map((student) => (
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
                    <span className="token-count">{student.tokens}</span>
                    <span className="token-unit">tokens</span>
                  </div>

                  <button
                    className="token-action-btn"
                    onClick={() => handleAddToken(student.id)}
                  >
                    +1 Token
                  </button>
                </div>
              </div>
            ))}
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
              {filteredStudents.map((student) => (
                <div key={student.id} className="token-table-row">
                  <span className="col-roll roll-number">{student.rollNumber}</span>
                  <span className="col-name student-name-text">{student.name}</span>
                  <span className="col-total token-total-text">🪙 {student.tokens} tokens</span>
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
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
