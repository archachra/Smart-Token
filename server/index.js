import express from 'express'
import pool from './db.js'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { authenticate, requireRole } from './middleware/auth.js'
import { processRecordingTranscription } from './services/transcription.js'
import { processRecordingEvaluation, finalizeRecordingEvaluation } from './services/evaluation.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const uploadsDir = path.join(__dirname, 'uploads', 'recordings')
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Missing email or password' });
  }

  try {
    const userRes = await pool.query(
      `SELECT id, email, password_hash, role FROM users WHERE email = $1`,
      [email]
    );
    if (userRes.rowCount === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const user = userRes.rows[0];
    if (!user.password_hash) {
      // No password hash stored, treat as invalid credentials
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign(
      { userId: user.id, role: user.role, email: user.email },
      process.env.JWT_SECRET || 'dev-secret',
      { expiresIn: '8h' }
    );
    return res.status(200).json({ token });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
app.use('/api', authenticate);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ALLOWED_EVENT_TYPES = ['ATTENDANCE', 'PARTICIPATION', 'TOKEN_AWARD', 'CORRECTION']

// GET /api/sections/:sectionId/students
app.get('/api/sections/:sectionId/students', async (req, res) => {
  const { sectionId } = req.params

  // Validate UUID format
  if (!UUID_REGEX.test(sectionId)) {
    return res.status(400).json({ error: 'Invalid section ID format. Expected valid UUID.' })
  }

  try {
    // 1. Check if section exists
    const sectionResult = await pool.query(
      `SELECT id, section_name, term FROM sections WHERE id = $1`,
      [sectionId]
    )

    if (sectionResult.rowCount === 0) {
      return res.status(404).json({ error: 'Section not found' })
    }

    // 2. Query enrolled students and their token balances
    const studentsResult = await pool.query(
      `SELECT 
        s.id,
        s.name,
        s.student_id_number AS "studentIdNumber",
        COALESCE(sb.balance, 0) AS balance
       FROM enrollments e
       JOIN students s ON e.student_id = s.id
       LEFT JOIN student_balances sb ON (sb.student_id = s.id AND sb.section_id = e.section_id)
       WHERE e.section_id = $1
       ORDER BY s.name ASC`,
      [sectionId]
    )

    return res.status(200).json({
      sectionId,
      students: studentsResult.rows,
    })
  } catch (err) {
    console.error('Error fetching section roster:', err)
    return res.status(500).json({ error: 'Internal server error while fetching roster' })
  }
})

// POST /api/events
app.get('/api/events', (req, res) => res.status(451).json({ error: 'Use POST /api/events' }))
app.post('/api/events', async (req, res) => {
  const {
    sectionId,
    studentId,
    tokenChange,
    eventType,
    description,
    clientEventId,
  } = req.body
  // creator derived from authenticated JWT
  const createdBy = req.user.userId

  // 1. Validate IDs and required fields
  if (!sectionId || !UUID_REGEX.test(sectionId)) {
    return res.status(400).json({ error: 'Invalid or missing sectionId UUID' })
  }
  if (!studentId || !UUID_REGEX.test(studentId)) {
    return res.status(400).json({ error: 'Invalid or missing studentId UUID' })
  }
  if (!clientEventId || !UUID_REGEX.test(clientEventId)) {
    return res.status(400).json({ error: 'Invalid or missing clientEventId UUID' })
  }
  if (!createdBy || !UUID_REGEX.test(createdBy)) {
    return res.status(400).json({ error: 'Invalid or missing createdBy UUID' })
  }
  if (!Number.isInteger(tokenChange)) {
    return res.status(400).json({ error: 'tokenChange must be an integer' })
  }
  if (!eventType || !ALLOWED_EVENT_TYPES.includes(eventType)) {
    return res.status(400).json({ error: `eventType must be one of: ${ALLOWED_EVENT_TYPES.join(', ')}` })
  }

  // 2. Verify student is enrolled in the section
  try {
    const enrollmentCheck = await pool.query(
      `SELECT 1 FROM enrollments WHERE student_id = $1 AND section_id = $2`,
      [studentId, sectionId]
    )

    if (enrollmentCheck.rowCount === 0) {
      return res.status(400).json({ error: 'Student is not enrolled in this section' })
    }
  } catch (err) {
    console.error('Error checking enrollment:', err)
    return res.status(500).json({ error: 'Internal server error during enrollment verification' })
  }

  // 3. Start PostgreSQL transaction
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    // 4. Check whether clientEventId already exists (idempotency check)
    const existingEvent = await client.query(
      `SELECT 
        e.id,
        e.client_event_id AS "clientEventId",
        e.section_id AS "sectionId",
        e.student_id AS "studentId",
        e.created_by AS "createdBy",
        e.event_type AS "eventType",
        e.token_change AS "tokenChange",
        e.description,
        e.created_at AS "createdAt",
        COALESCE(sb.balance, 0) AS balance
       FROM events e
       LEFT JOIN student_balances sb ON (sb.student_id = e.student_id AND sb.section_id = e.section_id)
       WHERE e.client_event_id = $1`,
      [clientEventId]
    )

    if (existingEvent.rowCount > 0) {
      await client.query('ROLLBACK')
      client.release()

      const row = existingEvent.rows[0]
      const { balance, ...eventData } = row

      return res.status(200).json({
        event: eventData,
        balance,
        idempotent: true,
      })
    }

    // 5. Create event in events table
    const eventInsertResult = await client.query(
      `INSERT INTO events (client_event_id, section_id, student_id, created_by, event_type, token_change, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING 
        id, 
        client_event_id AS "clientEventId", 
        section_id AS "sectionId", 
        student_id AS "studentId", 
        created_by AS "createdBy", 
        event_type AS "eventType", 
        token_change AS "tokenChange", 
        description, 
        created_at AS "createdAt"`,
      [clientEventId, sectionId, studentId, createdBy, eventType, tokenChange, description || null]
    )

    const createdEvent = eventInsertResult.rows[0]

    // 6. Update student's student_balances row by tokenChange
    const balanceResult = await client.query(
      `INSERT INTO student_balances (student_id, section_id, balance)
       VALUES ($1, $2, $3)
       ON CONFLICT (student_id, section_id)
       DO UPDATE SET balance = student_balances.balance + EXCLUDED.balance, updated_at = NOW()
       RETURNING balance`,
      [studentId, sectionId, tokenChange]
    )

    const updatedBalance = balanceResult.rows[0].balance

    // 7. Commit transaction
    await client.query('COMMIT')
    client.release()

    // 8. Return created event and updated balance
    return res.status(201).json({
      event: createdEvent,
      balance: updatedBalance,
    })
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch (rollbackErr) {
      console.error('Error during transaction rollback:', rollbackErr)
    }
    client.release()

    console.error('Transaction error processing token event:', err)
    return res.status(500).json({ error: 'Transaction failed while recording token event' })
  }
})

// PATCH /api/sections/:sectionId/students/:studentId/attendance
app.patch('/api/sections/:sectionId/students/:studentId/attendance', async (req, res) => {
  const { sectionId, studentId } = req.params
  const { status, clientEventId } = req.body;
  // creator derived from authenticated JWT
  const createdBy = req.user.userId;
  if (!status || (status !== 'PRESENT' && status !== 'ABSENT')) {
    return res.status(400).json({ error: 'Attendance status must be "PRESENT" or "ABSENT"' })
  }

  // 2. Verify student is enrolled in the section and get current attendance status
  try {
    const enrollmentCheck = await pool.query(
      `SELECT attendance_status FROM enrollments WHERE student_id = $1 AND section_id = $2`,
      [studentId, sectionId]
    )

    if (enrollmentCheck.rowCount === 0) {
      return res.status(400).json({ error: 'Student is not enrolled in this section' })
    }
  } catch (err) {
    console.error('Error checking enrollment for attendance:', err)
    return res.status(500).json({ error: 'Internal server error during enrollment verification' })
  }

  // 3. Start PostgreSQL transaction
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    // 4. Check whether clientEventId already exists (idempotent check)
    const existingEvent = await client.query(
      `SELECT 
        e.id,
        e.client_event_id AS "clientEventId",
        en.attendance_status AS "attendanceStatus",
        COALESCE(sb.balance, 0) AS balance
       FROM events e
       JOIN enrollments en ON (en.student_id = e.student_id AND en.section_id = e.section_id)
       LEFT JOIN student_balances sb ON (sb.student_id = e.student_id AND sb.section_id = e.section_id)
       WHERE e.client_event_id = $1`,
      [clientEventId]
    )

    if (existingEvent.rowCount > 0) {
      await client.query('ROLLBACK')
      client.release()

      return res.status(200).json({
        status: existingEvent.rows[0].attendanceStatus,
        balance: existingEvent.rows[0].balance,
        idempotent: true,
      })
    }

    // Lock enrollment row and fetch current status
    const currentEnrollment = await client.query(
      `SELECT attendance_status FROM enrollments WHERE student_id = $1 AND section_id = $2 FOR UPDATE`,
      [studentId, sectionId]
    )

    const currentStatus = currentEnrollment.rows[0].attendance_status

    // 5. Calculate token change
    let tokenChange = 0
    if (currentStatus !== status) {
      if (currentStatus === 'ABSENT' && status === 'PRESENT') {
        tokenChange = 1
      } else if (currentStatus === 'PRESENT' && status === 'ABSENT') {
        tokenChange = -1
      }
    }

    // 6. Update attendance state in enrollments
    await client.query(
      `UPDATE enrollments SET attendance_status = $1 WHERE student_id = $2 AND section_id = $3`,
      [status, studentId, sectionId]
    )

    // 7. Create immutable ATTENDANCE event if status changed
    if (tokenChange !== 0 || currentStatus !== status) {
      await client.query(
        `INSERT INTO events (client_event_id, section_id, student_id, created_by, event_type, token_change, description)
         VALUES ($1, $2, $3, $4, 'ATTENDANCE', $5, $6)`,
        [clientEventId, sectionId, studentId, createdBy, tokenChange, `Attendance status updated from ${currentStatus} to ${status}`]
      )
    }

    // 8. Update student_balances by tokenChange if tokenChange !== 0
    let finalBalance = 0
    if (tokenChange !== 0) {
      const balanceResult = await client.query(
        `INSERT INTO student_balances (student_id, section_id, balance)
         VALUES ($1, $2, $3)
         ON CONFLICT (student_id, section_id)
         DO UPDATE SET balance = student_balances.balance + EXCLUDED.balance, updated_at = NOW()
         RETURNING balance`,
        [studentId, sectionId, tokenChange]
      )
      finalBalance = balanceResult.rows[0].balance
    } else {
      const balanceResult = await client.query(
        `SELECT COALESCE(balance, 0) AS balance FROM student_balances WHERE student_id = $1 AND section_id = $2`,
        [studentId, sectionId]
      )
      finalBalance = balanceResult.rowCount > 0 ? balanceResult.rows[0].balance : 0
    }

    // 9. Commit transaction
    await client.query('COMMIT')
    client.release()

    // 10. Return updated status and balance
    return res.status(200).json({
      status,
      balance: finalBalance,
      tokenChange,
    })
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch (rollbackErr) {
      console.error('Error rolling back attendance transaction:', rollbackErr)
    }
    client.release()

    console.error('Transaction error updating attendance:', err)
    return res.status(500).json({ error: 'Transaction failed while updating attendance' })
  }
})

// POST /api/sections/:sectionId/participation/raise
app.post('/api/sections/:sectionId/participation/raise', async (req, res) => {
  const { sectionId } = req.params
  let studentId

  // 1. Validate sectionId and studentId as UUIDs
  if (!sectionId || !UUID_REGEX.test(sectionId)) {
    return res.status(400).json({ error: 'Invalid or missing sectionId UUID' })
  }
  try {
    const identityResult = await pool.query(
      `SELECT id FROM students WHERE user_id = $1`,
      [req.user.userId]
    )
    studentId = identityResult.rows[0]?.id
    if (!studentId) {
      return res.status(403).json({ error: 'Authenticated user is not a student' })
    }

    // 2. Verify student is enrolled in the section
    const enrollmentCheck = await pool.query(
      `SELECT 1 FROM enrollments WHERE student_id = $1 AND section_id = $2`,
      [studentId, sectionId]
    )

    if (enrollmentCheck.rowCount === 0) {
      return res.status(400).json({ error: 'Student is not enrolled in this section' })
    }

    // 3. Check for existing active raised-hand request to prevent duplicates
    const existingCheck = await pool.query(
      `SELECT id FROM raised_hands WHERE section_id = $1 AND student_id = $2`,
      [sectionId, studentId]
    )

    if (existingCheck.rowCount > 0) {
      return res.status(400).json({ error: 'Student already has an active raised hand in this section' })
    }

    // 4. Create raised-hand request storing request timestamp
    const insertResult = await pool.query(
      `INSERT INTO raised_hands (section_id, student_id)
       VALUES ($1, $2)
       RETURNING id, section_id AS "sectionId", student_id AS "studentId", raised_at AS "raisedAt"`,
      [sectionId, studentId]
    )

    const createdRequest = insertResult.rows[0]

    // 5. Return created request
    return res.status(201).json({
      request: createdRequest,
    })
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Student already has an active raised hand in this section' })
    }
    console.error('Error creating raised-hand request:', err)
    return res.status(500).json({ error: 'Internal server error while raising hand' })
  }
})

// GET /api/sections/:sectionId/participation/raised
app.get('/api/sections/:sectionId/participation/raised', async (req, res) => {
  const { sectionId } = req.params

  // 1. Validate sectionId as UUID
  if (!sectionId || !UUID_REGEX.test(sectionId)) {
    return res.status(400).json({ error: 'Invalid section ID format. Expected valid UUID.' })
  }

  try {
    // 2. Verify section exists
    const sectionCheck = await pool.query(
      `SELECT id FROM sections WHERE id = $1`,
      [sectionId]
    )

    if (sectionCheck.rowCount === 0) {
      return res.status(404).json({ error: 'Section not found' })
    }

    // 3. Query active raised hands ordered by raised_at ASC
    const result = await pool.query(
      `SELECT 
        rh.id,
        rh.student_id AS "studentId",
        s.name AS "studentName",
        s.student_id_number AS "studentIdNumber",
        rh.raised_at AS "raisedAt"
       FROM raised_hands rh
       JOIN students s ON rh.student_id = s.id
       WHERE rh.section_id = $1 AND rh.resolved_at IS NULL
       ORDER BY rh.raised_at ASC`,
      [sectionId]
    )

    return res.status(200).json({
      sectionId,
      requests: result.rows,
    })
  } catch (err) {
    console.error('Error fetching active raised hands:', err)
    return res.status(500).json({ error: 'Internal server error while fetching raised hands' })
  }
})

// DELETE /api/sections/:sectionId/participation/raised/:requestId
app.delete('/api/sections/:sectionId/participation/raised/:requestId', async (req, res) => {
  const { sectionId, requestId } = req.params

  // 1. Validate sectionId and requestId as UUIDs
  if (!sectionId || !UUID_REGEX.test(sectionId)) {
    return res.status(400).json({ error: 'Invalid or missing sectionId UUID' })
  }
  if (!requestId || !UUID_REGEX.test(requestId)) {
    return res.status(400).json({ error: 'Invalid or missing requestId UUID' })
  }

  try {
    // 2. Delete active raised-hand request for specified section
      const deleteResult = await pool.query(
        `UPDATE raised_hands 
         SET resolved_at = NOW()
         WHERE id = $1 AND section_id = $2
         RETURNING id, section_id AS "sectionId", student_id AS "studentId", raised_at AS "raisedAt", resolved_at AS "resolvedAt"`,
        [requestId, sectionId]
      )

    // 3. Return 404 if request does not exist in that section
    if (deleteResult.rowCount === 0) {
      return res.status(404).json({ error: 'Raised-hand request not found in this section' })
    }

    // 4. Return successful response confirming removal
    return res.status(200).json({
      message: 'Raised-hand request removed successfully',
      removedRequest: deleteResult.rows[0],
    })
  } catch (err) {
    console.error('Error removing raised-hand request:', err)
    return res.status(500).json({ error: 'Internal server error while removing raised hand' })
  }
})

// API 1: POST /api/sections/:sectionId/participation/raised/:requestId/approve
app.post('/api/sections/:sectionId/participation/raised/:requestId/approve', async (req, res) => {
  const { sectionId, requestId } = req.params
  const { topic, extraInfo } = req.body || {}

  if (req.user.role !== 'FACULTY') {
    return res.status(403).json({ error: 'Forbidden: faculty role required' })
  }

  // 1. Validate UUIDs and required topic
  if (!sectionId || !UUID_REGEX.test(sectionId)) {
    return res.status(400).json({ error: 'Invalid or missing sectionId UUID' })
  }
  if (!requestId || !UUID_REGEX.test(requestId)) {
    return res.status(400).json({ error: 'Invalid or missing requestId UUID' })
  }
  if (!topic || typeof topic !== 'string' || !topic.trim()) {
    return res.status(400).json({ error: 'Topic is required when approving participation' })
  }

  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    // 2. Verify raised-hand request exists in specified section
    const raisedCheck = await client.query(
      `SELECT id, section_id AS "sectionId", student_id AS "studentId"
       FROM raised_hands
       WHERE id = $1 AND section_id = $2
       FOR UPDATE`,
      [requestId, sectionId]
    )

    if (raisedCheck.rowCount === 0) {
      await client.query('ROLLBACK')
      client.release()
      return res.status(404).json({ error: 'Raised-hand request not found in this section' })
    }

    const { studentId } = raisedCheck.rows[0]

    // 3. Reject approval if that raised-hand request already has a recording session
    const sessionCheck = await client.query(
      `SELECT id FROM recording_sessions WHERE raised_hand_id = $1`,
      [requestId]
    )

    if (sessionCheck.rowCount === 0) {
      // Create APPROVED recording session with topic and extra_info
      const insertResult = await client.query(
        `INSERT INTO recording_sessions (section_id, student_id, raised_hand_id, status, recording_source, topic, extra_info)
         VALUES ($1, $2, $3, 'APPROVED', 'STUDENT_DEVICE', $4, $5)
         RETURNING 
          id, 
          section_id AS "sectionId", 
          student_id AS "studentId", 
          raised_hand_id AS "raisedHandId", 
          status, 
          recording_source AS "recordingSource", 
          topic,
          extra_info AS "extraInfo",
          audio_url AS "audioUrl",
          transcript,
          transcription_status AS "transcriptionStatus",
          transcription_error AS "transcriptionError",
          transcribed_at AS "transcribedAt",
          created_at AS "createdAt", 
          started_at AS "startedAt", 
          ended_at AS "endedAt"`,
        [sectionId, studentId, requestId, topic.trim(), extraInfo ? extraInfo.trim() : null]
      )

      // Resolve the raised hand so it no longer appears in active queue
      await client.query(
        `UPDATE raised_hands SET resolved_at = NOW() WHERE id = $1`,
        [requestId]
      )

      await client.query('COMMIT')
      client.release()

      return res.status(201).json({
        session: insertResult.rows[0],
      })
    } else {
      await client.query('ROLLBACK')
      client.release()
      return res.status(400).json({ error: 'A recording session has already been created for this raised-hand request' })
    }
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch (rbErr) {}
    client.release()

    if (err.code === '23505') {
      return res.status(400).json({ error: 'A recording session has already been created for this raised-hand request' })
    }

    console.error('Error approving recording session:', err)
    return res.status(500).json({ error: 'Internal server error while approving recording session' })
  }
})

// API 2: PATCH /api/sections/:sectionId/participation/recordings/:recordingId/start
app.patch('/api/sections/:sectionId/participation/recordings/:recordingId/start', async (req, res) => {
  const { sectionId, recordingId } = req.params

  // 1. Validate UUIDs
  if (!sectionId || !UUID_REGEX.test(sectionId)) {
    return res.status(400).json({ error: 'Invalid or missing sectionId UUID' })
  }
  if (!recordingId || !UUID_REGEX.test(recordingId)) {
    return res.status(400).json({ error: 'Invalid or missing recordingId UUID' })
  }

  try {
    // 2. Verify recording session belongs to section and fetch student user ID
    const sessionCheck = await pool.query(
      `SELECT rs.id, rs.status, rs.student_id, s.user_id 
       FROM recording_sessions rs
       JOIN students s ON rs.student_id = s.id
       WHERE rs.id = $1 AND rs.section_id = $2`,
      [recordingId, sectionId]
    )

    if (sessionCheck.rowCount === 0) {
      return res.status(404).json({ error: 'Recording session not found in this section' })
    }

    const { status, user_id: studentUserId } = sessionCheck.rows[0]

    // Security check: Authenticated student can only modify their own recording session
    if (req.user && req.user.role === 'STUDENT' && req.user.userId !== studentUserId) {
      return res.status(403).json({ error: 'Forbidden: Cannot access another student\'s recording session' })
    }

    // 3. Verify current status is APPROVED
    if (status !== 'APPROVED') {
      return res.status(400).json({ error: `Cannot start recording. Current status is ${status}, expected APPROVED.` })
    }

    // 4. Update status to RECORDING and set started_at
    const updateResult = await pool.query(
      `UPDATE recording_sessions
       SET status = 'RECORDING', started_at = NOW()
       WHERE id = $1 AND section_id = $2
       RETURNING 
        id, 
        section_id AS "sectionId", 
        student_id AS "studentId", 
        raised_hand_id AS "raisedHandId", 
        status, 
        topic,
        extra_info AS "extraInfo",
        audio_url AS "audioUrl",
        transcript,
        transcription_status AS "transcriptionStatus",
        transcription_error AS "transcriptionError",
        transcribed_at AS "transcribedAt",
        created_at AS "createdAt", 
        started_at AS "startedAt", 
        ended_at AS "endedAt"`,
      [recordingId, sectionId]
    )

    return res.status(200).json({
      session: updateResult.rows[0],
    })
  } catch (err) {
    console.error('Error starting recording session:', err)
    return res.status(500).json({ error: 'Internal server error while starting recording session' })
  }
})

// API 3: PATCH /api/sections/:sectionId/participation/recordings/:recordingId/complete
app.patch('/api/sections/:sectionId/participation/recordings/:recordingId/complete', async (req, res) => {
  const { sectionId, recordingId } = req.params
  const { audioData, audioBase64 } = req.body || {}

  // 1. Validate UUIDs
  if (!sectionId || !UUID_REGEX.test(sectionId)) {
    return res.status(400).json({ error: 'Invalid or missing sectionId UUID' })
  }
  if (!recordingId || !UUID_REGEX.test(recordingId)) {
    return res.status(400).json({ error: 'Invalid or missing recordingId UUID' })
  }

  try {
    // 2. Verify recording session belongs to section and fetch student user ID
    const sessionCheck = await pool.query(
      `SELECT rs.id, rs.status, rs.student_id, s.user_id 
       FROM recording_sessions rs
       JOIN students s ON rs.student_id = s.id
       WHERE rs.id = $1 AND rs.section_id = $2`,
      [recordingId, sectionId]
    )

    if (sessionCheck.rowCount === 0) {
      return res.status(404).json({ error: 'Recording session not found in this section' })
    }

    const { status, user_id: studentUserId } = sessionCheck.rows[0]

    // Security check: Authenticated student can only complete their own recording session
    if (req.user && req.user.role === 'STUDENT' && req.user.userId !== studentUserId) {
      return res.status(403).json({ error: 'Forbidden: Cannot access another student\'s recording session' })
    }

    // 3. Verify current status is RECORDING
    if (status !== 'RECORDING') {
      return res.status(400).json({ error: `Cannot complete recording. Current status is ${status}, expected RECORDING.` })
    }

    // Process audio payload if present
    let savedAudioUrl = null
    let savedAudioPath = null
    const rawAudio = audioBase64 || audioData
    if (rawAudio) {
      const cleanBase64 = rawAudio.replace(/^data:audio\/[a-z0-9]+;base64,/, '')
      const buffer = Buffer.from(cleanBase64, 'base64')
      const fileName = `${recordingId}.webm`
      savedAudioPath = path.join(uploadsDir, fileName)
      fs.writeFileSync(savedAudioPath, buffer)
      savedAudioUrl = `/uploads/recordings/${fileName}`
    }

    // 4. Update status to COMPLETED and set ended_at & audio_url
    const updateResult = await pool.query(
      `UPDATE recording_sessions
       SET status = 'COMPLETED', ended_at = NOW(), audio_url = COALESCE($3, audio_url),
           transcription_status = CASE WHEN COALESCE($3, audio_url) IS NOT NULL THEN 'PENDING' ELSE transcription_status END,
           transcript = CASE WHEN $3 IS NOT NULL THEN NULL ELSE transcript END,
           transcription_error = CASE WHEN $3 IS NOT NULL THEN NULL ELSE transcription_error END,
           transcribed_at = CASE WHEN $3 IS NOT NULL THEN NULL ELSE transcribed_at END
       WHERE id = $1 AND section_id = $2
       RETURNING 
        id, 
        section_id AS "sectionId", 
        student_id AS "studentId", 
        raised_hand_id AS "raisedHandId", 
        status, 
        topic,
        extra_info AS "extraInfo",
        audio_url AS "audioUrl",
        transcript,
        transcription_status AS "transcriptionStatus",
        transcription_error AS "transcriptionError",
        transcribed_at AS "transcribedAt",
        created_at AS "createdAt", 
        started_at AS "startedAt", 
        ended_at AS "endedAt"`,
      [recordingId, sectionId, savedAudioUrl]
    )

    if (savedAudioPath) {
      processRecordingTranscription(recordingId, savedAudioPath).catch((error) => {
        console.error(`Unable to queue transcription for recording ${recordingId}:`, error)
      })
    }

    return res.status(200).json({
      session: updateResult.rows[0],
    })
  } catch (err) {
    console.error('Error completing recording session:', err)
    return res.status(500).json({ error: 'Internal server error while completing recording session' })
  }
})

// API 4: GET /api/sections/:sectionId/students/:studentId/participation/recording
app.get('/api/sections/:sectionId/students/:studentId/participation/recording', async (req, res) => {
  const { sectionId, studentId } = req.params

  // 1. Validate UUIDs
  if (!sectionId || !UUID_REGEX.test(sectionId)) {
    return res.status(400).json({ error: 'Invalid or missing sectionId UUID' })
  }
  if (!studentId || !UUID_REGEX.test(studentId)) {
    return res.status(400).json({ error: 'Invalid or missing studentId UUID' })
  }

  try {
    // 2. Check if section exists
    const sectionCheck = await pool.query(
      `SELECT id FROM sections WHERE id = $1`,
      [sectionId]
    )

    if (sectionCheck.rowCount === 0) {
      return res.status(404).json({ error: 'Section not found' })
    }

    const ownerCheck = await pool.query(
      `SELECT s.user_id AS "studentUserId"
       FROM students s WHERE s.id = $1`,
      [studentId]
    )
    if (ownerCheck.rowCount === 0) return res.status(404).json({ error: 'Student not found' })
    if (req.user.role === 'STUDENT' && req.user.userId !== ownerCheck.rows[0].studentUserId) {
      return res.status(403).json({ error: 'Forbidden: cannot access another student\'s recording' })
    }
    if (req.user.role === 'FACULTY') {
      const assignment = await pool.query(
        `SELECT 1 FROM section_faculty WHERE section_id = $1 AND faculty_id = $2`,
        [sectionId, req.user.userId]
      )
      if (assignment.rowCount === 0) return res.status(403).json({ error: 'Forbidden: faculty is not assigned to this section' })
    }

    // 3. Query student's latest active/current recording session in this section
    const result = await pool.query(
      `SELECT 
        id,
        section_id AS "sectionId",
        student_id AS "studentId",
        raised_hand_id AS "raisedHandId",
        status,
        topic,
        extra_info AS "extraInfo",
        audio_url AS "audioUrl",
        transcript,
        transcription_status AS "transcriptionStatus",
        transcription_error AS "transcriptionError",
        transcribed_at AS "transcribedAt",
        created_at AS "createdAt",
        started_at AS "startedAt",
        ended_at AS "endedAt"
       FROM recording_sessions
       WHERE section_id = $1 AND student_id = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [sectionId, studentId]
    )

    if (result.rowCount === 0) {
      return res.status(200).json({ session: null })
    }

    return res.status(200).json({
      session: result.rows[0],
    })
  } catch (err) {
    console.error('Error fetching student recording session:', err)
    return res.status(500).json({ error: 'Internal server error while fetching recording session' })
  }
})

// GET a recording transcript. Students may access only their own session;
// faculty must be assigned to the section. Admins retain platform access.
app.get('/api/sections/:sectionId/participation/recordings', async (req, res) => {
  const { sectionId } = req.params
  if (!UUID_REGEX.test(sectionId)) return res.status(400).json({ error: 'Invalid sectionId UUID' })
  if (req.user.role !== 'ADMIN') {
    const assignment = await pool.query(
      `SELECT 1 FROM section_faculty WHERE section_id = $1 AND faculty_id = $2`,
      [sectionId, req.user.userId]
    )
    if (assignment.rowCount === 0) return res.status(403).json({ error: 'Forbidden: faculty is not assigned to this section' })
  }
  try {
    const result = await pool.query(
      `SELECT rs.id, rs.student_id AS "studentId", s.name AS "studentName",
              rs.status, rs.topic, rs.extra_info AS "extraInfo", rs.audio_url AS "audioUrl",
              rs.transcript, rs.transcription_status AS "transcriptionStatus",
              rs.transcription_error AS "transcriptionError", rs.transcribed_at AS "transcribedAt",
              re.status AS "evaluationStatus", re.relevant AS "evaluationRelevant",
              re.correct AS "evaluationCorrect", re.reason AS "evaluationReason",
              re.suggested_token_change AS "suggestedTokenChange", re.error_message AS "evaluationError",
              re.final_token_change AS "finalTokenChange", re.finalized_at AS "finalizedAt"
       FROM recording_sessions rs
       JOIN students s ON s.id = rs.student_id
       LEFT JOIN recording_evaluations re ON re.recording_session_id = rs.id
       WHERE rs.section_id = $1 ORDER BY rs.created_at DESC`,
      [sectionId]
    )
    return res.status(200).json({ recordings: result.rows })
  } catch (err) {
    console.error('Error fetching section recordings:', err)
    return res.status(500).json({ error: 'Internal server error while fetching recordings' })
  }
})

app.get('/api/sections/:sectionId/participation/recordings/:recordingId/transcription', async (req, res) => {
  const { sectionId, recordingId } = req.params
  if (!UUID_REGEX.test(sectionId) || !UUID_REGEX.test(recordingId)) {
    return res.status(400).json({ error: 'Invalid sectionId or recordingId UUID' })
  }

  try {
    const result = await pool.query(
      `SELECT rs.id, rs.section_id AS "sectionId", rs.student_id AS "studentId",
              rs.status, rs.topic, rs.extra_info AS "extraInfo", rs.audio_url AS "audioUrl",
              rs.transcript, rs.transcription_status AS "transcriptionStatus",
              rs.transcription_error AS "transcriptionError", rs.transcribed_at AS "transcribedAt",
              re.status AS "evaluationStatus", re.relevant AS "evaluationRelevant",
              re.correct AS "evaluationCorrect", re.reason AS "evaluationReason",
              re.suggested_token_change AS "suggestedTokenChange", re.error_message AS "evaluationError",
              re.final_token_change AS "finalTokenChange", re.finalized_at AS "finalizedAt",
              s.user_id AS "studentUserId"
       FROM recording_sessions rs
       JOIN students s ON s.id = rs.student_id
       LEFT JOIN recording_evaluations re ON re.recording_session_id = rs.id
       WHERE rs.id = $1 AND rs.section_id = $2`,
      [recordingId, sectionId]
    )
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Recording session not found in this section' })
    }

    const session = result.rows[0]
    if (req.user.role === 'STUDENT' && req.user.userId !== session.studentUserId) {
      return res.status(403).json({ error: 'Forbidden: cannot access another student\'s transcript' })
    }
    if (req.user.role === 'FACULTY') {
      const assignment = await pool.query(
        `SELECT 1 FROM section_faculty WHERE section_id = $1 AND faculty_id = $2`,
        [sectionId, req.user.userId]
      )
      if (assignment.rowCount === 0) {
        return res.status(403).json({ error: 'Forbidden: faculty is not assigned to this section' })
      }
    }

    delete session.studentUserId
    return res.status(200).json({ session })
  } catch (err) {
    console.error('Error fetching recording transcription:', err)
    return res.status(500).json({ error: 'Internal server error while fetching transcription' })
  }
})

app.get('/api/sections/:sectionId/participation/recordings/:recordingId/evaluation', async (req, res) => {
  const { sectionId, recordingId } = req.params
  if (!UUID_REGEX.test(sectionId) || !UUID_REGEX.test(recordingId)) return res.status(400).json({ error: 'Invalid sectionId or recordingId UUID' })
  try {
    const result = await pool.query(
      `SELECT rs.id, rs.student_id AS "studentId", s.user_id AS "studentUserId",
              rs.topic, rs.extra_info AS "extraInfo", rs.transcript,
              rs.transcription_status AS "transcriptionStatus",
              re.status, re.relevant, re.correct, re.reason,
              re.suggested_token_change AS "suggestedTokenChange",
              re.provider, re.model, re.error_message AS "errorMessage",
              re.created_at AS "createdAt", re.completed_at AS "completedAt"
       FROM recording_sessions rs
       JOIN students s ON s.id = rs.student_id
       LEFT JOIN recording_evaluations re ON re.recording_session_id = rs.id
       WHERE rs.id = $1 AND rs.section_id = $2`,
      [recordingId, sectionId]
    )
    if (result.rowCount === 0) return res.status(404).json({ error: 'Recording session not found in this section' })
    const evaluation = result.rows[0]
    if (req.user.role === 'STUDENT' && req.user.userId !== evaluation.studentUserId) return res.status(403).json({ error: 'Forbidden: cannot access another student\'s evaluation' })
    if (req.user.role === 'FACULTY') {
      const assignment = await pool.query(`SELECT 1 FROM section_faculty WHERE section_id = $1 AND faculty_id = $2`, [sectionId, req.user.userId])
      if (assignment.rowCount === 0) return res.status(403).json({ error: 'Forbidden: faculty is not assigned to this section' })
    }
    delete evaluation.studentUserId
    return res.status(200).json({ evaluation })
  } catch (err) {
    console.error('Error fetching evaluation:', err)
    return res.status(500).json({ error: 'Internal server error while fetching evaluation' })
  }
})

// Faculty/admin retry endpoint. It never writes token events or balances.
app.post('/api/sections/:sectionId/participation/recordings/:recordingId/evaluation', async (req, res) => {
  const { sectionId, recordingId } = req.params
  if (!UUID_REGEX.test(sectionId) || !UUID_REGEX.test(recordingId)) return res.status(400).json({ error: 'Invalid sectionId or recordingId UUID' })
  if (!['FACULTY', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: 'Forbidden: faculty or admin role required' })
  try {
    const recording = await pool.query(`SELECT id, transcription_status AS "transcriptionStatus" FROM recording_sessions WHERE id = $1 AND section_id = $2`, [recordingId, sectionId])
    if (recording.rowCount === 0) return res.status(404).json({ error: 'Recording session not found in this section' })
    if (recording.rows[0].transcriptionStatus !== 'COMPLETED') return res.status(400).json({ error: 'Evaluation requires a completed transcript' })
    await processRecordingEvaluation(recordingId)
    return res.status(202).json({ message: 'Evaluation processing requested' })
  } catch (err) {
    console.error('Error processing evaluation:', err)
    return res.status(500).json({ error: 'Evaluation processing failed' })
  }
})

app.post('/api/sections/:sectionId/participation/recordings/:recordingId/evaluation/decision', async (req, res) => {
  const { sectionId, recordingId } = req.params
  const finalTokenChange = Number(req.body?.finalTokenChange)
  if (!UUID_REGEX.test(sectionId) || !UUID_REGEX.test(recordingId)) return res.status(400).json({ error: 'Invalid sectionId or recordingId UUID' })
  if (req.user.role !== 'FACULTY') return res.status(403).json({ error: 'Forbidden: faculty role required' })
  try {
    const assignment = await pool.query(`SELECT 1 FROM section_faculty WHERE section_id = $1 AND faculty_id = $2`, [sectionId, req.user.userId])
    if (!assignment.rowCount) return res.status(403).json({ error: 'Forbidden: faculty is not assigned to this section' })
    const result = await finalizeRecordingEvaluation({ recordingId, sectionId, facultyUserId: req.user.userId, finalTokenChange })
    return res.status(200).json(result)
  } catch (error) {
    const status = error.statusCode || 500
    if (status === 500) console.error('Error finalizing evaluation:', error)
    return res.status(status).json({ error: error.message || 'Failed to finalize evaluation' })
  }
})

const PORT = process.env.PORT || 3001

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`SmartToken API server running on port ${PORT}`)
  })
}

export default app
