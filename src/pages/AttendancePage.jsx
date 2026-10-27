import { useEffect, useState, useCallback, useRef } from 'react'
import { ATTENDANCE_STORAGE_KEY, createDemoRoster } from '../data/demoStudents'
import { get } from '../utils/api.js'
import {
  queueAction,
  getCurrentUser,
  subscribeSyncState,
  PROMPT_SYNC_MS,
} from '../utils/syncManager.js'
import {
  cacheRoster,
  getCachedRoster,
  getPendingActionsForSection,
} from '../utils/offlineDb.js'

const SECTION_ID = '043f0728-c357-4e72-b6ce-62823cc064b7'
const initialRoster = createDemoRoster()

export default function AttendancePage() {
  const [students, setStudents] = useState(initialRoster)
  const [pendingAttendanceMap, setPendingAttendanceMap] = useState({})
  const [visiblePendingAttendanceMap, setVisiblePendingAttendanceMap] = useState({})
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )

  const pendingTimersRef = useRef(new Map())
  const isOnlineRef = useRef(isOnline)
  useEffect(() => {
    isOnlineRef.current = isOnline
  }, [isOnline])

  const loadPendingAttendance = useCallback(async () => {
    try {
      const actions = await getPendingActionsForSection(SECTION_ID)
      const map = {}
      const visibleMap = {}
      const now = Date.now()
      const currentIsOnline = isOnlineRef.current

      actions.forEach((act) => {
        if (act.studentId && act.actionType === 'ATTENDANCE' && !act.permanentError) {
          map[act.studentId] = act.attendanceStatus // 'PRESENT' | 'ABSENT'

          const age = now - new Date(act.createdAt).getTime()
          if (!currentIsOnline || age >= PROMPT_SYNC_MS || act.attempts > 0 || act.status === 'failed') {
            visibleMap[act.studentId] = act.attendanceStatus
          }
        }
      })
      setPendingAttendanceMap(map)
      setVisiblePendingAttendanceMap(visibleMap)
    } catch (e) {
      console.warn('Failed to load pending attendance:', e)
    }
  }, [])

  const syncBackendRoster = useCallback(async () => {
    const user = getCurrentUser()
    let rawStudents = null

    try {
      const data = await get(`/api/sections/${SECTION_ID}/students`)
      if (Array.isArray(data.students)) {
        rawStudents = data.students
        if (user?.userId) {
          await cacheRoster(user.userId, SECTION_ID, data.students)
        }
      }
    } catch (err) {
      console.warn('Network fetch failed for attendance, checking cache:', err.message)
      if (user?.userId) {
        rawStudents = await getCachedRoster(user.userId, SECTION_ID)
      }
    }

    if (Array.isArray(rawStudents)) {
      setStudents(() => {
        const claimedBackendIds = new Set()

        const updated = initialRoster.map((student) => {
          const matched = rawStudents.find(
            (bs) =>
              !claimedBackendIds.has(bs.id) &&
              bs.name.toLowerCase().trim() === student.name.toLowerCase().trim()
          )
          if (matched) {
            claimedBackendIds.add(matched.id)
            const serverPresent = matched.attendanceStatus === 'PRESENT'
            return {
              ...student,
              backendId: matched.id,
              rollNumber: matched.studentIdNumber || student.rollNumber,
              isPresent: serverPresent,
            }
          }
          return student
        })

        const seenBackendIds = new Set()
        const extraStudents = []

        for (const bs of rawStudents) {
          if (!bs.id || claimedBackendIds.has(bs.id) || seenBackendIds.has(bs.id)) {
            continue
          }
          seenBackendIds.add(bs.id)
          extraStudents.push({
            id: `backend-${bs.id}`,
            backendId: bs.id,
            rollNumber: bs.studentIdNumber || '—',
            name: bs.name,
            isPresent: bs.attendanceStatus === 'PRESENT',
          })
        }

        return [...updated, ...extraStudents]
      })
    }

    await loadPendingAttendance()
  }, [loadPendingAttendance])

  useEffect(() => {
    syncBackendRoster()

    const unsubscribe = subscribeSyncState((state) => {
      setIsOnline(state.isOnline)
      isOnlineRef.current = state.isOnline
      loadPendingAttendance()
    })

    const handleActionSynced = (e) => {
      const clientEventId = e.detail?.clientEventId
      if (clientEventId && pendingTimersRef.current.has(clientEventId)) {
        clearTimeout(pendingTimersRef.current.get(clientEventId))
        pendingTimersRef.current.delete(clientEventId)
      }
      syncBackendRoster()
    }

    window.addEventListener('smarttoken-action-synced', handleActionSynced)

    return () => {
      unsubscribe()
      window.removeEventListener('smarttoken-action-synced', handleActionSynced)
      pendingTimersRef.current.forEach((timerId) => clearTimeout(timerId))
      pendingTimersRef.current.clear()
    }
  }, [syncBackendRoster, loadPendingAttendance])

  const toggleAttendance = async (id) => {
    const target = students.find((s) => s.id === id)
    if (!target) return

    const nextState = !target.isPresent
    const nextStatus = nextState ? 'PRESENT' : 'ABSENT'
    const studentId = target.backendId
    const clientEventId = crypto.randomUUID()

    if (studentId) {
      // 1. Persist to IndexedDB BEFORE reporting success in UI
      try {
        await queueAction({
          actionType: 'ATTENDANCE',
          endpoint: `/api/sections/${SECTION_ID}/students/${studentId}/attendance`,
          method: 'PATCH',
          sectionId: SECTION_ID,
          studentId: studentId,
          studentName: target.name,
          rollNumber: target.rollNumber,
          attendanceStatus: nextStatus,
          tokenChange: nextState ? 1 : -1,
          description: `Attendance updated to ${nextStatus}`,
          payload: {
            status: nextStatus,
            clientEventId,
          },
        })

        // 2. Optimistically update UI state immediately
        setStudents((prev) =>
          prev.map((student) =>
            student.id === id
              ? { ...student, isPresent: nextState }
              : student
          )
        )
        setPendingAttendanceMap((prev) => ({
          ...prev,
          [studentId]: nextStatus,
        }))

        // 3. For pending badge: if offline, show immediately.
        // If online, only show if sync does not complete within prompt grace period.
        if (!isOnlineRef.current) {
          setVisiblePendingAttendanceMap((prev) => ({
            ...prev,
            [studentId]: nextStatus,
          }))
        } else {
          const timerId = setTimeout(() => {
            pendingTimersRef.current.delete(clientEventId)
            setVisiblePendingAttendanceMap((prev) => ({
              ...prev,
              [studentId]: nextStatus,
            }))
          }, PROMPT_SYNC_MS)
          pendingTimersRef.current.set(clientEventId, timerId)
        }
      } catch (err) {
        console.error('Failed to queue attendance update into IndexedDB:', err)
      }
    } else {
      setStudents((prev) =>
        prev.map((student) =>
          student.id === id
            ? { ...student, isPresent: nextState }
            : student
        )
      )
    }
  }

  // Calculate counts taking pending changes into account
  const presentCount = students.filter((s) => {
    const pendingStatus = s.backendId ? pendingAttendanceMap[s.backendId] : null
    if (pendingStatus) {
      return pendingStatus === 'PRESENT'
    }
    return s.isPresent
  }).length
  const totalCount = students.length

  return (
    <div className="attendance-container">
      {/* Header Area */}
      <div className="attendance-header">
        <div>
          <h2>Attendance</h2>
          <p className="page-subtitle">Computer Science 101 • 3Q13</p>
        </div>

        {/* Summary Card */}
        <div className="attendance-summary-badge">
          <span className="summary-icon">📋</span>
          <span className="summary-text">
            <strong>{presentCount} / {totalCount}</strong> Present
          </span>
        </div>
      </div>

      {/* Roster Card */}
      <div className="roster-card card">
        <div className="roster-table-header">
          <span className="col-roll">Roll Number</span>
          <span className="col-name">Student Name</span>
          <span className="col-status">Attendance Status</span>
        </div>

        <div className="roster-list">
          {students.map((student) => {
            const pendingStatus = student.backendId ? pendingAttendanceMap[student.backendId] : null
            const isPresent = pendingStatus ? pendingStatus === 'PRESENT' : student.isPresent
            const visiblePendingStatus = student.backendId ? visiblePendingAttendanceMap[student.backendId] : null
            const isPendingVisible = Boolean(visiblePendingStatus)

            return (
              <div
                key={student.id}
                className={`roster-row ${isPendingVisible ? 'pending-row-highlight' : ''}`}
              >
                <span className="col-roll roll-number">{student.rollNumber}</span>
                <span className="col-name student-name-text">
                  {student.name}
                  {isPendingVisible && (
                    <span className="pending-token-tag" title="Locally saved, awaiting ledger sync">
                      pending sync
                    </span>
                  )}
                </span>
                <div className="col-status">
                  <button
                    className={`attendance-toggle-btn ${
                      isPresent ? 'present' : 'absent'
                    }`}
                    onClick={() => toggleAttendance(student.id)}
                    aria-label={`Toggle attendance for ${student.name}`}
                  >
                    <span className="checkbox-icon">
                      {isPresent ? '☑' : '☐'}
                    </span>
                    <span className="status-text">
                      {isPresent ? 'Present' : 'Absent'}
                    </span>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
