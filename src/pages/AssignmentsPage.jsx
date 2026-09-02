import { useState } from 'react'

const initialSubmissions = [
  {
    id: 1,
    studentName: 'Alex Johnson',
    rollNumber: 'CS101-001',
    assignmentName: 'Lab 3: Binary Search Trees',
    status: 'Pending',
    submittedAt: 'Today, 2:15 PM',
    suggestedTokens: 3,
    reason: 'Clean BST implementation with comprehensive edge-case unit tests.',
    approvedTokens: null,
  },
  {
    id: 2,
    studentName: 'Sarah Chen',
    rollNumber: 'CS101-015',
    assignmentName: 'Lab 3: Binary Search Trees',
    status: 'Pending',
    submittedAt: 'Today, 1:40 PM',
    suggestedTokens: 4,
    reason: 'Excellent recursion analysis and clear inline code documentation.',
    approvedTokens: null,
  },
  {
    id: 3,
    studentName: 'Marcus Vance',
    rollNumber: 'CS101-014',
    assignmentName: 'Homework 2: Big-O Proofs',
    status: 'Pending',
    submittedAt: 'Yesterday, 6:10 PM',
    suggestedTokens: 2,
    reason: 'Correct mathematical proofs for complexity bounds in questions 1-4.',
    approvedTokens: null,
  },
  {
    id: 4,
    studentName: 'Emily Rodriguez',
    rollNumber: 'CS101-007',
    assignmentName: 'Lab 3: Binary Search Trees',
    status: 'Approved',
    submittedAt: 'Yesterday, 4:25 PM',
    suggestedTokens: 3,
    reason: 'All automated test cases passed cleanly.',
    approvedTokens: 3,
  },
  {
    id: 5,
    studentName: 'David Kim',
    rollNumber: 'CS101-006',
    assignmentName: 'Homework 2: Big-O Proofs',
    status: 'Pending',
    submittedAt: '2 days ago',
    suggestedTokens: 1,
    reason: 'Partial submission provided with working initial proofs.',
    approvedTokens: null,
  },
]

export default function AssignmentsPage() {
  const [submissions, setSubmissions] = useState(initialSubmissions)
  const [editingId, setEditingId] = useState(null)
  const [customTokenValue, setCustomTokenValue] = useState('')

  const handleApprove = (id, tokens) => {
    setSubmissions((prev) =>
      prev.map((sub) =>
        sub.id === id
          ? { ...sub, status: 'Approved', approvedTokens: tokens }
          : sub
      )
    )
    if (editingId === id) {
      setEditingId(null)
    }
  }

  const handleStartEdit = (sub) => {
    setEditingId(sub.id)
    setCustomTokenValue(sub.approvedTokens ?? sub.suggestedTokens)
  }

  const handleSaveEdit = (id) => {
    const finalTokens = parseInt(customTokenValue, 10) || 0
    handleApprove(id, finalTokens)
  }

  const pendingCount = submissions.filter((s) => s.status === 'Pending').length
  const approvedCount = submissions.filter((s) => s.status === 'Approved').length

  return (
    <div className="assignments-container">
      {/* Header & Metrics */}
      <div className="assignments-header">
        <div>
          <h2>Assignments</h2>
          <p className="page-subtitle">Computer Science 101 • Section A</p>
        </div>

        <div className="assignments-summary-badges">
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

      {/* Submissions Table Section */}
      <div className="submissions-card card">
        <div className="section-header">
          <h3 className="section-title">Student Submissions & AI Suggestions</h3>
          <span className="submission-total">{submissions.length} Submissions</span>
        </div>

        <div className="submissions-table">
          <div className="submissions-table-header">
            <span className="col-student">Student</span>
            <span className="col-assignment">Assignment</span>
            <span className="col-status">Status</span>
            <span className="col-ai">AI Suggestion & Rationale</span>
            <span className="col-actions">Teacher Action</span>
          </div>

          <div className="submissions-table-body">
            {submissions.map((sub) => {
              const isEditing = editingId === sub.id
              const isApproved = sub.status === 'Approved'

              return (
                <div key={sub.id} className={`submission-row ${isApproved ? 'is-approved' : ''}`}>
                  {/* Student */}
                  <div className="col-student">
                    <span className="student-name-text">{sub.studentName}</span>
                    <span className="student-roll">{sub.rollNumber}</span>
                  </div>

                  {/* Assignment */}
                  <div className="col-assignment">
                    <span className="assignment-title">{sub.assignmentName}</span>
                    <span className="submission-time">{sub.submittedAt}</span>
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
                      <div className="ai-token-tag">
                        <span className="ai-spark-icon">🤖</span>
                        <span className="ai-tokens-val">
                          +{sub.approvedTokens ?? sub.suggestedTokens} Tokens
                        </span>
                      </div>
                      <p className="ai-reason-text">"{sub.reason}"</p>
                    </div>
                  </div>

                  {/* Teacher Decision Actions */}
                  <div className="col-actions">
                    {isEditing ? (
                      <div className="inline-edit-group">
                        <input
                          type="number"
                          className="edit-token-input"
                          value={customTokenValue}
                          onChange={(e) => setCustomTokenValue(e.target.value)}
                        />
                        <button
                          className="save-action-btn"
                          onClick={() => handleSaveEdit(sub.id)}
                        >
                          Confirm
                        </button>
                        <button
                          className="cancel-action-btn"
                          onClick={() => setEditingId(null)}
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <div className="action-buttons">
                        {!isApproved && (
                          <button
                            className="approve-action-btn"
                            onClick={() => handleApprove(sub.id, sub.suggestedTokens)}
                          >
                            Approve
                          </button>
                        )}
                        <button
                          className="edit-action-btn"
                          onClick={() => handleStartEdit(sub)}
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
      </div>
    </div>
  )
}
