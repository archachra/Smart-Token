import { useState, useEffect, useRef } from 'react'
import { get, post } from '../utils/api.js'

// Section ID (hard‑coded for demo)
const SECTION_ID = '043f0728-c357-4e72-b6ce-62823cc064b7'

const allStudents = [
  { id: 1, rollNumber: 'CS101-001', name: 'Alex Johnson', seat: 'Row 1 • Seat 3', initials: 'AJ', color: '#2563eb' },
  { id: 2, rollNumber: 'CS101-002', name: 'Amanda Foster', seat: 'Row 3 • Seat 1', initials: 'AF', color: '#0284c7' },
  { id: 3, rollNumber: 'CS101-003', name: 'Benjamin Lee', seat: 'Row 2 • Seat 2', initials: 'BL', color: '#059669' },
  { id: 4, rollNumber: 'CS101-004', name: 'Catherine Zhang', seat: 'Row 4 • Seat 4', initials: 'CZ', color: '#7c3aed' },
  { id: 5, rollNumber: 'CS101-005', name: 'Daniel Smith', seat: 'Row 1 • Seat 5', initials: 'DS', color: '#d97706' },
  { id: 6, rollNumber: 'CS101-006', name: 'David Kim', seat: 'Row 2 • Seat 4', initials: 'DK', color: '#db2777' },
  { id: 7, rollNumber: 'CS101-007', name: 'Emily Rodriguez', seat: 'Row 3 • Seat 2', initials: 'ER', color: '#65a30d' },
  { id: 8, rollNumber: 'CS101-008', name: 'Grace Hopper', seat: 'Row 1 • Seat 2', initials: 'GH', color: '#0891b2' },
  { id: 9, rollNumber: 'CS101-009', name: 'Hannah Abbott', seat: 'Row 4 • Seat 1', initials: 'HA', color: '#4f46e5' },
  { id: 10, rollNumber: 'CS101-010', name: 'Ian Malcolm', seat: 'Row 2 • Seat 3', initials: 'IM', color: '#ca8a04' },
  { id: 11, rollNumber: 'CS101-011', name: 'Jacob Miller', seat: 'Row 3 • Seat 5', initials: 'JM', color: '#9333ea' },
  { id: 12, rollNumber: 'CS101-012', name: 'Jessica Davis', seat: 'Row 1 • Seat 4', initials: 'JD', color: '#e11d48' },
  { id: 13, rollNumber: 'CS101-013', name: 'Liam Wilson', seat: 'Row 4 • Seat 2', initials: 'LW', color: '#2563eb' },
  { id: 14, rollNumber: 'CS101-014', name: 'Marcus Vance', seat: 'Row 1 • Seat 1', initials: 'MV', color: '#d97706' },
  { id: 15, rollNumber: 'CS101-015', name: 'Sarah Chen', seat: 'Row 2 • Seat 5', initials: 'SC', color: '#059669' },
]

export default function ParticipationPage() {
  // raisedHands now comes from the backend API
  const [raisedHands, setRaisedHands] = useState([])
  const [recordingStudentId, setRecordingStudentId] = useState(null)
  const pollTimer = useRef(null)

  // Load raised‑hand queue on mount and start polling
  useEffect(() => {
    async function fetchQueue() {
      try {
        const data = await get(`/api/sections/${SECTION_ID}/participation/raised`)
        // Backend returns { requests: [] }
        const mapped = (data.requests || []).map((req) => ({
          id: req.id,
          studentId: req.studentId,
          studentName: req.studentName,
          // Use studentIdNumber as a placeholder for seat/info if needed
          seat: req.studentIdNumber || '',
          // Display human‑readable time offset – for simplicity show ISO string
          time: new Date(req.raisedAt).toLocaleTimeString(),
        }))
        setRaisedHands(mapped)
      } catch (e) {
        console.error('Failed to load raised‑hand queue', e)
      }
    }
    fetchQueue()
    pollTimer.current = setInterval(fetchQueue, 2500)
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current)
    }
  }, [])

  const handleStartRecording = (studentId) => {
    setRecordingStudentId(studentId)
  }

  const handleStopRecording = (studentId) => {
    setRecordingStudentId(null)
    // Remove student from raised‑hand queue if present
    setRaisedHands((prev) => prev.filter((item) => item.studentId !== studentId))
  }

  const handleToggleRecording = (studentId) => {
    if (recordingStudentId === studentId) {
      handleStopRecording(studentId)
    } else {
      handleStartRecording(studentId)
    }
  }

  const handleApprove = async (requestId) => {
    try {
      await post(`/api/sections/${SECTION_ID}/participation/raised/${requestId}/approve`)
      // Optimistically remove the approved request from the queue
      setRaisedHands((prev) => prev.filter((item) => item.id !== requestId))
    } catch (e) {
      console.error('Approve failed', e)
    }
  }

  return (
    <div className="participation-container">
      {/* Two Column Layout Grid */}
      <div className="participation-layout">
        {/* Main Area (Left Column) */}
        <main className="participation-main">
          <div className="page-header">
            <h2>Participation</h2>
            <p className="page-subtitle">Computer Science 101 • Section A</p>
          </div>

          <div className="student-boxes-section">
            <div className="section-subheader">
              <h3>Classroom Roster</h3>
              <span className="roster-count">{allStudents.length} Students</span>
            </div>

            <div className="alphabetical-student-grid">
              {allStudents.map((student) => {
                const isRecording = recordingStudentId === student.id
                const isHandRaised = raisedHands.some((item) => item.studentId === student.id)

                return (
                  <div
                    key={student.id}
                    className={`student-box ${isRecording ? 'recording' : ''} ${
                      isHandRaised ? 'hand-raised' : ''
                    }`}
                    onClick={() => handleToggleRecording(student.id)}
                  >
                    <div className="box-top">
                      <div
                        className="box-avatar"
                        style={{ backgroundColor: student.color }}
                      >
                        {student.initials}
                      </div>
                      {isRecording && (
                        <div className="recording-badge pulse">
                          <span className="recording-dot">🔴</span> Recording...
                        </div>
                      )}
                      {!isRecording && isHandRaised && (
                        <span className="hand-badge" title="Raised Hand">✋</span>
                      )}
                    </div>

                    <div className="box-info">
                      <h4 className="box-student-name">{student.name}</h4>
                      <span className="box-roll">{student.rollNumber}</span>
                    </div>

                    <button
                      className={`box-recording-btn ${
                        isRecording ? 'stop-btn' : 'start-btn'
                      }`}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleToggleRecording(student.id)
                      }}
                    >
                      {isRecording ? 'Stop Recording' : 'Record from Here'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </main>

        {/* Right Panel: Raised Hands Queue */}
        <aside className="raised-hands-panel card">
          <div className="panel-header">
            <div className="panel-title-wrapper">
              <span className="panel-icon">✋</span>
              <h3>Raised Hands</h3>
            </div>
            <span className="queue-badge">{raisedHands.length}</span>
          </div>

          {raisedHands.length === 0 ? (
            <div className="empty-queue">
              <p>No raised hands right now</p>
            </div>
          ) : (
            <div className="raised-hands-list">
              {raisedHands.map((item) => {
                const isRecording = recordingStudentId === item.studentId

                return (
                  <div
                    key={item.id}
                    className={`raised-hand-card ${
                      isRecording ? 'is-recording' : ''
                    }`}
                  >
                    <div className="request-info">
                      <h4 className="request-student-name">{item.studentName}</h4>
                      <span className="request-time">{item.seat} • {item.time}</span>
                    </div>

                    {isRecording ? (
                      <div className="recording-controls">
                        <span className="recording-status-text">🔴 Recording...</span>
                        <button
                          className="recording-action-btn stop"
                          onClick={() => handleStopRecording(item.studentId)}
                        >
                          Stop Recording
                        </button>
                      </div>
                    ) : (
                      <div className="recording-controls">
                        <button
                          className="recording-action-btn start"
                          onClick={() => handleApprove(item.id)}
                        >
                          Approve
                        </button>
                        <button
                          className="recording-action-btn start"
                          onClick={() => handleStartRecording(item.studentId)}
                        >
                          Start Recording
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
