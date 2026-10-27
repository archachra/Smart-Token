import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { get, post, put, patch, del, postFormData } from '../utils/api.js'
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

  // Reference Material for AI Answer Evaluation
  const [materialName, setMaterialName] = useState(null)
  const [materialText, setMaterialText] = useState(null)
  const [isUploadingMaterial, setIsUploadingMaterial] = useState(false)
  const [materialInputMode, setMaterialInputMode] = useState('file') // 'file' | 'text'
  const [manualMaterialName, setManualMaterialName] = useState('')
  const [manualMaterialText, setManualMaterialText] = useState('')
  const [showMaterialPreview, setShowMaterialPreview] = useState(false)
  const [materialFeedback, setMaterialFeedback] = useState(null)
  const fileInputRef = useRef(null)

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

  // Load current discussion topic and reference material on mount
  useEffect(() => {
    async function fetchTopicAndMaterial() {
      try {
        const data = await get(`/api/sections/${SECTION_ID}/participation/topic`)
        if (data) {
          setTopic(data.topic || '')
          setExtraInfo(data.extraInfo || '')
          setMaterialName(data.materialName || null)
          setMaterialText(data.materialText || null)
        }
      } catch (err) {
        console.error('Failed to load active discussion topic & material:', err)
      }
    }
    fetchTopicAndMaterial()
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

  // Upload reference document (PDF, DOCX, TXT, MD, CSV)
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsUploadingMaterial(true)
    setMaterialFeedback(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await postFormData(`/api/sections/${SECTION_ID}/participation/material`, formData)
      setMaterialName(res.materialName)
      setMaterialText(res.materialText)
      setMaterialFeedback({ type: 'success', text: `✅ Uploaded "${res.materialName}" (${res.wordCount} words for AI evaluation)` })
      setTimeout(() => setMaterialFeedback(null), 4000)
    } catch (err) {
      console.error('Error uploading material:', err)
      setMaterialFeedback({ type: 'error', text: err.message || 'Failed to upload material' })
    } finally {
      setIsUploadingMaterial(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Save raw typed or pasted reference material text
  const handleSaveManualMaterial = async () => {
    if (!manualMaterialText.trim()) return
    setIsUploadingMaterial(true)
    setMaterialFeedback(null)
    try {
      const res = await post(`/api/sections/${SECTION_ID}/participation/material`, {
        text: manualMaterialText.trim(),
        materialName: manualMaterialName.trim() || 'Reference Notes',
      })
      setMaterialName(res.materialName)
      setMaterialText(res.materialText)
      setManualMaterialText('')
      setManualMaterialName('')
      setMaterialFeedback({ type: 'success', text: `✅ Reference material saved (${res.wordCount} words for AI evaluation)` })
      setTimeout(() => setMaterialFeedback(null), 4000)
    } catch (err) {
      console.error('Error saving reference notes:', err)
      setMaterialFeedback({ type: 'error', text: err.message || 'Failed to save reference notes' })
    } finally {
      setIsUploadingMaterial(false)
    }
  }

  // Clear active reference material
  const handleClearMaterial = async () => {
    if (!window.confirm('Clear reference material from this session? AI will evaluate based only on topic and prompt.')) return
    setIsUploadingMaterial(true)
    try {
      await del(`/api/sections/${SECTION_ID}/participation/material`)
      setMaterialName(null)
      setMaterialText(null)
      setShowMaterialPreview(false)
      setMaterialFeedback({ type: 'success', text: 'Reference material cleared' })
      setTimeout(() => setMaterialFeedback(null), 3000)
    } catch (err) {
      console.error('Error clearing reference material:', err)
      setMaterialFeedback({ type: 'error', text: err.message || 'Failed to clear reference material' })
    } finally {
      setIsUploadingMaterial(false)
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
            <p className="page-subtitle">3Q13</p>
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

            {/* Reference Material / Answer Key for AI evaluation */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              padding: '0.75rem',
              backgroundColor: 'var(--bg-secondary, #f8fafc)',
              borderRadius: '8px',
              border: '1px solid var(--border-color, #e2e8f0)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontWeight: 600, fontSize: '0.85rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span>📚</span> Reference Material / Answer Key
                </label>
                {materialText && (
                  <span style={{ fontSize: '0.72rem', color: '#15803d', fontWeight: 600, backgroundColor: '#dcfce7', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>
                    Active
                  </span>
                )}
              </div>
              <p style={{ margin: 0, fontSize: '0.76rem', color: '#64748b', lineHeight: 1.35 }}>
                AI evaluator checks student answers against this document or notes to verify factual correctness.
              </p>

              {/* Uploaded Material Card */}
              {materialText ? (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.4rem',
                  padding: '0.6rem 0.75rem',
                  backgroundColor: '#ffffff',
                  border: '1px solid #bbf7d0',
                  borderRadius: '6px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
                      <span style={{ fontSize: '1.1rem' }}>📄</span>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#15803d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '170px' }}>
                        {materialName || 'Uploaded Reference'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <button
                        type="button"
                        onClick={() => setShowMaterialPreview(!showMaterialPreview)}
                        style={{
                          fontSize: '0.72rem',
                          padding: '0.2rem 0.45rem',
                          background: '#f1f5f9',
                          border: '1px solid #cbd5e1',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontWeight: 500,
                        }}
                      >
                        {showMaterialPreview ? 'Hide' : 'Preview'}
                      </button>
                      <button
                        type="button"
                        onClick={handleClearMaterial}
                        disabled={isUploadingMaterial}
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.2rem 0.45rem',
                          background: '#fee2e2',
                          color: '#dc2626',
                          border: '1px solid #fecaca',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontWeight: 600,
                        }}
                        title="Remove reference material"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.72rem', color: '#64748b' }}>
                    <span>{materialText.split(/\s+/).filter(Boolean).length} words</span>
                    <span>•</span>
                    <span>{materialText.length} chars</span>
                  </div>

                  {showMaterialPreview && (
                    <div style={{
                      marginTop: '0.35rem',
                      maxHeight: '140px',
                      overflowY: 'auto',
                      fontSize: '0.75rem',
                      color: '#334155',
                      backgroundColor: '#f8fafc',
                      padding: '0.5rem',
                      borderRadius: '4px',
                      border: '1px solid #e2e8f0',
                      whiteSpace: 'pre-wrap',
                      lineHeight: 1.4,
                      fontFamily: 'monospace'
                    }}>
                      {materialText}
                    </div>
                  )}
                </div>
              ) : (
                /* No material uploaded yet: choose upload or paste */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button
                      type="button"
                      onClick={() => setMaterialInputMode('file')}
                      style={{
                        flex: 1,
                        padding: '0.35rem',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        borderRadius: '4px',
                        border: materialInputMode === 'file' ? '1px solid #2563eb' : '1px solid #cbd5e1',
                        background: materialInputMode === 'file' ? '#eff6ff' : '#ffffff',
                        color: materialInputMode === 'file' ? '#1d4ed8' : '#64748b',
                        cursor: 'pointer',
                      }}
                    >
                      📁 Upload File
                    </button>
                    <button
                      type="button"
                      onClick={() => setMaterialInputMode('text')}
                      style={{
                        flex: 1,
                        padding: '0.35rem',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        borderRadius: '4px',
                        border: materialInputMode === 'text' ? '1px solid #2563eb' : '1px solid #cbd5e1',
                        background: materialInputMode === 'text' ? '#eff6ff' : '#ffffff',
                        color: materialInputMode === 'text' ? '#1d4ed8' : '#64748b',
                        cursor: 'pointer',
                      }}
                    >
                      ✍️ Paste Notes
                    </button>
                  </div>

                  {materialInputMode === 'file' ? (
                    <div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.docx,.txt,.md,.csv,.json"
                        onChange={handleFileUpload}
                        disabled={isUploadingMaterial}
                        style={{ display: 'none' }}
                        id="reference-material-file-input"
                      />
                      <label
                        htmlFor="reference-material-file-input"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.4rem',
                          padding: '0.65rem',
                          backgroundColor: '#ffffff',
                          border: '1px dashed #94a3b8',
                          borderRadius: '6px',
                          cursor: isUploadingMaterial ? 'not-allowed' : 'pointer',
                          fontSize: '0.8rem',
                          fontWeight: 500,
                          color: '#475569',
                          textAlign: 'center',
                        }}
                      >
                        {isUploadingMaterial ? (
                          <span>⏳ Extracting text & indexing...</span>
                        ) : (
                          <>
                            <span>📤</span> Choose PDF, DOCX, TXT, or MD
                          </>
                        )}
                      </label>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <input
                        type="text"
                        placeholder="Material Title (e.g. Chapter 4 Key Points)"
                        value={manualMaterialName}
                        onChange={(e) => setManualMaterialName(e.target.value)}
                        style={{
                          padding: '0.35rem 0.5rem',
                          borderRadius: '4px',
                          border: '1px solid #cbd5e1',
                          fontSize: '0.78rem',
                        }}
                      />
                      <textarea
                        rows={3}
                        placeholder="Paste lecture notes, answer keys, or key terms here..."
                        value={manualMaterialText}
                        onChange={(e) => setManualMaterialText(e.target.value)}
                        style={{
                          padding: '0.35rem 0.5rem',
                          borderRadius: '4px',
                          border: '1px solid #cbd5e1',
                          fontSize: '0.78rem',
                          fontFamily: 'inherit',
                          resize: 'vertical',
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleSaveManualMaterial}
                        disabled={isUploadingMaterial || !manualMaterialText.trim()}
                        style={{
                          padding: '0.35rem 0.65rem',
                          backgroundColor: '#059669',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          alignSelf: 'flex-end',
                        }}
                      >
                        {isUploadingMaterial ? 'Saving...' : 'Save Notes'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {materialFeedback && (
                <div style={{
                  padding: '0.35rem 0.5rem',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  backgroundColor: materialFeedback.type === 'success' ? '#f0fdf4' : '#fef2f2',
                  color: materialFeedback.type === 'success' ? '#15803d' : '#dc2626',
                  border: materialFeedback.type === 'success' ? '1px solid #bbf7d0' : '1px solid #fecaca',
                }}>
                  {materialFeedback.text}
                </div>
              )}
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
