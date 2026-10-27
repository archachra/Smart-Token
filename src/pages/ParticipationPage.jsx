import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { get, post, put, patch } from '../utils/api.js'
import { CLASS_3Q13_STUDENTS } from '../data/demoStudents'

// Section ID (hard‑coded for demo)
const SECTION_ID = '043f0728-c357-4e72-b6ce-62823cc064b7'

const COLOR_PALETTE = ['#2563eb', '#0284c7', '#059669', '#7c3aed', '#d97706', '#db2777', '#65a30d', '#0891b2', '#4f46e5']

const rosterStudents = CLASS_3Q13_STUDENTS.map((student, index) => {
  const initials = student.name.split(' ').map((part) => part[0]).join('').slice(0, 2)
  return {
    id: index + 1,
    rollNumber: student.rollNumber,
    name: student.name,
    seat: `Row ${Math.floor(index / 5) + 1} • Seat ${(index % 5) + 1}`,
    initials,
    color: COLOR_PALETTE[index % COLOR_PALETTE.length],
  }
})

export default function ParticipationPage() {
  const [students, setStudents] = useState([])

  // Active Discussion Topic & Extra Info (Set by faculty, inherited by students)
  const [topic, setTopic] = useState('')
  const [extraInfo, setExtraInfo] = useState('')
  const [isSavingTopic, setIsSavingTopic] = useState(false)
  const [topicMessage, setTopicMessage] = useState(null)

  // In-Class "Record from Here" state
  const [recordingStudentId, setRecordingStudentId] = useState(null)
  const [recordingSessionId, setRecordingSessionId] = useState(null)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [isSavingRecording, setIsSavingRecording] = useState(false)
  const [actionFeedback, setActionFeedback] = useState(null)

  const mediaRecorderRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const audioChunksRef = useRef([])
  const recordingTimerRef = useRef(null)

  /* =========================================================================
   * LEGACY RAISED-HANDS STATE & QUEUE POLLING (Kept commented out per instructions)
   *
  const [raisedHands, setRaisedHands] = useState([])
  const [extraInfos, setExtraInfos] = useState({})
  const [approveErrors, setApproveErrors] = useState({})
  const pollTimer = useRef(null)

  useEffect(() => {
    async function fetchQueue() {
      try {
        const data = await get(`/api/sections/${SECTION_ID}/participation/raised`)
        const mapped = (data.requests || []).map((req) => ({
          id: req.id,
          studentId: req.studentId,
          studentName: req.studentName,
          time: new Date(req.raisedAt).toLocaleTimeString(),
        }))
        setRaisedHands(mapped)
      } catch (e) {
        console.error('Failed to load raised-hand queue', e)
      }
    }
    fetchQueue()
    pollTimer.current = setInterval(fetchQueue, 2500)
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current)
    }
  }, [])

  const handleApprove = async (requestId) => {
    const currentTopic = topic.trim()
    const info = (extraInfos[requestId] || '').trim()
    if (!currentTopic) {
      setApproveErrors((prev) => ({ ...prev, [requestId]: 'Topic is required to approve' }))
      return
    }
    setApproveErrors((prev) => ({ ...prev, [requestId]: null }))
    try {
      await post(`/api/sections/${SECTION_ID}/participation/raised/${requestId}/approve`, {
        topic: currentTopic,
        extraInfo: info || null,
      })
      setRaisedHands((prev) => prev.filter((item) => item.id !== requestId))
    } catch (e) {
      console.error('Approve failed', e)
      setApproveErrors((prev) => ({ ...prev, [requestId]: e.message || 'Approve failed' }))
    }
  }
  ========================================================================= */

  // Load roster from backend database
  useEffect(() => {
    async function loadRoster() {
      try {
        const data = await get(`/api/sections/${SECTION_ID}/students`)
        if (Array.isArray(data.students) && data.students.length > 0) {
          const mapped = data.students.map((bs, idx) => {
            const demo = rosterStudents.find(
              (ds) => ds.name.toLowerCase().trim() === bs.name.toLowerCase().trim()
            )
            const initials =
              demo?.initials ||
              bs.name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase() ||
              'ST'
            const color = demo?.color || COLOR_PALETTE[idx % COLOR_PALETTE.length]
            return {
              id: bs.id,
              backendId: bs.id,
              name: bs.name,
              rollNumber: bs.studentIdNumber || demo?.rollNumber || `CS101-${String(idx + 1).padStart(3, '0')}`,
              seat: demo?.seat || `Row ${Math.floor(idx / 5) + 1} • Seat ${(idx % 5) + 1}`,
              initials,
              color,
              balance: bs.balance,
            }
          })
          setStudents(mapped)
        } else {
          // Fallback to demo roster if backend empty
          setStudents(rosterStudents)
        }
      } catch (err) {
        console.error('Failed to load roster for participation:', err)
        setStudents(rosterStudents)
      }
    }
    loadRoster()
  }, [])

  // Load current discussion topic on mount
  useEffect(() => {
    async function fetchTopic() {
      try {
        const data = await get(`/api/sections/${SECTION_ID}/participation/topic`)
        if (data) {
          setTopic(data.topic || '')
          setExtraInfo(data.extraInfo || '')
        }
      } catch (err) {
        console.error('Failed to load active discussion topic:', err)
      }
    }
    fetchTopic()
  }, [])

  // Cleanup media stream and timers on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop())
      }
    }
  }, [])

  // Save discussion topic and guiding prompt
  const handleSaveTopic = async (e) => {
    if (e) e.preventDefault()
    setIsSavingTopic(true)
    setTopicMessage(null)
    try {
      await put(`/api/sections/${SECTION_ID}/participation/topic`, {
        topic: topic.trim(),
        extraInfo: extraInfo.trim(),
      })
      setTopicMessage({ type: 'success', text: '✅ Discussion topic & prompt updated for students!' })
      setTimeout(() => setTopicMessage(null), 3500)
    } catch (err) {
      console.error('Failed to update topic:', err)
      setTopicMessage({ type: 'error', text: err.message || 'Failed to save topic' })
    } finally {
      setIsSavingTopic(false)
    }
  }

  // Functional "Record from Here" for faculty recording a student in class
  const handleStartFacultyRecording = async (student) => {
    const studentId = student.backendId || student.id
    if (!studentId) return

    // If already recording another student, stop them first
    if (recordingStudentId) {
      await handleStopFacultyRecording()
    }

    setActionFeedback(null)
    try {
      // 1. Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream

      // 2. Create recording session on backend
      const resp = await post(`/api/sections/${SECTION_ID}/participation/recordings`, {
        studentId,
        topic: topic.trim() || undefined,
        extraInfo: extraInfo.trim() || undefined,
      })

      const session = resp.session
      if (!session || !session.id) {
        throw new Error('Failed to create participation recording session on server.')
      }

      setRecordingStudentId(studentId)
      setRecordingSessionId(session.id)
      setRecordingDuration(0)

      // 3. Start MediaRecorder
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.start(100)

      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1)
      }, 1000)
    } catch (err) {
      console.error('Faculty recording start error:', err)
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop())
        mediaStreamRef.current = null
      }
      setActionFeedback({
        studentId,
        type: 'error',
        message: err.message || 'Microphone access denied or error starting recording.',
      })
    }
  }

  const handleStopFacultyRecording = async () => {
    if (!recordingSessionId || !recordingStudentId) return

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }

    setIsSavingRecording(true)
    const currentStudentId = recordingStudentId
    const currentSessionId = recordingSessionId

    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        await new Promise((resolve) => {
          mediaRecorderRef.current.onstop = resolve
          mediaRecorderRef.current.stop()
        })
      }

      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop())
        mediaStreamRef.current = null
      }

      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
      const reader = new FileReader()

      await new Promise((resolve, reject) => {
        reader.onloadend = async () => {
          try {
            const base64Audio = reader.result
            await patch(
              `/api/sections/${SECTION_ID}/participation/recordings/${currentSessionId}/complete`,
              { audioBase64: base64Audio }
            )

            const targetStudent = students.find((s) => (s.backendId || s.id) === currentStudentId)
            const studentName = targetStudent ? targetStudent.name : 'Student'

            setActionFeedback({
              studentId: currentStudentId,
              type: 'success',
              message: `🎉 Recording for ${studentName} completed! Transcribing & sent to Review page.`,
            })
            resolve()
          } catch (postErr) {
            reject(postErr)
          }
        }
        reader.onerror = reject
        reader.readAsDataURL(audioBlob)
      })
    } catch (err) {
      console.error('Faculty recording complete error:', err)
      setActionFeedback({
        studentId: currentStudentId,
        type: 'error',
        message: 'The recording was captured, but failed to save to server.',
      })
    } finally {
      setRecordingStudentId(null)
      setRecordingSessionId(null)
      setRecordingDuration(0)
      setIsSavingRecording(false)
      setTimeout(() => {
        setActionFeedback((prev) => (prev?.studentId === currentStudentId ? null : prev))
      }, 6000)
    }
  }

  const handleToggleRecording = (student) => {
    const sId = student.backendId || student.id
    if (recordingStudentId === sId) {
      handleStopFacultyRecording()
    } else {
      handleStartFacultyRecording(student)
    }
  }

  const formatDuration = (secs) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div className="participation-container">
      {/* Two Column Layout Grid */}
      <div className="participation-layout">
        {/* Main Area (Left Column): Classroom Roster & Direct Recording */}
        <main className="participation-main">
          <div className="page-header">
            <h2>Participation</h2>
            <p className="page-subtitle">Computer Science 101 • 3Q13</p>
          </div>

          {actionFeedback && (
            <div
              style={{
                padding: '0.85rem 1.1rem',
                borderRadius: '8px',
                border: actionFeedback.type === 'success' ? '1px solid #86efac' : '1px solid #fca5a5',
                backgroundColor: actionFeedback.type === 'success' ? '#f0fdf4' : '#fef2f2',
                color: actionFeedback.type === 'success' ? '#166534' : '#dc2626',
                fontWeight: 500,
                fontSize: '0.92rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>{actionFeedback.message}</span>
              <button
                onClick={() => setActionFeedback(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: 'inherit' }}
              >
                ✕
              </button>
            </div>
          )}

          <div className="student-boxes-section">
            <div className="section-subheader">
              <h3>Classroom Roster</h3>
              <span className="roster-count">{students.length} Students</span>
            </div>

            <div className="alphabetical-student-grid">
              {students.map((student) => {
                const sId = student.backendId || student.id
                const isRecording = recordingStudentId === sId

                return (
                  <div
                    key={student.id}
                    className={`student-box ${isRecording ? 'recording' : ''}`}
                    onClick={() => handleToggleRecording(student)}
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
                          <span className="recording-dot">🔴</span> {formatDuration(recordingDuration)}
                        </div>
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
                      disabled={isSavingRecording && isRecording}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleToggleRecording(student)
                      }}
                    >
                      {isRecording
                        ? isSavingRecording
                          ? 'Saving...'
                          : '⏹️ Stop Recording'
                        : '🎙️ Record from Here'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </main>

        {/* Right Panel: Class Discussion Prompt & Settings */}
        <aside className="raised-hands-panel card">
          <div className="panel-header">
            <div className="panel-title-wrapper">
              <span className="panel-icon">💡</span>
              <h3>Discussion Prompt</h3>
            </div>
            <span
              style={{
                backgroundColor: topic ? '#dcfce7' : '#f1f5f9',
                color: topic ? '#15803d' : '#64748b',
                fontWeight: 700,
                fontSize: '0.75rem',
                padding: '0.2rem 0.55rem',
                borderRadius: '9999px',
                border: topic ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
              }}
            >
              {topic ? 'Topic Active' : 'Open Floor'}
            </span>
          </div>

          <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.82rem', color: '#64748b', lineHeight: 1.4 }}>
            Set the topic and guiding question. Students see this on their devices and can speak at any time.
          </p>

          <form onSubmit={handleSaveTopic} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <label htmlFor="section-topic" style={{ fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>
                Session Topic
              </label>
              <input
                id="section-topic"
                type="text"
                placeholder="e.g. Computer Networks - TCP vs UDP"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                style={{
                  padding: '0.5rem 0.65rem',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.88rem',
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <label htmlFor="section-extra-info" style={{ fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>
                Guiding Question / Prompt (Optional)
              </label>
              <textarea
                id="section-extra-info"
                rows={3}
                placeholder="e.g. Explain 3-way handshake vs UDP datagram delivery trade-offs."
                value={extraInfo}
                onChange={(e) => setExtraInfo(e.target.value)}
                style={{
                  padding: '0.5rem 0.65rem',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.85rem',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            {topicMessage && (
              <div
                style={{
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  backgroundColor: topicMessage.type === 'success' ? '#f0fdf4' : '#fef2f2',
                  color: topicMessage.type === 'success' ? '#15803d' : '#dc2626',
                  border: topicMessage.type === 'success' ? '1px solid #bbf7d0' : '1px solid #fecaca',
                }}
              >
                {topicMessage.text}
              </div>
            )}

            <button
              type="submit"
              disabled={isSavingTopic}
              style={{
                padding: '0.55rem 1rem',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                transition: 'background-color 0.15s ease',
              }}
            >
              {isSavingTopic ? 'Saving...' : 'Save Discussion Prompt'}
            </button>
          </form>

          {/* Direct link to Review page */}
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0', textAlign: 'center' }}>
            <Link
              to="/review"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.55rem 1rem',
                backgroundColor: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                color: '#1e293b',
                fontWeight: 600,
                fontSize: '0.85rem',
                textDecoration: 'none',
                width: '100%',
                justifyContent: 'center',
              }}
            >
              📋 Open Participation Review →
            </Link>
          </div>

          {/* =========================================================================
           * LEGACY RAISED-HANDS QUEUE JSX (Kept commented out per instructions)
           *
          <div className="panel-header" style={{ marginTop: '1rem' }}>
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
              {raisedHands.map((item) => (
                <div key={item.id} className="raised-hand-card">
                  <div className="request-info">
                    <h4 className="request-student-name">{item.studentName}</h4>
                    <span className="request-time">{item.time}</span>
                  </div>
                  <div className="recording-controls">
                    <button className="recording-action-btn start" onClick={() => handleApprove(item.id)}>
                      Approve
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          ========================================================================= */}
        </aside>
      </div>
    </div>
  )
}
