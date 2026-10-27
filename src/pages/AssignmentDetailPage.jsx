import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { get, post } from '../utils/api.js'

const SECTION_ID = '043f0728-c357-4e72-b6ce-62823cc064b7'

export default function AssignmentDetailPage() {
  const { assignmentId } = useParams()
  const [assignment, setAssignment] = useState(null)
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [editingId, setEditingId] = useState(null)
  const [customTokenValue, setCustomTokenValue] = useState('')
  const [actionLoadingId, setActionLoadingId] = useState(null)

  const fetchAssignmentData = async () => {
    try {
      setLoading(true)
      setError(null)
      const [assignRes, subsRes] = await Promise.all([
        get(`/api/sections/${SECTION_ID}/assignments/${assignmentId}`),
        get(`/api/sections/${SECTION_ID}/assignments/${assignmentId}/submissions`),
      ])
      setAssignment(assignRes.assignment)
      setSubmissions(subsRes.submissions || [])
    } catch (err) {
      console.error('Failed to load assignment data:', err)
      setError(err.message || 'Failed to load assignment details')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (assignmentId) {
      fetchAssignmentData()
    }
  }, [assignmentId])

  const handleApprove = async (subId, tokens) => {
    try {
      setActionLoadingId(subId)
      const tokenValue = Number.isInteger(Number(tokens)) ? Number(tokens) : 0
      const res = await post(
        `/api/sections/${SECTION_ID}/assignments/${assignmentId}/submissions/${subId}/decision`,
        { finalTokens: tokenValue }
      )
      
      // Update local state
      setSubmissions((prev) =>
        prev.map((sub) =>
          sub.id === subId
            ? {
                ...sub,
                status: 'APPROVED',
                approvedTokens: res.submission?.approved_tokens ?? tokenValue,
              }
            : sub
        )
      )
      if (editingId === subId) {
        setEditingId(null)
      }
    } catch (err) {
      alert(`Approval error: ${err.message}`)
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleStartEdit = (sub) => {
    setEditingId(sub.id)
    setCustomTokenValue(sub.approvedTokens ?? sub.suggestedTokens ?? 0)
  }

  const handleSaveEdit = async (subId) => {
    const finalTokens = parseInt(customTokenValue, 10)
    if (isNaN(finalTokens) || finalTokens < 0) {
      alert('Please enter a valid non-negative integer for tokens')
      return
    }
    if (assignment && finalTokens > assignment.maxTokens) {
      alert(`Tokens cannot exceed assignment maximum (${assignment.maxTokens})`)
      return
    }
    await handleApprove(subId, finalTokens)
  }

  const handleRetryEvaluation = async (subId) => {
    try {
      setActionLoadingId(subId)
      await post(`/api/sections/${SECTION_ID}/assignments/${assignmentId}/submissions/${subId}/evaluate`, {})
      await fetchAssignmentData()
    } catch (err) {
      alert(`Evaluation error: ${err.message}`)
    } finally {
      setActionLoadingId(null)
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '—'
    const date = new Date(dateStr)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  }

  if (loading) {
    return (
      <div className="assignments-container">
        <div className="loading" style={{ padding: '3rem', textAlign: 'center' }}>
          Loading assignment and submissions…
        </div>
      </div>
    )
  }

  if (error || !assignment) {
    return (
      <div className="assignments-container">
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <h3 style={{ color: '#dc2626', marginBottom: '0.5rem' }}>Assignment Not Found</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
            {error || 'The requested assignment could not be found.'}
          </p>
          <Link to="/assignments" className="approve-action-btn" style={{ textDecoration: 'none' }}>
            ← Back to Assignments
          </Link>
        </div>
      </div>
    )
  }

  const pendingCount = submissions.filter((s) => s.status === 'PENDING').length
  const approvedCount = submissions.filter((s) => s.status === 'APPROVED').length

  return (
    <div className="assignments-container">
      {/* Navigation Breadcrumb */}
      <div>
        <Link
          to="/assignments"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            fontSize: '0.88rem',
            color: 'var(--primary-color)',
            textDecoration: 'none',
            fontWeight: 600,
            marginBottom: '0.5rem',
          }}
        >
          ← Back to All Assignments
        </Link>
      </div>

      {/* Header & Metrics */}
      <div className="assignments-header">
        <div>
          <h2>{assignment.title}</h2>
          <p className="page-subtitle">Computer Science 101 • 3Q13</p>
        </div>

        <div className="assignments-summary-badges">
          <div className="summary-badge" style={{ backgroundColor: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe' }}>
            <span className="badge-count">{assignment.maxTokens}</span>
            <span className="badge-label">Max Tokens</span>
          </div>
          <div className="summary-badge pending">
            <span className="badge-count">{pendingCount}</span>
            <span className="badge-label">Pending Review</span>
          </div>
          <div className="summary-badge approved">
            <span className="badge-count">{approvedCount}</span>
            <span className="badge-label">Approved</span>
          </div>
        </div>
      </div>

      {/* Assignment Overview & Rubric Info */}
      <div className="card" style={{ padding: '1.25rem', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h4 style={{ margin: '0 0 0.35rem 0', fontSize: '0.95rem', color: '#1e293b' }}>
              Assignment Reference & Grading Guidance
            </h4>
            {assignment.extraInfo ? (
              <p style={{ margin: 0, fontSize: '0.88rem', color: '#475569', lineHeight: 1.5 }}>
                {assignment.extraInfo}
              </p>
            ) : (
              <p style={{ margin: 0, fontSize: '0.88rem', color: '#94a3b8', fontStyle: 'italic' }}>
                No custom grading guidance specified. Standard academic evaluation applied.
              </p>
            )}
          </div>

          {assignment.fileUrl && (
            <a
              href={assignment.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 0.9rem',
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                fontSize: '0.85rem',
                fontWeight: 600,
                color: '#2563eb',
                textDecoration: 'none',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
              }}
            >
              📥 Download Assignment File ({assignment.fileName || 'Document'})
            </a>
          )}
        </div>
      </div>

      {/* Submissions Table Section */}
      <div className="submissions-card card">
        <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="section-title">Student Submissions & AI Suggestions</h3>
          <span className="submission-total">{submissions.length} Submissions</span>
        </div>

        {submissions.length === 0 ? (
          <div style={{ padding: '3rem 1rem', textAlign: 'center', color: '#64748b' }}>
            <p style={{ fontSize: '1rem', fontWeight: 500, margin: '0 0 0.5rem 0' }}>No submissions yet</p>
            <p style={{ fontSize: '0.85rem', margin: 0 }}>
              When students submit their answer files (PDF or DOCX), they will appear here with AI-suggested scores.
            </p>
          </div>
        ) : (
          <div className="submissions-table">
            <div className="submissions-table-header">
              <span className="col-student">Student</span>
              <span className="col-assignment">Submitted File</span>
              <span className="col-status">Status</span>
              <span className="col-ai">AI Suggestion & Rationale</span>
              <span className="col-actions">Teacher Action</span>
            </div>

            <div className="submissions-table-body">
              {submissions.map((sub) => {
                const isEditing = editingId === sub.id
                const isApproved = sub.status === 'APPROVED'
                const isProcessing = sub.evaluationStatus === 'PROCESSING' || sub.evaluationStatus === 'PENDING'
                const isActionLoading = actionLoadingId === sub.id

                return (
                  <div key={sub.id} className={`submission-row ${isApproved ? 'is-approved' : ''}`}>
                    {/* Student */}
                    <div className="col-student">
                      <span className="student-name-text">{sub.studentName}</span>
                      <span className="student-roll">{sub.studentIdNumber || '—'}</span>
                    </div>

                    {/* Submitted File */}
                    <div className="col-assignment">
                      {sub.fileUrl ? (
                        <a
                          href={sub.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="assignment-title"
                          style={{
                            color: '#2563eb',
                            textDecoration: 'underline',
                            wordBreak: 'break-all',
                            fontSize: '0.88rem',
                          }}
                        >
                          📄 {sub.fileName || 'Submission File'}
                        </a>
                      ) : (
                        <span className="assignment-title">No file</span>
                      )}
                      <span className="submission-time">{formatDate(sub.submittedAt || sub.createdAt)}</span>
                    </div>

                    {/* Status Badge */}
                    <div className="col-status">
                      <span className={`status-pill ${isApproved ? 'approved' : 'pending'}`}>
                        {isApproved ? '✓ Approved' : '⏳ Pending'}
                      </span>
                    </div>

                    {/* AI Suggestion & Context Rationale */}
                    <div className="col-ai">
                      <div className="ai-suggestion-box">
                        {isProcessing ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#0284c7', fontSize: '0.85rem' }}>
                            <span>🤖</span>
                            <span>AI evaluating submission against rubric…</span>
                          </div>
                        ) : sub.evaluationStatus === 'FAILED' ? (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#dc2626', fontSize: '0.82rem' }}>
                              ⚠️ Evaluation failed
                            </span>
                            <button
                              onClick={() => handleRetryEvaluation(sub.id)}
                              disabled={isActionLoading}
                              style={{
                                fontSize: '0.75rem',
                                padding: '0.2rem 0.5rem',
                                borderRadius: '4px',
                                border: '1px solid #cbd5e1',
                                cursor: 'pointer',
                                background: '#fff',
                              }}
                            >
                              Retry AI
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="ai-token-tag">
                              <span className="ai-spark-icon">🤖</span>
                              <span className="ai-tokens-val">
                                +{sub.approvedTokens ?? sub.suggestedTokens ?? 0} Tokens
                              </span>
                              {sub.suggestedTokens !== null && isApproved && sub.approvedTokens !== sub.suggestedTokens && (
                                <span style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: '0.25rem' }}>
                                  (AI suggested +{sub.suggestedTokens})
                                </span>
                              )}
                            </div>
                            <p className="ai-reason-text">
                              "{sub.reason || 'Evaluation completed.'}"
                            </p>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Teacher Decision Actions */}
                    <div className="col-actions">
                      {isEditing ? (
                        <div className="inline-edit-group">
                          <input
                            type="number"
                            min="0"
                            max={assignment.maxTokens}
                            className="edit-token-input"
                            value={customTokenValue}
                            onChange={(e) => setCustomTokenValue(e.target.value)}
                            disabled={isActionLoading}
                            style={{ width: '60px' }}
                          />
                          <button
                            className="save-action-btn"
                            onClick={() => handleSaveEdit(sub.id)}
                            disabled={isActionLoading}
                          >
                            {isActionLoading ? '…' : 'Confirm'}
                          </button>
                          <button
                            className="cancel-action-btn"
                            onClick={() => setEditingId(null)}
                            disabled={isActionLoading}
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="action-buttons">
                          {!isApproved && (
                            <button
                              className="approve-action-btn"
                              onClick={() => handleApprove(sub.id, sub.suggestedTokens ?? 0)}
                              disabled={isActionLoading}
                            >
                              {isActionLoading ? '…' : 'Approve'}
                            </button>
                          )}
                          <button
                            className="edit-action-btn"
                            onClick={() => handleStartEdit(sub)}
                            disabled={isActionLoading}
                          >
                            {isApproved ? 'Edit Tokens' : 'Edit'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
