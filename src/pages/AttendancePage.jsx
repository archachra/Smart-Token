import { useEffect, useState } from 'react'
import { ATTENDANCE_STORAGE_KEY, createDemoRoster } from '../data/demoStudents'
import { get, patch } from '../utils/api.js'

const SECTION_ID = '043f0728-c357-4e72-b6ce-62823cc064b7'
const initialRoster = createDemoRoster()

export default function AttendancePage() {
  const [students, setStudents] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(ATTENDANCE_STORAGE_KEY))
      return Array.isArray(saved) && saved.length === initialRoster.length ? saved : initialRoster
    } catch {
      return initialRoster
    }
  })

  useEffect(() => {
    localStorage.setItem(ATTENDANCE_STORAGE_KEY, JSON.stringify(students))
  }, [students])

  useEffect(() => {
    async function syncBackendRoster() {
      try {
        const data = await get(`/api/sections/${SECTION_ID}/students`)
        if (Array.isArray(data.students)) {
          setStudents((prev) =>
            prev.map((student) => {
              const matched = data.students.find(
                (bs) =>
                  bs.name.toLowerCase() === student.name.toLowerCase() ||
                  bs.studentIdNumber.toLowerCase() === student.rollNumber.toLowerCase()
              )
              return matched ? { ...student, backendId: matched.id } : student
            })
          )
        }
      } catch (err) {
        console.error('Failed to sync roster for attendance:', err)
      }
    }
    syncBackendRoster()
  }, [])

  const toggleAttendance = async (id) => {
    const target = students.find((s) => s.id === id)
    const nextState = !target.isPresent
    setStudents((prev) =>
      prev.map((student) =>
        student.id === id
          ? { ...student, isPresent: nextState }
          : student
      )
    )
    if (target?.backendId) {
      try {
        await patch(`/api/sections/${SECTION_ID}/students/${target.backendId}/attendance`, {
          status: nextState ? 'PRESENT' : 'ABSENT',
          clientEventId: crypto.randomUUID(),
        })
      } catch (err) {
        console.error('Failed to record attendance status change:', err)
      }
    }
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
