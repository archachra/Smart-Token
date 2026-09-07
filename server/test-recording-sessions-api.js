process.env.NODE_ENV = 'test'

import crypto from 'crypto'
import pool from './db.js'
import app from './index.js'

function generateUuid() {
  return crypto.randomUUID()
}

async function runRecordingSessionsApiTests() {
  console.log('--- Starting Focused API Tests for Participation Recording Sessions ---\n')

  let server
  const PORT = 3093

  try {
    await new Promise((resolve) => {
      server = app.listen(PORT, resolve)
    })

    const baseUrl = `http://localhost:${PORT}`

    // Fetch valid sectionId and studentId from DB
    const sectionRes = await pool.query(`SELECT id FROM sections LIMIT 1`)
    const studentRes = await pool.query(`SELECT id FROM students LIMIT 1`)

    if (sectionRes.rowCount === 0 || studentRes.rowCount === 0) {
      throw new Error('Seed data missing. Run db/verify.js first!')
    }

    const sectionId = sectionRes.rows[0].id
    const studentId = studentRes.rows[0].id

    // Ensure clean state: create a fresh raised_hand request
    await pool.query(`DELETE FROM raised_hands WHERE student_id = $1 AND section_id = $2`, [studentId, sectionId])
    const raisedRes = await pool.query(
      `INSERT INTO raised_hands (section_id, student_id) VALUES ($1, $2) RETURNING id`,
      [sectionId, studentId]
    )
    const requestId = raisedRes.rows[0].id

    // Record initial event count & initial balance
    const initEventCountRes = await pool.query(`SELECT COUNT(*)::int AS count FROM events`)
    const initialEventCount = initEventCountRes.rows[0].count

    const initBalRes = await pool.query(
      `SELECT COALESCE(balance, 0) AS balance FROM student_balances WHERE student_id = $1 AND section_id = $2`,
      [studentId, sectionId]
    )
    const initialBalance = initBalRes.rowCount > 0 ? initBalRes.rows[0].balance : 0

    // Test 1: Successful Faculty Approval
    console.log(`Test 1: Faculty Approves Recording (POST /api/sections/${sectionId}/participation/raised/${requestId}/approve)`)
    const res1 = await fetch(`${baseUrl}/api/sections/${sectionId}/participation/raised/${requestId}/approve`, {
      method: 'POST',
    })
    const body1 = await res1.json()

    console.log(`Status Code: ${res1.status}`)
    console.log(`Response Body:`, JSON.stringify(body1, null, 2))

    if (res1.status !== 201) throw new Error(`Expected 201 Created, got ${res1.status}`)
    if (!body1.session || body1.session.status !== 'APPROVED') throw new Error('Expected session status APPROVED')
    const recordingId = body1.session.id

    // Assert NO events created and student_balances NOT modified
    const postEventCountRes = await pool.query(`SELECT COUNT(*)::int AS count FROM events`)
    if (postEventCountRes.rows[0].count !== initialEventCount) {
      throw new Error('FAIL: An event row was created! Recording sessions must not create events.')
    }
    const postBalRes = await pool.query(
      `SELECT COALESCE(balance, 0) AS balance FROM student_balances WHERE student_id = $1 AND section_id = $2`,
      [studentId, sectionId]
    )
    if (postBalRes.rows[0].balance !== initialBalance) {
      throw new Error('FAIL: student_balances was modified!')
    }
    console.log('✅ Test 1 PASSED: Faculty approval created APPROVED recording session without altering events/balances.\n')

    // Test 2: Duplicate Approval Attempt on Same Raised Hand
    console.log(`Test 2: Duplicate Approval Attempt`)
    const res2 = await fetch(`${baseUrl}/api/sections/${sectionId}/participation/raised/${requestId}/approve`, {
      method: 'POST',
    })
    const body2 = await res2.json()

    console.log(`Status Code: ${res2.status}`)
    console.log(`Response Body:`, JSON.stringify(body2, null, 2))

    if (res2.status !== 400) throw new Error(`Expected 400 Bad Request for duplicate approval, got ${res2.status}`)
    console.log('✅ Test 2 PASSED: Duplicate approval correctly rejected.\n')

    // Test 3: Nonexistent Raised Hand Request Approval
    const fakeRequestId = generateUuid()
    console.log(`Test 3: Nonexistent Raised Hand Approval`)
    const res3 = await fetch(`${baseUrl}/api/sections/${sectionId}/participation/raised/${fakeRequestId}/approve`, {
      method: 'POST',
    })
    const body3 = await res3.json()

    console.log(`Status Code: ${res3.status}`)
    console.log(`Response Body:`, JSON.stringify(body3, null, 2))

    if (res3.status !== 404) throw new Error(`Expected 404 Not Found, got ${res3.status}`)
    console.log('✅ Test 3 PASSED: Nonexistent raised hand approval returned 404.\n')

    // Test 4: Retrieve Student's Session (APPROVED state)
    console.log(`Test 4: Get Student Recording Session (GET /api/sections/${sectionId}/students/${studentId}/participation/recording)`)
    const res4 = await fetch(`${baseUrl}/api/sections/${sectionId}/students/${studentId}/participation/recording`)
    const body4 = await res4.json()

    console.log(`Status Code: ${res4.status}`)
    console.log(`Response Body:`, JSON.stringify(body4, null, 2))

    if (res4.status !== 200) throw new Error(`Expected 200 OK, got ${res4.status}`)
    if (!body4.session || body4.session.id !== recordingId || body4.session.status !== 'APPROVED') {
      throw new Error('Expected student recording session in APPROVED status')
    }
    console.log('✅ Test 4 PASSED: Student recording session retrieved successfully.\n')

    // Test 5: Invalid Start State (Complete before Start)
    console.log(`Test 5: Invalid State Transition (Complete session while APPROVED)`)
    const res5 = await fetch(`${baseUrl}/api/sections/${sectionId}/participation/recordings/${recordingId}/complete`, {
      method: 'PATCH',
    })
    const body5 = await res5.json()

    console.log(`Status Code: ${res5.status}`)
    console.log(`Response Body:`, JSON.stringify(body5, null, 2))

    if (res5.status !== 400) throw new Error(`Expected 400 Bad Request, got ${res5.status}`)
    console.log('✅ Test 5 PASSED: Invalid state transition (completing before starting) rejected.\n')

    // Test 6: Successful Start Recording
    console.log(`Test 6: Student Starts Recording (PATCH /api/sections/${sectionId}/participation/recordings/${recordingId}/start)`)
    const res6 = await fetch(`${baseUrl}/api/sections/${sectionId}/participation/recordings/${recordingId}/start`, {
      method: 'PATCH',
    })
    const body6 = await res6.json()

    console.log(`Status Code: ${res6.status}`)
    console.log(`Response Body:`, JSON.stringify(body6, null, 2))

    if (res6.status !== 200) throw new Error(`Expected 200 OK, got ${res6.status}`)
    if (!body6.session || body6.session.status !== 'RECORDING' || !body6.session.startedAt) {
      throw new Error('Expected session status RECORDING with startedAt timestamp')
    }
    console.log('✅ Test 6 PASSED: Recording started successfully and status updated to RECORDING.\n')

    // Test 7: Invalid Start State (Attempting second start while already RECORDING)
    console.log(`Test 7: Second Start Attempt while RECORDING`)
    const res7 = await fetch(`${baseUrl}/api/sections/${sectionId}/participation/recordings/${recordingId}/start`, {
      method: 'PATCH',
    })
    const body7 = await res7.json()

    console.log(`Status Code: ${res7.status}`)
    console.log(`Response Body:`, JSON.stringify(body7, null, 2))

    if (res7.status !== 400) throw new Error(`Expected 400 Bad Request, got ${res7.status}`)
    console.log('✅ Test 7 PASSED: Starting session when already RECORDING rejected.\n')

    // Test 8: Successful Stop/Complete Recording
    console.log(`Test 8: Student Stops Recording (PATCH /api/sections/${sectionId}/participation/recordings/${recordingId}/complete)`)
    const res8 = await fetch(`${baseUrl}/api/sections/${sectionId}/participation/recordings/${recordingId}/complete`, {
      method: 'PATCH',
    })
    const body8 = await res8.json()

    console.log(`Status Code: ${res8.status}`)
    console.log(`Response Body:`, JSON.stringify(body8, null, 2))

    if (res8.status !== 200) throw new Error(`Expected 200 OK, got ${res8.status}`)
    if (!body8.session || body8.session.status !== 'COMPLETED' || !body8.session.endedAt) {
      throw new Error('Expected session status COMPLETED with endedAt timestamp')
    }
    console.log('✅ Test 8 PASSED: Recording stopped successfully and status updated to COMPLETED.\n')

    // Test 9: Section Scoping Violation
    const wrongSectionId = generateUuid()
    console.log(`Test 9: Section Scoping Check (Using wrong sectionId on start)`)
    const res9 = await fetch(`${baseUrl}/api/sections/${wrongSectionId}/participation/recordings/${recordingId}/start`, {
      method: 'PATCH',
    })
    const body9 = await res9.json()

    console.log(`Status Code: ${res9.status}`)
    console.log(`Response Body:`, JSON.stringify(body9, null, 2))

    if (res9.status !== 404) throw new Error(`Expected 404 Not Found for section scoping violation, got ${res9.status}`)
    console.log('✅ Test 9 PASSED: Section scoping enforced, returning 404 for wrong section.\n')

    // Test 10: Invalid UUID Formats
    console.log(`Test 10: Invalid UUID Formats`)
    const res10 = await fetch(`${baseUrl}/api/sections/bad-uuid/students/bad-uuid/participation/recording`)
    const body10 = await res10.json()

    console.log(`Status Code: ${res10.status}`)
    console.log(`Response Body:`, JSON.stringify(body10, null, 2))

    if (res10.status !== 400) throw new Error(`Expected 400 Bad Request, got ${res10.status}`)
    console.log('✅ Test 10 PASSED: Invalid UUID format correctly rejected.\n')

    console.log('🎉 ALL RECORDING SESSION API TESTS PASSED SUCCESSFULLY!')
  } finally {
    if (server) {
      server.close()
    }
    await pool.end()
  }
}

runRecordingSessionsApiTests().catch((err) => {
  console.error('❌ Recording Sessions API Test Failed:', err)
  process.exit(1)
})
