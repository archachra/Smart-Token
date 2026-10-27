import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { get } from '../utils/api.js'
import { getCurrentUser, queueAction } from '../utils/syncManager.js'
import {
  cacheHistory,
  getCachedHistory,
  getPendingActionsForSection,
} from '../utils/offlineDb.js'
import { createDemoRoster } from '../data/demoStudents.js'
import { recordStudentAward, getRecentlySelectedStudents } from '../utils/recentStudents.js'

const SECTION_ID = '043f0728-c357-4e72-b6ce-62823cc064b7'

const COLOR_PALETTE = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777', '#0284c7', '#65a30d', '#0891b2', '#4f46e5']

const initialStudents = createDemoRoster().map((student, index) => ({
  ...student,
  tokens: 0,
  balance: 0,
  initials: student.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
  color: COLOR_PALETTE[index % COLOR_PALETTE.length],
}))

function getEventIcon(eventType) {
  switch (String(eventType).toUpperCase()) {
    case 'TOKEN_AWARD':
    case 'TOKEN':
      return '🪙'
    case 'ATTENDANCE':
      return '📋'
    case 'PARTICIPATION':
      return '🎙️'
    case 'CORRECTION':
      return '✏️'
    default:
      return '🪙'
  }
}

function getEventText(evt) {
  const name = evt.studentName || 'Student'
  const rawType = String(evt.eventType || evt.type || '').toUpperCase()
  const change = Number(evt.tokenChange)
  const changeStr = !isNaN(change) && change !== 0 ? (change > 0 ? `+${change}` : `${change}`) : null

  if (rawType === 'ATTENDANCE') {
    if (evt.description) return `${name} marked ${evt.description}`
    return `${name} marked ${change >= 0 ? 'Present' : 'Absent'}`
  }

  if (rawType === 'PARTICIPATION') {
    const desc = evt.description ? ` (${evt.description})` : ''
    return `${name} spoken participation evaluated: ${changeStr ? `${changeStr} Token${Math.abs(change) !== 1 ? 's' : ''}` : 'recorded'}${desc}`
  }

  if (rawType === 'CORRECTION') {
    const desc = evt.description ? ` (${evt.description})` : ''
    return `Correction: ${name} adjusted by ${changeStr ? `${changeStr} Token${Math.abs(change) !== 1 ? 's' : ''}` : 'adjustment'}${desc}`
  }

  // Default / TOKEN_AWARD
  const reason = evt.description ? ` for ${evt.description}` : ''
  if (changeStr) {
    return `${name} was awarded ${changeStr} Token${Math.abs(change) !== 1 ? 's' : ''}${reason}`
  }
  return `${name}: ${evt.description || 'Token adjustment'}`
}

function formatEventTime(dateInput) {
  if (!dateInput) return 'Just now'
  const date = new Date(dateInput)
  if (isNaN(date.getTime())) return String(dateInput)

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  if (diffMs < 0) return 'Just now'

  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return 'Just now'

  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin} min${diffMin === 1 ? '' : 's'} ago`

  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr} hr${diffHr === 1 ? '' : 's'} ago`

  const isToday = date.toDateString() === now.toDateString()
  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })

  if (isToday) return `Today, ${timeStr}`

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday, ${timeStr}`
  }

  return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${timeStr}`
}

export default function HomePage() {
  const [students, setStudents] = useState(initialStudents)
  const [activities, setActivities] = useState([])
  const [loadingActivities, setLoadingActivities] = useState(true)
  const [feedback, setFeedback] = useState(null)
  const [tokensToday, setTokensToday] = useState(0)
  const [presentCount, setPresentCount] = useState(0)
  const [recentTrigger, setRecentTrigger] = useState(0)
  const pollTimerRef = useRef(null)

  // Listen for real-time recent student award updates across pages
  useEffect(() => {
    const handleRecent = () => setRecentTrigger((c) => c + 1)
    window.addEventListener('recent-students-updated', handleRecent)
    return () => window.removeEventListener('recent-students-updated', handleRecent)
  }, [])

  // Load students & balances for section
  const loadRoster = useCallback(async () => {
    try {
      const data = await get(`/api/sections/${SECTION_ID}/students`)
      if (Array.isArray(data.students) && data.students.length > 0) {
        const mapped = data.students.map((bs, idx) => ({
          id: bs.id,
          backendId: bs.id,
          name: bs.name,
          rollNumber: bs.studentIdNumber || bs.rollNumber || `CS101-${String(idx + 1).padStart(3, '0')}`,
          tokens: bs.balance ?? 0,
          balance: bs.balance ?? 0,
          attendanceStatus: bs.attendanceStatus,
          initials: bs.name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase(),
          color: COLOR_PALETTE[idx % COLOR_PALETTE.length],
        }))
        setStudents(mapped)
        setPresentCount(mapped.filter((s) => s.attendanceStatus === 'PRESENT').length)
      }
    } catch (err) {
      console.warn('Failed to load live students on home page:', err.message)
    }
  }, [])

  // Sync recent activity from server events ledger & IndexedDB offline cache
  const fetchEvents = useCallback(async () => {
    const user = getCurrentUser()
    let serverEvents = []

    // 1. Fetch from server if online
    if (typeof navigator === 'undefined' || navigator.onLine) {
      try {
        const data = await get(`/api/sections/${SECTION_ID}/events`)
        if (Array.isArray(data.events)) {
          serverEvents = data.events
          if (user?.userId) {
            await cacheHistory(user.userId, SECTION_ID, data.events)
          }
        }
      } catch (err) {
        console.warn('[HomePage] Network error fetching events, falling back to cache:', err.message)
      }
    }

    // 2. If server events empty or offline, read cached history from IndexedDB
    if (serverEvents.length === 0 && user?.userId) {
      const cached = await getCachedHistory(user.userId, SECTION_ID)
      if (Array.isArray(cached)) {
        serverEvents = cached
      }
    }

    // Map server-confirmed events
    const mappedServerEvents = serverEvents.map((raw) => ({
      id: raw.id,
      clientEventId: raw.clientEventId,
      time: formatEventTime(raw.createdAt),
      studentName: raw.studentName || 'Unknown Student',
      rollNumber: raw.rollNumber || '—',
      eventType: raw.eventType,
      tokenChange: raw.tokenChange,
      description: raw.description,
      createdAt: raw.createdAt,
      icon: getEventIcon(raw.eventType),
      text: getEventText(raw),
      isPending: false,
    }))

    // 3. Load locally queued actions from IndexedDB
    let pendingEvents = []
    try {
      const pendingActions = await getPendingActionsForSection(SECTION_ID)
      const confirmedIds = new Set(mappedServerEvents.map((e) => e.clientEventId).filter(Boolean))

      pendingEvents = pendingActions
        .filter((act) => !confirmedIds.has(act.clientEventId))
        .map((act) => ({
          id: `pending-${act.clientEventId}`,
          clientEventId: act.clientEventId,
          time: formatEventTime(act.createdAt),
          studentName: act.studentName || 'Unknown Student',
          rollNumber: act.rollNumber || '—',
          eventType: act.actionType,
          tokenChange: act.tokenChange,
          description: act.description,
          createdAt: act.createdAt,
          icon: getEventIcon(act.actionType),
          text: getEventText({
            studentName: act.studentName,
            eventType: act.actionType,
            tokenChange: act.tokenChange,
            description: act.description,
          }),
          isPending: true,
        }))
    } catch (e) {
      console.warn('[HomePage] Error loading pending actions:', e)
    }

    // Combine pending (top) and server events
    const allActivities = [...pendingEvents, ...mappedServerEvents]
    setActivities(allActivities)
    setLoadingActivities(false)

    // Calculate tokens awarded today
    const now = new Date()
    const todayStr = now.toDateString()
    const todayTokens = allActivities
      .filter((e) => {
        if (!e.createdAt) return false
        const d = new Date(e.createdAt)
        return !isNaN(d.getTime()) && d.toDateString() === todayStr && Number(e.tokenChange) > 0
      })
      .reduce((sum, e) => sum + Number(e.tokenChange), 0)

    setTokensToday(todayTokens)
  }, [])

  useEffect(() => {
    loadRoster()
    fetchEvents()

    // Periodically refresh recent activity every 4 seconds
    pollTimerRef.current = setInterval(() => {
      fetchEvents()
    }, 4000)

    const handleActionSynced = () => {
      loadRoster()
      fetchEvents()
    }
    const handleSyncState = () => {
      fetchEvents()
    }

    window.addEventListener('smarttoken-action-synced', handleActionSynced)
    window.addEventListener('smarttoken-sync-state', handleSyncState)

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
      window.removeEventListener('smarttoken-action-synced', handleActionSynced)
      window.removeEventListener('smarttoken-sync-state', handleSyncState)
    }
  }, [loadRoster, fetchEvents])

  // Quick token award with live synchronization
  const handleAddToken = async (student) => {
    const sId = student.backendId || student.id
    const clientEventId = crypto.randomUUID()

    // Optimistic UI updates
    setStudents((prev) =>
      prev.map((s) => (s.id === student.id ? { ...s, tokens: (s.tokens || 0) + 1, balance: (s.balance || 0) + 1 } : s))
    )
    setTokensToday((prev) => prev + 1)

    // Append optimistic activity
    const optimisticActivity = {
      id: `opt-${Date.now()}`,
      clientEventId,
      icon: '🪙',
      text: `${student.name} was awarded +1 Token for Quick Award`,
      time: 'Just now',
      isPending: false,
    }
    setActivities((prev) => [optimisticActivity, ...prev])

    // Temporary feedback toast
    setFeedback({
      id: student.id,
      name: student.name,
    })
    recordStudentAward(student)
    setRecentTrigger((c) => c + 1)
    setTimeout(() => {
      setFeedback((current) => (current?.id === student.id ? null : current))
    }, 2500)

    // Optimistically record activity in state so ranking updates immediately
    const optimisticEvent = {
      id: clientEventId,
      clientEventId,
      sectionId: SECTION_ID,
      studentId: sId,
      studentName: student.name,
      rollNumber: student.rollNumber,
      eventType: 'TOKEN_AWARD',
      tokenChange: 1,
      createdAt: new Date().toISOString(),
    }
    setActivities((prev) => [optimisticEvent, ...prev])

    try {
      await queueAction({
        actionType: 'TOKEN_AWARD',
        endpoint: '/api/events',
        method: 'POST',
        sectionId: SECTION_ID,
        studentId: sId,
        studentName: student.name,
        rollNumber: student.rollNumber,
        tokenChange: 1,
        description: 'Quick Award +1',
        payload: {
          clientEventId,
          sectionId: SECTION_ID,
          studentId: sId,
          eventType: 'TOKEN_AWARD',
          tokenChange: 1,
          description: 'Quick Award +1',
        },
      })
      await fetchEvents()
    } catch (err) {
      console.error('Failed to award quick token from home:', err)
    }
  }

  // Show the top 8 most recent events
  const displayedActivities = activities.slice(0, 8)

  // Rank students so frequently & recently awarded students appear at the top
  const recentStudents = useMemo(() => {
    return getRecentlySelectedStudents(students, activities, 5)
  }, [students, activities, recentTrigger])

  return (
    <div className="home-container">
      {/* Top Banner / Welcome */}
      <div className="home-header">
        <div>
          <h2>Faculty Dashboard</h2>
          <p className="page-subtitle">3Q13</p>
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
            <span>🎙️</span>
          </div>
          <div className="status-info">
            <span className="status-value">{activities.filter((a) => a.eventType === 'PARTICIPATION').length}</span>
            <span className="status-title">Spoken Contributions</span>
          </div>
        </div>

        <div className="status-card">
          <div className="status-icon-wrapper tokens">
            <span>🪙</span>
          </div>
          <div className="status-info">
            <span className="status-value">+{tokensToday}</span>
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
          {recentStudents.map((student) => (
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
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{student.rollNumber}</span>
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

      {/* Recent Activity Feed (Synced with History Ledger) */}
      <section className="activity-section card">
        <div className="section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <h3 className="section-title">📜 Recent Activity</h3>
            <span className="activity-count">{activities.length} Events</span>
          </div>
          <Link
            to="/history"
            style={{
              fontSize: '0.85rem',
              fontWeight: 600,
              color: 'var(--primary-color, #2563eb)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
            }}
          >
            View Full History →
          </Link>
        </div>

        <div className="activity-list">
          {loadingActivities && activities.length === 0 ? (
            <div style={{ padding: '1.25rem', textAlign: 'center', color: '#64748b', fontSize: '0.9rem' }}>
              Loading recent activity...
            </div>
          ) : displayedActivities.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b', fontSize: '0.9rem' }}>
              No classroom activity recorded yet. Award tokens or mark attendance to get started!
            </div>
          ) : (
            displayedActivities.map((act) => (
              <div key={act.id} className="activity-item">
                <span className="activity-icon">{act.icon}</span>
                <div className="activity-content" style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <p className="activity-text" style={{ margin: 0 }}>{act.text}</p>
                    {act.isPending && (
                      <span
                        style={{
                          fontSize: '0.72rem',
                          backgroundColor: '#fef3c7',
                          color: '#b45309',
                          padding: '0.1rem 0.45rem',
                          borderRadius: '4px',
                          fontWeight: 600,
                          border: '1px solid #fde68a',
                        }}
                      >
                        ⏳ Queued locally
                      </span>
                    )}
                  </div>
                  <span className="activity-time">{act.time}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
