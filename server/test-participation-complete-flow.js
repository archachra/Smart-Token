import fs from 'fs'
import path from 'path'
import pool from './db.js'

async function testCompleteParticipationFlow() {
  console.log('=== Starting End-to-End Participation Flow Test ===\n')
  const baseUrl = 'http://localhost:3001'
  let raisedHandId, recordingId

  try {
    // 1. Get Section and Users
    const secRes = await pool.query(`SELECT id FROM sections LIMIT 1`)
    const sectionId = secRes.rows[0].id

    const studUserRes = await pool.query(
      `SELECT s.id AS student_id, u.id AS user_id, u.email
       FROM students s JOIN users u ON u.id = s.user_id
       WHERE u.email = 'student@example.com'`
    )
    const student = studUserRes.rows[0]

    // Login Faculty
    const facLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'faculty@example.com', password: 'FacultyPass123!' }),
    })
    const { token: facultyToken } = await facLogin.json()

    // Login Student
    const studLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'student@example.com', password: 'StudentPass123!' }),
    })
    const { token: studentToken } = await studLogin.json()

    // Clean any existing raised hands for this student
    await pool.query(`DELETE FROM raised_hands WHERE student_id = $1 AND section_id = $2`, [student.student_id, sectionId])

    // Step 1: Student raises hand
    console.log('Step 1: Student raises hand...')
    const raiseRes = await fetch(`${baseUrl}/api/sections/${sectionId}/participation/raise`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` },
    })
    const raiseBody = await raiseRes.json()
    console.log('Raise Status:', raiseRes.status)
    if (raiseRes.status !== 201) throw new Error(`Raise hand failed: ${JSON.stringify(raiseBody)}`)
    raisedHandId = raiseBody.request.id
    console.log('✅ Hand raised, request ID:', raisedHandId)

    // Step 2: Faculty approves raised hand
    console.log('\nStep 2: Faculty approves raised hand...')
    const approveRes = await fetch(`${baseUrl}/api/sections/${sectionId}/participation/raised/${raisedHandId}/approve`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${facultyToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        topic: 'Python Programming',
        extraInfo: 'Explain what a function is in Python',
      }),
    })
    const approveBody = await approveRes.json()
    console.log('Approve Status:', approveRes.status)
    if (approveRes.status !== 201) throw new Error(`Approve failed: ${JSON.stringify(approveBody)}`)
    recordingId = approveBody.session.id
    console.log('✅ Approved, recording session ID:', recordingId, 'status:', approveBody.session.status)

    // Step 3: Student starts recording
    console.log('\nStep 3: Student starts recording...')
    const startRes = await fetch(`${baseUrl}/api/sections/${sectionId}/participation/recordings/${recordingId}/start`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${studentToken}` },
    })
    const startBody = await startRes.json()
    console.log('Start Status:', startRes.status)
    if (startRes.status !== 200) throw new Error(`Start failed: ${JSON.stringify(startBody)}`)
    console.log('✅ Recording started, status:', startBody.session.status)

    // Step 4: Student stops recording with audio payload
    console.log('\nStep 4: Student stops recording and uploads audio...')
    const sampleAudioPath = path.resolve('server/uploads/recordings/074b730a-34b6-4fa5-8aa4-06871c67f21b.webm')
    const sampleBuffer = fs.readFileSync(sampleAudioPath)
    const base64Audio = `data:audio/webm;base64,${sampleBuffer.toString('base64')}`

    const completeRes = await fetch(`${baseUrl}/api/sections/${sectionId}/participation/recordings/${recordingId}/complete`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${studentToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ audioBase64: base64Audio }),
    })
    const completeBody = await completeRes.json()
    console.log('Complete Status:', completeRes.status)
    if (completeRes.status !== 200) throw new Error(`Complete failed: ${JSON.stringify(completeBody)}`)
    console.log('✅ Recording stopped and saved, audioUrl:', completeBody.session.audioUrl)

    // Verify audio file exists on disk
    const savedDiskPath = path.resolve(`server/uploads/recordings/${recordingId}.webm`)
    if (!fs.existsSync(savedDiskPath)) {
      throw new Error(`Audio file was not saved to expected disk path: ${savedDiskPath}`)
    }
    console.log('✅ Audio file verified on disk, size:', fs.statSync(savedDiskPath).size, 'bytes')

    // Step 5: Wait for asynchronous transcription and Groq evaluation
    console.log('\nStep 5: Waiting for Groq transcription and AI evaluation in background...')
    let evalCompleted = false
    for (let attempt = 0; attempt < 25; attempt++) {
      await new Promise((r) => setTimeout(r, 1500))
      const evalCheck = await pool.query(
        `SELECT re.*, rs.transcript, rs.transcription_status
         FROM recording_evaluations re
         JOIN recording_sessions rs ON rs.id = re.recording_session_id
         WHERE re.recording_session_id = $1`,
        [recordingId]
      )
      if (evalCheck.rowCount > 0) {
        const row = evalCheck.rows[0]
        console.log(`[Poll ${attempt + 1}] Transcription: ${row.transcription_status}, Evaluation: ${row.status}`)
        if (row.transcription_status === 'COMPLETED' && row.status === 'COMPLETED') {
          console.log('\nTranscript:', row.transcript)
          console.log('Suggested token change:', row.suggested_token_change)
          console.log('Reason:', row.reason)
          evalCompleted = true
          break
        }
      }
    }

    if (!evalCompleted) {
      throw new Error('Timed out waiting for transcription and evaluation to complete')
    }
    console.log('✅ Groq transcription & evaluation completed successfully!')

    // Step 6: Faculty reviews and finalizes decision
    console.log('\nStep 6: Faculty reviews and finalizes decision...')
    const balBeforeRes = await pool.query(
      `SELECT COALESCE(balance, 0) AS balance FROM student_balances WHERE student_id = $1 AND section_id = $2`,
      [student.student_id, sectionId]
    )
    const balBefore = balBeforeRes.rows[0]?.balance || 0

    const decisionRes = await fetch(
      `${baseUrl}/api/sections/${sectionId}/participation/recordings/${recordingId}/evaluation/decision`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${facultyToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ finalTokenChange: 2 }),
      }
    )
    const decisionBody = await decisionRes.json()
    console.log('Decision Status:', decisionRes.status)
    if (decisionRes.status !== 200) throw new Error(`Decision failed: ${JSON.stringify(decisionBody)}`)
    console.log('✅ Faculty finalized evaluation, status:', decisionBody.evaluation.status)

    // Verify balance increased by 2
    const balAfterRes = await pool.query(
      `SELECT COALESCE(balance, 0) AS balance FROM student_balances WHERE student_id = $1 AND section_id = $2`,
      [student.student_id, sectionId]
    )
    const balAfter = balAfterRes.rows[0]?.balance || 0
    console.log(`Balance before: ${balBefore}, after: ${balAfter}`)
    if (balAfter !== balBefore + 2) {
      throw new Error(`Expected balance to increase by 2, got ${balBefore} -> ${balAfter}`)
    }

    // Verify event recorded in ledger
    const eventId = decisionBody.event?.id || decisionBody.evaluation?.finalized_event_id || decisionBody.evaluation?.finalizedEventId
    const eventRes = await pool.query(`SELECT * FROM events WHERE id = $1`, [eventId])
    if (eventRes.rowCount === 0 || eventRes.rows[0].token_change !== 2) {
      throw new Error('Event row not properly recorded in ledger')
    }
    console.log('✅ Ledger event verified:', eventRes.rows[0].description)

    console.log('\n🎉 ENTIRE PARTICIPATION FLOW PASSED 100% SUCCESSFULLY!')
  } finally {
    // Clean up test data
    if (recordingId) {
      await pool.query(`DELETE FROM recording_evaluations WHERE recording_session_id = $1`, [recordingId])
      await pool.query(`DELETE FROM recording_sessions WHERE id = $1`, [recordingId])
    }
    if (raisedHandId) {
      await pool.query(`DELETE FROM raised_hands WHERE id = $1`, [raisedHandId])
    }
    await pool.end()
  }
}

testCompleteParticipationFlow().then(() => {
  process.exit(0)
}).catch((err) => {
  console.error('\n❌ Test failed:', err)
  process.exit(1)
})
