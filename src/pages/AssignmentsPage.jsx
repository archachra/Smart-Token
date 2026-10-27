import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { get, postFormData } from '../utils/api.js'

const SECTION_ID = '043f0728-c357-4e72-b6ce-62823cc064b7'

export default function AssignmentsPage() {
  const navigate = useNavigate()
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Creation form state
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [title, setTitle] = useState('')
  const [maxTokens, setMaxTokens] = useState('5')
  const [extraInfo, setExtraInfo] = useState('')
  const [file, setFile] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)
  const [formSuccess, setFormSuccess] = useState(null)

  const fetchAssignments = async () => {
    try {
      setLoading(true)
      const data = await get(`/api/sections/${SECTION_ID}/assignments`)
      setAssignments(data.assignments || [])
    } catch (err) {
      console.error('Failed to load assignments:', err)
      setError(err.message || 'Failed to load assignments')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAssignments()
  }, [])

  const handleCreateAssignment = async (e) => {
    e.preventDefault()
    if (!title.trim()) {
      setFormError('Please enter an assignment name')
      return
    }

    const tokensNum = parseInt(maxTokens, 10)
    if (isNaN(tokensNum) || tokensNum <= 0) {
      setFormError('Maximum tokens must be a positive number')
      return
    }

    setSubmitting(true)
    setFormError(null)
    setFormSuccess(null)

    try {
      const formData = new FormData()
      formData.append('title', title.trim())
      formData.append('maxTokens', tokensNum.toString())
      if (extraInfo.trim()) {
        formData.append('extraInfo', extraInfo.trim())
      }
      if (file) {
        formData.append('file', file)
      }

      const res = await postFormData(`/api/sections/${SECTION_ID}/assignments`, formData)
      
      // Notify sidebar to refresh nested items
      window.dispatchEvent(new Event('assignment-created'))

      setFormSuccess('Assignment created successfully!')
      setTitle('')
      setMaxTokens('5')
      setExtraInfo('')
      setFile(null)
      setShowCreateForm(false)

      // Refresh list and optionally navigate to the detail page
      await fetchAssignments()
      if (res.assignment?.id) {
        navigate(`/assignments/${res.assignment.id}`)
      }
    } catch (err) {
      console.error('Failed to create assignment:', err)
      setFormError(err.message || 'Failed to create assignment')
    } finally {
      setSubmitting(false)
    }
  }

  const totalSubmissions = assignments.reduce((acc, a) => acc + (a.totalSubmissions || 0), 0)
  const totalPending = assignments.reduce((acc, a) => acc + (a.pendingSubmissions || 0), 0)
  const totalApproved = assignments.reduce((acc, a) => acc + (a.approvedSubmissions || 0), 0)

  return (
    <div className="assignments-container">
      {/* Header & Metrics */}
      <div className="assignments-header">
        <div>
          <h2>Assignments Management</h2>
          <p className="page-subtitle">Computer Science 101 • 3Q13</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="assignments-summary-badges">
            <div className="summary-badge pending">
              <span className="badge-count">{totalPending}</span>
              <span className="badge-label">Pending Reviews</span>
            </div>
            <div className="summary-badge approved">
              <span className="badge-count">{totalApproved}</span>
              <span className="badge-label">Approved</span>
            </div>
          </div>

          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            style={{
              padding: '0.55rem 1.1rem',
              backgroundColor: 'var(--primary-color, #2563eb)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)',
            }}
          >
            {showCreateForm ? '✕ Cancel' : '+ Create Assignment'}
          </button>
        </div>
      </div>

      {/* Assignment Creation Form Modal / Card */}
      {showCreateForm && (
        <div className="card" style={{ padding: '1.5rem', backgroundColor: '#f8fafc', border: '1.5px solid #cbd5e1' }}>
          <h3 style={{ margin: '0 0 1rem 0', color: '#1e293b', fontSize: '1.2rem' }}>
            Create New Assignment
          </h3>

          {formError && (
            <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#fef2f2', color: '#dc2626', borderRadius: '6px', fontSize: '0.88rem' }}>
              ⚠️ {formError}
            </div>
          )}

          {formSuccess && (
            <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#ecfdf5', color: '#047857', borderRadius: '6px', fontSize: '0.88rem' }}>
              ✓ {formSuccess}
            </div>
          )}

          <form onSubmit={handleCreateAssignment} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                  Assignment Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Lab 4: Binary Trees & Heaps"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box',
                  }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                  Maximum Tokens *
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box',
                  }}
                  required
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                Assignment File / Questions Upload (Optional)
              </label>
              <input
                type="file"
                accept=".pdf,.docx,.doc,.txt"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: '6px',
                  border: '1px dashed #94a3b8',
                  backgroundColor: '#ffffff',
                  fontSize: '0.85rem',
                  boxSizing: 'border-box',
                }}
              />
              <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                Supported formats: PDF, DOCX, TXT. The AI evaluator will compare student answers against this document.
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                Extra Info / Grading Guidance
              </label>
              <textarea
                rows="3"
                placeholder="e.g. Question 1 = 3 tokens, Question 2 = 2 tokens. Check time complexity proof and edge-case unit tests."
                value={extraInfo}
                onChange={(e) => setExtraInfo(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                  resize: 'vertical',
                }}
              />
              <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                Provided guidance is fed directly to the AI evaluator to calibrate suggested token awards.
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                style={{
                  padding: '0.55rem 1rem',
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  color: '#475569',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  padding: '0.55rem 1.25rem',
                  backgroundColor: 'var(--primary-color, #2563eb)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? 'Creating Assignment…' : 'Publish Assignment'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Assignments List Card */}
      <div className="submissions-card card">
        <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="section-title">Created Assignments ({assignments.length})</h3>
          <span className="submission-total">{totalSubmissions} Total Submissions</span>
        </div>

        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
            Loading assignments…
          </div>
        ) : error ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#dc2626' }}>
            ⚠️ {error}
          </div>
        ) : assignments.length === 0 ? (
          <div style={{ padding: '3.5rem 1rem', textAlign: 'center', color: '#64748b' }}>
            <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.75rem' }}>📝</span>
            <p style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e293b', margin: '0 0 0.5rem 0' }}>
              No assignments created yet
            </p>
            <p style={{ fontSize: '0.9rem', color: '#64748b', margin: '0 0 1.25rem 0' }}>
              Create your first assignment with grading guidance and question attachments.
            </p>
            <button
              onClick={() => setShowCreateForm(true)}
              style={{
                padding: '0.55rem 1.1rem',
                backgroundColor: 'var(--primary-color, #2563eb)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: 'pointer',
              }}
            >
              + Create Assignment
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {assignments.map((assign) => (
              <div
                key={assign.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '1.25rem 1.5rem',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  backgroundColor: '#ffffff',
                  transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: 1, paddingRight: '1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <Link
                      to={`/assignments/${assign.id}`}
                      style={{
                        fontSize: '1.05rem',
                        fontWeight: 700,
                        color: '#1e293b',
                        textDecoration: 'none',
                      }}
                    >
                      {assign.title}
                    </Link>
                    <span
                      style={{
                        padding: '0.2rem 0.6rem',
                        borderRadius: '9999px',
                        backgroundColor: '#eff6ff',
                        color: '#1d4ed8',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                      }}
                    >
                      Max {assign.maxTokens} Tokens
                    </span>
                  </div>

                  {assign.extraInfo && (
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569', lineHeight: 1.4 }}>
                      {assign.extraInfo}
                    </p>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.25rem' }}>
                    {assign.fileUrl ? (
                      <a
                        href={assign.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: '0.8rem',
                          color: '#2563eb',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          fontWeight: 500,
                        }}
                      >
                        📄 {assign.fileName || 'Attached Problem File'}
                      </a>
                    ) : (
                      <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>No attached file</span>
                    )}

                    <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                      Created {new Date(assign.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.35rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <span
                        className="status-pill pending"
                        style={{ fontSize: '0.75rem', padding: '0.2rem 0.55rem' }}
                      >
                        {assign.pendingSubmissions || 0} Pending
                      </span>
                      <span
                        className="status-pill approved"
                        style={{ fontSize: '0.75rem', padding: '0.2rem 0.55rem' }}
                      >
                        {assign.approvedSubmissions || 0} Approved
                      </span>
                    </div>
                    <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                      {assign.totalSubmissions || 0} total submissions
                    </span>
                  </div>

                  <Link
                    to={`/assignments/${assign.id}`}
                    style={{
                      padding: '0.55rem 1rem',
                      backgroundColor: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      color: '#0f172a',
                      textDecoration: 'none',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    View Submissions →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
