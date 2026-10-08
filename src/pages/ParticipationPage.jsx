import { useState, useEffect, useRef } from 'react'
import { get, post } from '../utils/api.js'

// Section ID (hard‑coded for demo)
const SECTION_ID = '043f0728-c357-4e72-b6ce-62823cc064b7'

import { DEMO_STUDENT_NAMES } from '../data/demoStudents'

const rosterStudents = [
  { id: 1, rollNumber: 'CS101-001', name: 'Arnav Chachra', seat: 'Row 1 • Seat 3', initials: 'AC', color: '#2563eb' },
  { id: 2, rollNumber: 'CS101-002', name: 'Shaurya', seat: 'Row 3 • Seat 1', initials: 'S', color: '#0284c7' },
  { id: 3, rollNumber: 'CS101-003', name: 'Piyush', seat: 'Row 2 • Seat 2', initials: 'P', color: '#059669' },
  { id: 4, rollNumber: 'CS101-004', name: 'Rhythm', seat: 'Row 4 • Seat 4', initials: 'R', color: '#7c3aed' },
  { id: 5, rollNumber: 'CS101-005', name: 'Kunal', seat: 'Row 1 • Seat 5', initials: 'K', color: '#d97706' },
  { id: 6, rollNumber: 'CS101-006', name: 'Aditya Gupta', seat: 'Row 2 • Seat 4', initials: 'AG', color: '#db2777' },
  { id: 7, rollNumber: 'CS101-007', name: 'Arjan Singh Sawhney', seat: 'Row 3 • Seat 2', initials: 'AS', color: '#65a30d' },
  { id: 8, rollNumber: 'CS101-008', name: 'Ashmeen Kaur', seat: 'Row 1 • Seat 2', initials: 'AK', color: '#0891b2' },
  { id: 9, rollNumber: 'CS101-009', name: 'Charvi', seat: 'Row 4 • Seat 1', initials: 'C', color: '#4f46e5' },
  { id: 10, rollNumber: 'CS101-010', name: 'Gagandeep Kaur', seat: 'Row 2 • Seat 3', initials: 'GK', color: '#ca8a04' },
  { id: 11, rollNumber: 'CS101-011', name: 'Jaskaran Singh', seat: 'Row 3 • Seat 5', initials: 'JS', color: '#9333ea' },
  { id: 12, rollNumber: 'CS101-012', name: 'Jasroop', seat: 'Row 1 • Seat 4', initials: 'J', color: '#e11d48' },
  { id: 13, rollNumber: 'CS101-013', name: 'Kanishak', seat: 'Row 4 • Seat 2', initials: 'K', color: '#2563eb' },
  { id: 14, rollNumber: 'CS101-014', name: 'Kashish Kannojiya', seat: 'Row 1 • Seat 1', initials: 'KK', color: '#d97706' },
  { id: 15, rollNumber: 'CS101-015', name: 'Khushi', seat: 'Row 2 • Seat 5', initials: 'K', color: '#059669' },
  { id: 16, rollNumber: 'CS101-016', name: 'Prabhleen', seat: 'Row 1 • Seat 3', initials: 'P', color: '#2563eb' },
  { id: 17, rollNumber: 'CS101-017', name: 'Puneet Singh', seat: 'Row 3 • Seat 1', initials: 'PS', color: '#0284c7' },
  { id: 18, rollNumber: 'CS101-018', name: 'Rakshat', seat: 'Row 2 • Seat 2', initials: 'R', color: '#059669' },
  { id: 19, rollNumber: 'CS101-019', name: 'Rupinder Kaur', seat: 'Row 4 • Seat 4', initials: 'RK', color: '#7c3aed' },
  { id: 20, rollNumber: 'CS101-020', name: 'Surya', seat: 'Row 1 • Seat 5', initials: 'S', color: '#d97706' },
  { id: 21, rollNumber: 'CS101-021', name: 'Gourav', seat: 'Row 2 • Seat 4', initials: 'G', color: '#db2777' },
  { id: 22, rollNumber: 'CS101-022', name: 'Coral', seat: 'Row 3 • Seat 2', initials: 'C', color: '#65a30d' },
  { id: 23, rollNumber: 'CS101-023', name: 'Dhruv', seat: 'Row 1 • Seat 2', initials: 'D', color: '#0891b2' },
  { id: 24, rollNumber: 'CS101-024', name: 'Dishita Sharma', seat: 'Row 4 • Seat 1', initials: 'DS', color: '#4f46e5' },
  { id: 25, rollNumber: 'CS101-025', name: 'Harsith', seat: 'Row 2 • Seat 3', initials: 'H', color: '#ca8a04' },
  { id: 26, rollNumber: 'CS101-026', name: 'Himanshi Gupta', seat: 'Row 3 • Seat 5', initials: 'HG', color: '#9333ea' },
  { id: 27, rollNumber: 'CS101-027', name: 'Krrish Dhaneja', seat: 'Row 1 • Seat 4', initials: 'KD', color: '#e11d48' },
  { id: 28, rollNumber: 'CS101-028', name: 'Nachiket Singla', seat: 'Row 4 • Seat 2', initials: 'NS', color: '#2563eb' },
  { id: 29, rollNumber: 'CS101-029', name: 'Navdeep Jain', seat: 'Row 1 • Seat 1', initials: 'NJ', color: '#d97706' },
  { id: 30, rollNumber: 'CS101-030', name: 'Parth', seat: 'Row 2 • Seat 5', initials: 'P', color: '#059669' },
  { id: 31, rollNumber: 'CS101-031', name: 'Rahul', seat: 'Row 3 • Seat 3', initials: 'R', color: '#2563eb' },
]

const allStudents = DEMO_STUDENT_NAMES.map((name) => rosterStudents.find((student) => student.name === name)).filter(Boolean)

export default function ParticipationPage() {
  // raisedHands now comes from the backend API
  const [raisedHands, setRaisedHands] = useState([])
  const [recordings, setRecordings] = useState([])
  const [finalChanges, setFinalChanges] = useState({})
  const [finalizeErrors, setFinalizeErrors] = useState({})
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
          // Display human‑readable time offset – for simplicity show ISO string
          time: new Date(req.raisedAt).toLocaleTimeString(),
        }))
        setRaisedHands(mapped)
        const recordingData = await get(`/api/sections/${SECTION_ID}/participation/recordings`)
        setRecordings(recordingData.recordings || [])
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

  const [topic, setTopic] = useState('')
  const [extraInfos, setExtraInfos] = useState({})
  const [approveErrors, setApproveErrors] = useState({})

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
    const currentTopic = topic.trim()
    const extraInfo = (extraInfos[requestId] || '').trim()
    if (!currentTopic) {
      setApproveErrors((prev) => ({ ...prev, [requestId]: 'Topic is required to approve' }))
      return
    }
    setApproveErrors((prev) => ({ ...prev, [requestId]: null }))
    try {
      await post(`/api/sections/${SECTION_ID}/participation/raised/${requestId}/approve`, {
        topic: currentTopic,
        extraInfo: extraInfo || null,
      })
      // Optimistically remove the approved request from the queue
      setRaisedHands((prev) => prev.filter((item) => item.id !== requestId))
    } catch (e) {
      console.error('Approve failed', e)
      setApproveErrors((prev) => ({ ...prev, [requestId]: e.message || 'Approve failed' }))
    }
  }

  const finalizeEvaluation = async (recording, change) => {
    try {
      await post(`/api/sections/${SECTION_ID}/participation/recordings/${recording.id}/evaluation/decision`, { finalTokenChange: change })
      const refreshed = await get(`/api/sections/${SECTION_ID}/participation/recordings`)
      setRecordings(refreshed.recordings || [])
    } catch (e) {
      setFinalizeErrors((prev) => ({ ...prev, [recording.id]: e.message || 'Finalization failed' }))
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

          <div style={{ margin: '0.75rem 0', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <label htmlFor="section-topic" style={{ fontWeight: 600, fontSize: '0.85rem' }}>Topic for this class session</label>
            <input
              id="section-topic"
              type="text"
              placeholder="Topic (required) e.g. Computer Networks"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              style={{ padding: '0.45rem 0.5rem', borderRadius: '4px', border: '1px solid #ccc', fontSize: '0.85rem' }}
            />
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
              <span className="request-time">{item.time}</span>
                    </div>

                    {!isRecording && (
                      <div style={{ margin: '0.5rem 0', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        <input
                          type="text"
                          placeholder="Extra Info (optional) e.g. Explain TCP vs UDP"
                          value={extraInfos[item.id] || ''}
                          onChange={(e) => setExtraInfos({ ...extraInfos, [item.id]: e.target.value })}
                          style={{ padding: '0.35rem 0.5rem', borderRadius: '4px', border: '1px solid #ccc', fontSize: '0.85rem' }}
                        />
                        {approveErrors[item.id] && (
                          <span style={{ color: '#dc2626', fontSize: '0.75rem', fontWeight: 600 }}>{approveErrors[item.id]}</span>
                        )}
                      </div>
                    )}

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
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ marginTop: '1.5rem' }}>
            <div className="panel-header"><h3>Completed Responses</h3></div>
            {recordings.length === 0 ? <p>No recordings yet</p> : recordings.map((recording) => (
              <div key={recording.id} style={{ padding: '0.7rem 0', borderBottom: '1px solid #e2e8f0' }}>
                <strong>{recording.studentName}</strong>
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{recording.topic}</div>
                {recording.transcriptionStatus === 'COMPLETED' ? (
                  <p style={{ margin: '0.35rem 0 0' }}>{recording.transcript || '(Empty transcript)'}</p>
                ) : recording.transcriptionStatus === 'FAILED' ? (
                  <p style={{ margin: '0.35rem 0 0', color: '#dc2626' }}>Transcription failed</p>
                ) : (
                  <p style={{ margin: '0.35rem 0 0', color: '#64748b' }}>Transcription processing…</p>
                )}
                {(!recording.evaluationStatus || recording.evaluationStatus === 'PENDING' || recording.evaluationStatus === 'PROCESSING') && (
                  <p style={{ margin: '0.35rem 0 0', color: '#64748b', fontSize: '0.85rem' }}>
                    {recording.transcriptionStatus === 'COMPLETED' ? 'Evaluation processing…' : 'Waiting for transcript to evaluate…'}
                  </p>
                )}
                {(recording.evaluationStatus === 'COMPLETED' || recording.evaluationStatus === 'FINALIZED') && (
                  <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: '#f8fafc' }}>
                    <strong>AI suggestion (faculty review required)</strong>
                    <div>{recording.evaluationRelevant ? 'Relevant' : 'Not relevant'} · {recording.evaluationCorrect ? 'Correct' : 'Needs improvement'}</div>
                    <div>{recording.evaluationReason}</div>
                    <div>Suggested token change: {recording.suggestedTokenChange > 0 ? '+' : ''}{recording.suggestedTokenChange}</div>
                    {recording.evaluationStatus === 'FINALIZED' ? (
                      <div style={{ color: '#166534', fontWeight: 600 }}>Finalized: {recording.finalTokenChange > 0 ? '+' : ''}{recording.finalTokenChange} token(s)</div>
                    ) : (
                      <div style={{ marginTop: '0.5rem' }}>
                        <button className="recording-action-btn start" onClick={() => finalizeEvaluation(recording, recording.suggestedTokenChange)}>Approve Suggestion</button>
                        <select value={finalChanges[recording.id] ?? recording.suggestedTokenChange} onChange={(e) => setFinalChanges((prev) => ({ ...prev, [recording.id]: Number(e.target.value) }))} style={{ marginLeft: '0.5rem' }}>
                          <option value="-1">-1</option><option value="0">0</option><option value="1">+1</option><option value="2">+2</option><option value="3">+3</option>
                        </select>
                        <button className="recording-action-btn start" onClick={() => finalizeEvaluation(recording, finalChanges[recording.id] ?? recording.suggestedTokenChange)} style={{ marginLeft: '0.5rem' }}>Finalize Edited</button>
                        {finalizeErrors[recording.id] && <div style={{ color: '#dc2626' }}>{finalizeErrors[recording.id]}</div>}
                      </div>
                    )}
                  </div>
                )}
                {recording.evaluationStatus === 'FAILED' && <p style={{ color: '#dc2626', fontSize: '0.85rem', margin: '0.35rem 0 0' }}>AI evaluation failed; no token change was made.</p>}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}
