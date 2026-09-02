import { useState } from 'react'

const initialRoster = [
  { id: 1, rollNumber: 'CS101-001', name: 'Alex Johnson', isPresent: true },
  { id: 2, rollNumber: 'CS101-002', name: 'Amanda Foster', isPresent: true },
  { id: 3, rollNumber: 'CS101-003', name: 'Benjamin Lee', isPresent: true },
  { id: 4, rollNumber: 'CS101-004', name: 'Catherine Zhang', isPresent: true },
  { id: 5, rollNumber: 'CS101-005', name: 'Daniel Smith', isPresent: true },
  { id: 6, rollNumber: 'CS101-006', name: 'David Kim', isPresent: true },
  { id: 7, rollNumber: 'CS101-007', name: 'Emily Rodriguez', isPresent: true },
  { id: 8, rollNumber: 'CS101-008', name: 'Grace Hopper', isPresent: true },
  { id: 9, rollNumber: 'CS101-009', name: 'Hannah Abbott', isPresent: true },
  { id: 10, rollNumber: 'CS101-010', name: 'Ian Malcolm', isPresent: true },
  { id: 11, rollNumber: 'CS101-011', name: 'Jacob Miller', isPresent: true },
  { id: 12, rollNumber: 'CS101-012', name: 'Jessica Davis', isPresent: true },
  { id: 13, rollNumber: 'CS101-013', name: 'Liam Wilson', isPresent: true },
  { id: 14, rollNumber: 'CS101-014', name: 'Marcus Vance', isPresent: true },
  { id: 15, rollNumber: 'CS101-015', name: 'Sarah Chen', isPresent: true },
]

export default function AttendancePage() {
  const [students, setStudents] = useState(initialRoster)

  const toggleAttendance = (id) => {
    setStudents((prev) =>
      prev.map((student) =>
        student.id === id
          ? { ...student, isPresent: !student.isPresent }
          : student
      )
    )
  }

  const presentCount = students.filter((s) => s.isPresent).length
  const totalCount = students.length

  return (
    <div className="attendance-container">
      {/* Header Area */}
      <div className="attendance-header">
        <div>
          <h2>Attendance</h2>
          <p className="page-subtitle">Computer Science 101 • Section A</p>
        </div>

        {/* Summary Card */}
        <div className="attendance-summary-badge">
          <span className="summary-icon">📋</span>
          <span className="summary-text">
            <strong>{presentCount} / {totalCount}</strong> Present
          </span>
        </div>
      </div>

      {/* Roster Card */}
      <div className="roster-card card">
        <div className="roster-table-header">
          <span className="col-roll">Roll Number</span>
          <span className="col-name">Student Name</span>
          <span className="col-status">Attendance Status</span>
        </div>

        <div className="roster-list">
          {students.map((student) => (
            <div key={student.id} className="roster-row">
              <span className="col-roll roll-number">{student.rollNumber}</span>
              <span className="col-name student-name-text">{student.name}</span>
              <div className="col-status">
                <button
                  className={`attendance-toggle-btn ${
                    student.isPresent ? 'present' : 'absent'
                  }`}
                  onClick={() => toggleAttendance(student.id)}
                  aria-label={`Toggle attendance for ${student.name}`}
                >
                  <span className="checkbox-icon">
                    {student.isPresent ? '☑' : '☐'}
                  </span>
                  <span className="status-text">
                    {student.isPresent ? 'Present' : 'Absent'}
                  </span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
