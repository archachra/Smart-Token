import { useEffect, useState } from 'react'
import { ATTENDANCE_STORAGE_KEY, createDemoRoster } from '../data/demoStudents'

const initialStudents = createDemoRoster().map((student, index) => ({
  ...student,
  tokens: [4, 7, 3, 5, 2][index] || 0,
  initials: student.name.split(' ').map((part) => part[0]).join('').slice(0, 2),
  color: ['#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777'][index % 5],
}))

const initialActivities = [
  { id: 1, type: 'token', text: 'Shaurya was awarded +1 Token for Insightful Answer', time: '2 mins ago', icon: '🪙' },
  { id: 2, type: 'queue', text: 'Piyush joined speaker queue', time: '7 mins ago', icon: '✋' },
  { id: 3, type: 'attendance', text: 'Rhythm marked Present', time: '15 mins ago', icon: '📋' },
  { id: 4, type: 'token', text: 'Arnav Chachra was awarded +1 Token for Code Walkthrough', time: '35 mins ago', icon: '🪙' },
  { id: 5, type: 'assignment', text: 'Kunal submitted Lab 3 Solution', time: '1 hr ago', icon: '📝' },
]

export default function HomePage() {
  const [students, setStudents] = useState(initialStudents)
  const [activities, setActivities] = useState(initialActivities)
  const [feedback, setFeedback] = useState(null)
  const [tokensToday, setTokensToday] = useState(18)
  const [presentCount, setPresentCount] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(ATTENDANCE_STORAGE_KEY))
      return Array.isArray(saved) ? saved.filter((student) => student.isPresent).length : initialStudents.length
    } catch {
      return initialStudents.length
    }
  })

  useEffect(() => {
    const refreshAttendance = () => {
      try {
        const saved = JSON.parse(localStorage.getItem(ATTENDANCE_STORAGE_KEY))
        setPresentCount(Array.isArray(saved) ? saved.filter((student) => student.isPresent).length : initialStudents.length)
      } catch {
        setPresentCount(initialStudents.length)
      }
    }
    window.addEventListener('storage', refreshAttendance)
    return () => window.removeEventListener('storage', refreshAttendance)
  }, [])

  const handleAddToken = (student) => {
    // Increment student token count
    setStudents((prev) =>
      prev.map((s) => (s.id === student.id ? { ...s, tokens: s.tokens + 1 } : s))
    )

    // Increment today's total tokens
    setTokensToday((prev) => prev + 1)

    // Append to activity log
    const newActivity = {
      id: Date.now(),
      type: 'token',
      text: `${student.name} was awarded +1 Token`,
      time: 'Just now',
      icon: '🪙',
    }
    setActivities((prev) => [newActivity, ...prev])

    // Set temporary feedback notification
    setFeedback({
      id: student.id,
      name: student.name,
    })

    // Auto-clear feedback after 2.5 seconds
    setTimeout(() => {
      setFeedback((current) => (current?.id === student.id ? null : current))
    }, 2500)
  }

  return (
    <div className="home-container">
      {/* Top Banner / Welcome */}
      <div className="home-header">
        <div>
          <h2>Faculty Dashboard</h2>
          <p className="page-subtitle">Computer Science 101 • Section A</p>
        </div>
      </div>

      {/* Classroom Status Metrics */}
      <div className="status-grid">
        <div className="status-card">
          <div className="status-icon-wrapper present">
            <span>📋</span>
          </div>
          <div className="status-info">
            <span className="status-value">{presentCount} / {students.length}</span>
            <span className="status-title">Present Today</span>
          </div>
        </div>

        <div className="status-card">
          <div className="status-icon-wrapper queue">
            <span>✋</span>
          </div>
          <div className="status-info">
            <span className="status-value">3</span>
            <span className="status-title">Waiting to Speak</span>
          </div>
        </div>

        <div className="status-card">
          <div className="status-icon-wrapper tokens">
            <span>🪙</span>
          </div>
          <div className="status-info">
            <span className="status-value">{tokensToday}</span>
            <span className="status-title">Tokens Today</span>
          </div>
        </div>
      </div>

      {/* Prominent Quick Token Section */}
      <section className="quick-token-section">
        <div className="section-header">
          <div>
            <h3 className="section-title">⚡ Quick Token</h3>
            <p className="section-subtitle">Award tokens instantly to recently active students</p>
          </div>
          {feedback && (
            <div className="feedback-toast">
              <span className="toast-icon">✨</span>
              <span>+1 Token awarded to <strong>{feedback.name}</strong>!</span>
            </div>
          )}
        </div>

        <div className="student-grid">
          {students.slice(0, 5).map((student) => (
            <div key={student.id} className="student-card">
              <div className="student-header">
                <div
                  className="student-avatar"
                  style={{ backgroundColor: student.color }}
                >
                  {student.initials}
                </div>
                <div className="student-details">
                  <h4 className="student-name">{student.name}</h4>
                </div>
              </div>

              <div className="student-body">
                <div className="token-counter">
                  <span className="token-icon">🪙</span>
                  <span className="token-count">{student.tokens}</span>
                  <span className="token-unit">tokens</span>
                </div>

                <button
                  className="token-action-btn"
                  onClick={() => handleAddToken(student)}
                >
                  +1 Token
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Recent Activity Feed */}
      <section className="activity-section card">
        <div className="section-header">
          <h3 className="section-title">📜 Recent Activity</h3>
          <span className="activity-count">{activities.length} Events</span>
        </div>

        <div className="activity-list">
          {activities.map((act) => (
            <div key={act.id} className="activity-item">
              <span className="activity-icon">{act.icon}</span>
              <div className="activity-content">
                <p className="activity-text">{act.text}</p>
                <span className="activity-time">{act.time}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
