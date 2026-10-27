import { useState, useEffect, useRef } from 'react'
import { get, post } from '../utils/api.js'
import AudioPlayer from '../components/AudioPlayer.jsx'

const SECTION_ID = '043f0728-c357-4e72-b6ce-62823cc064b7'

export default function ReviewPage() {
  const [recordings, setRecordings] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [customTokenValue, setCustomTokenValue] = useState(0)
  const [finalizeErrors, setFinalizeErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState({})
  const pollTimerRef = useRef(null)

  const fetchRecordings = async () => {
    try {
      const data = await get(`/api/sections/${SECTION_ID}/participation/recordings`)
      setRecordings(data.recordings || [])
    } catch (err) {
      console.error('Failed to load recordings:', err)
    }
  }

  useEffect(() => {
    fetchRecordings()
    pollTimerRef.current = setInterval(fetchRecordings, 2500)
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [])

  const handleFinalize = async (recording, tokenChange) => {
    setIsSubmitting((prev) => ({ ...prev, [recording.id]: true }))
    setFinalizeErrors((prev) => ({ ...prev, [recording.id]: null }))
    try {
      await post(
        `/api/sections/${SECTION_ID}/participation/recordings/${recording.id}/evaluation/decision`,
        { finalTokenChange: Number(tokenChange) }
      )
      if (editingId === recording.id) {
        setEditingId(null)
      }
      await fetchRecordings()
    } catch (err) {
      console.error('Finalize evaluation failed:', err)
      setFinalizeErrors((prev) => ({
        ...prev,
        [recording.id]: err.message || 'Finalization failed. Please try again.',
      }))
    } finally {
      setIsSubmitting((prev) => ({ ...prev, [recording.id]: false }))
    }
  }

  const handleStartEdit = (recording) => {
    setEditingId(recording.id)
    setCustomTokenValue(
      recording.finalTokenChange ?? recording.suggestedTokenChange ?? 0
    )
  }

  const handleSaveEdit = (recording) => {
    handleFinalize(recording, customTokenValue)
  }

  const pendingCount = recordings.filter(
    (r) => r.evaluationStatus === 'COMPLETED'
  ).length
  const finalizedCount = recordings.filter(
    (r) => r.evaluationStatus === 'FINALIZED'
  ).length

  return (
    <div className="assignments-container">
      {/* Header & Metrics */}
      <div className="assignments-header">
        <div>
          <h2>Participation Review</h2>
          <p className="page-subtitle">Computer Science 101 • 3Q13</p>
        </div>

        <div className="assignments-summary-badges">
          <div className="summary-badge pending">
            <span className="badge-count">{pendingCount}</span>
            <span className="badge-label">Pending Review</span>
          </div>
          <div className="summary-badge approved">
            <span className="badge-count">{finalizedCount}</span>
            <span className="badge-label">Finalized</span>
          </div>
        </div>
      </div>

      {/* Submissions Table Section */}
      <div className="submissions-card card">
        <div className="section-header">
          <h3 className="section-title">Student Responses & AI Evaluations</h3>
          <span className="submission-total">
            {recordings.length} {recordings.length === 1 ? 'Response' : 'Responses'}
          </span>
        </div>

        <div className="submissions-table">
          <div className="submissions-table-header">
            <span className="col-student">Student</span>
            <span className="col-assignment">Topic & Question</span>
            <span className="col-status">Status</span>
            <span className="col-ai">AI Suggestion & Rationale</span>
            <span className="col-actions">Teacher Action</span>
          </div>

          <div className="submissions-table-body">
            {recordings.length === 0 ? (
              <div
                style={{
                  padding: '3rem 1.5rem',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: '0.95rem',
                }}
              >
                No student participation recordings yet. When students complete responses,
                they will appear here for review.
              </div>
            ) : (
              recordings.map((recording) => {
                const isEditing = editingId === recording.id
                const isFinalized = recording.evaluationStatus === 'FINALIZED'
                const isCompleted = recording.evaluationStatus === 'COMPLETED'
                const isFailed =
                  recording.transcriptionStatus === 'FAILED' ||
                  recording.evaluationStatus === 'FAILED'
                const isProcessing =
                  !isCompleted && !isFinalized && !isFailed
                const submitting = Boolean(isSubmitting[recording.id])
                const displayTokens =
                  recording.finalTokenChange ??
                  recording.suggestedTokenChange ??
                  0

                const submittedTimeStr = recording.createdAt
                  ? new Date(recording.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : ''

                return (
                  <div
                    key={recording.id}
                    className={`submission-row ${
                      isFinalized ? 'is-approved' : ''
                    }`}
                  >
                    {/* Student Column */}
                    <div className="col-student">
                      <span className="student-name-text">
                        {recording.studentName}
                      </span>
                      <span className="student-roll">
                        {recording.studentIdNumber ||
                          recording.studentId?.slice(0, 8)}
                      </span>
                    </div>

                    {/* Topic & Audio Column */}
                    <div className="col-assignment">
                      <span className="assignment-title">
                        {recording.topic || 'Classroom Discussion'}
                      </span>
                      {recording.extraInfo && (
                        <span
                          style={{
                            fontSize: '0.8rem',
                            color: 'var(--text-secondary)',
                            marginTop: '0.15rem',
                          }}
                        >
                          {recording.extraInfo}
                        </span>
                      )}
                      {submittedTimeStr && (
                        <span className="submission-time">{submittedTimeStr}</span>
                      )}
                      {recording.audioUrl && (
                        <div style={{ marginTop: '0.45rem', maxWidth: '240px' }}>
                          <AudioPlayer src={recording.audioUrl} />
                        </div>
                      )}
                    </div>

                    {/* Status Column */}
                    <div className="col-status">
                      {isFinalized && (
                        <span className="status-pill approved">
                          ✓ Finalized ({recording.finalTokenChange > 0 ? `+${recording.finalTokenChange}` : recording.finalTokenChange})
                        </span>
                      )}
                      {isCompleted && (
                        <span className="status-pill pending">
                          ⏳ Ready for Review
                        </span>
                      )}
                      {isProcessing && (
                        <span
                          className="status-pill pending"
                          style={{ backgroundColor: '#f1f5f9', color: '#475569', borderColor: '#cbd5e1' }}
                        >
                          ⚙️ Processing…
                        </span>
                      )}
                      {isFailed && (
                        <span
                          className="status-pill"
                          style={{
                            backgroundColor: '#fee2e2',
                            color: '#b91c1c',
                            border: '1px solid #fca5a5',
                          }}
                        >
                          ⚠️ Failed
                        </span>
                      )}
                    </div>

                    {/* AI Suggestion & Transcript Column */}
                    <div className="col-ai">
                      <div className="ai-suggestion-box">
                        {(isCompleted || isFinalized) && (
                          <>
                            <div className="ai-token-tag">
                              <span className="ai-spark-icon">🤖</span>
                              <span className="ai-tokens-val">
                                Suggested: {displayTokens > 0 ? `+${displayTokens}` : displayTokens} Token{Math.abs(displayTokens) === 1 ? '' : 's'}
                              </span>
                              <span
                                style={{
                                  fontSize: '0.76rem',
                                  color: '#64748b',
                                  marginLeft: '0.35rem',
                                }}
                              >
                                ({recording.evaluationRelevant ? 'Relevant' : 'Not relevant'} •{' '}
                                {recording.evaluationCorrect ? 'Correct' : 'Needs improvement'})
                              </span>
                            </div>
                            {recording.evaluationReason && (
                              <p className="ai-reason-text">
                                "{recording.evaluationReason}"
                              </p>
                            )}
                          </>
                        )}

                        {isProcessing && (
                          <div style={{ fontSize: '0.82rem', color: '#64748b', fontStyle: 'italic' }}>
                            {recording.transcriptionStatus === 'COMPLETED'
                              ? '🤖 AI evaluation in progress…'
                              : '🎙️ Transcribing student audio…'}
                          </div>
                        )}

                        {isFailed && (
                          <div style={{ fontSize: '0.82rem', color: '#dc2626' }}>
                            {recording.evaluationError || 'AI evaluation failed. Manual token assignment available.'}
                          </div>
                        )}

                        {recording.transcript && (
                          <div
                            style={{
                              marginTop: '0.35rem',
                              paddingTop: '0.35rem',
                              borderTop: '1px dashed #bae6fd',
                              fontSize: '0.82rem',
                              color: '#1e293b',
                              lineHeight: 1.4,
                            }}
                          >
                            <strong>Transcript:</strong> "{recording.transcript}"
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Teacher Action Column */}
                    <div className="col-actions">
                      {isEditing ? (
                        <div className="inline-edit-group">
                          <select
                            className="edit-token-input"
                            style={{ width: '65px', padding: '0.25rem 0.35rem' }}
                            value={customTokenValue}
                            onChange={(e) =>
                              setCustomTokenValue(Number(e.target.value))
                            }
                            disabled={submitting}
                          >
                            <option value="-1">-1</option>
                            <option value="0">0</option>
                            <option value="1">+1</option>
                            <option value="2">+2</option>
                            <option value="3">+3</option>
                          </select>
                          <button
                            className="save-action-btn"
                            onClick={() => handleSaveEdit(recording)}
                            disabled={submitting}
                          >
                            {submitting ? '…' : 'Confirm'}
                          </button>
                          <button
                            className="cancel-action-btn"
                            onClick={() => setEditingId(null)}
                            disabled={submitting}
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="action-buttons">
                          {!isFinalized && isCompleted && (
                            <button
                              className="approve-action-btn"
                              onClick={() =>
                                handleFinalize(
                                  recording,
                                  recording.suggestedTokenChange
                                )
                              }
                              disabled={submitting}
                            >
                              {submitting ? 'Saving…' : 'Approve'}
                            </button>
                          )}
                          {(isCompleted || isFinalized || isFailed) && (
                            <button
                              className="edit-action-btn"
                              onClick={() => handleStartEdit(recording)}
                              disabled={submitting}
                            >
                              {isFinalized ? 'Edit Tokens' : isFailed ? 'Set Tokens' : 'Edit'}
                            </button>
                          )}
                        </div>
                      )}

                      {finalizeErrors[recording.id] && (
                        <span
                          style={{
                            color: '#dc2626',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            marginTop: '0.3rem',
                            display: 'block',
                          }}
                        >
                          {finalizeErrors[recording.id]}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
