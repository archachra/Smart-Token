process.env.NODE_ENV = 'test'

import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import pool from './db.js'
import app from './index.js'

function generateUuid() {
  return crypto.randomUUID()
}

async function runEventsApiTests() {
  console.log('--- Starting Focused API Tests for POST /api/events ---\n')

  let server
  const PORT = 3098

  try {
    await new Promise((resolve) => {
      server = app.listen(PORT, resolve)
    })

    const baseUrl = `http://localhost:${PORT}`

    // Fetch valid seed IDs from DB
    const sectionRes = await pool.query(`SELECT id FROM sections LIMIT 1`)
    const studentRes = await pool.query(`SELECT id FROM students LIMIT 1`)
    const facultyRes = await pool.query(`SELECT id FROM users WHERE role = 'FACULTY' LIMIT 1`)

    if (sectionRes.rowCount === 0 || studentRes.rowCount === 0 || facultyRes.rowCount === 0) {
      throw new Error('Seed data missing. Run db/verify.js first!')
    }

    const sectionId = sectionRes.rows[0].id
    const studentId = studentRes.rows[0].id
    const createdBy = facultyRes.rows[0].id

    // Fetch initial balance
    const initBalRes = await pool.query(
      `SELECT COALESCE(balance, 0) as balance FROM student_balances WHERE student_id = $1 AND section_id = $2`,
      [studentId, sectionId]
    )
    const initialBalance = initBalRes.rowCount > 0 ? initBalRes.rows[0].balance : 0

    // Unauthenticated request (should be 401)
    const unauthRes = await fetch(`${baseUrl}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sectionId, studentId, tokenChange: 1, eventType: 'TOKEN_AWARD', clientEventId: generateUuid(), createdBy }),
    });
    if (unauthRes.status !== 401) throw new Error(`Expected 401 for unauthenticated event creation, got ${unauthRes.status}`);

    // Login to obtain JWT for Faculty
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'faculty@example.com', password: 'FacultyPass123!' }),
    });
    if (loginRes.status !== 200) throw new Error('Login failed for faculty');
    const { token } = await loginRes.json();
    const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    // Test 1: Successful Token Award (+2)
    const clientEventId1 = generateUuid()
    console.log(`Test 1: POST /api/events - Successful Token Award (+2)`)
    const res1 = await fetch(`${baseUrl}/api/events`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        sectionId,
        studentId,
        tokenChange: 2,
        eventType: 'TOKEN_AWARD',
        description: 'Great question in class',
        clientEventId: clientEventId1,
        createdBy,
      }),
    })
    const body1 = await res1.json()

    console.log(`Status Code: ${res1.status}`)
    console.log(`Response Body:`, JSON.stringify(body1, null, 2))

    if (res1.status !== 201) throw new Error(`Expected 201 Created, got ${res1.status}`)
    if (body1.balance !== initialBalance + 2) {
      throw new Error(`Expected balance ${initialBalance + 2}, got ${body1.balance}`)
    }
    if (body1.event.clientEventId !== clientEventId1) {
      throw new Error('clientEventId mismatch in response')
    }
    console.log('✅ Test 1 PASSED: Token award succeeded and balance updated.\n')

    // Test 2: Negative Token Adjustment (-1)
    const clientEventId2 = generateUuid()
    console.log(`Test 2: POST /api/events - Negative Token Adjustment (-1)`)
    const res2 = await fetch(`${baseUrl}/api/events`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        sectionId,
        studentId,
        tokenChange: -1,
        eventType: 'CORRECTION',
        description: 'Duplicate token correction',
        clientEventId: clientEventId2,
        createdBy,
      }),
    })
    const body2 = await res2.json()

    console.log(`Status Code: ${res2.status}`)
    console.log(`Response Body:`, JSON.stringify(body2, null, 2))

    if (res2.status !== 201) throw new Error(`Expected 201 Created, got ${res2.status}`)
    if (body2.balance !== initialBalance + 1) {
      throw new Error(`Expected balance ${initialBalance + 1}, got ${body2.balance}`)
    }
    console.log('✅ Test 2 PASSED: Negative token adjustment succeeded.\n')

    // Test 3: Idempotency (Duplicate clientEventId)
    console.log(`Test 3: POST /api/events - Idempotency Check with Duplicate clientEventId`)
    const res3 = await fetch(`${baseUrl}/api/events`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        sectionId,
        studentId,
        tokenChange: 2, // different value attempt, should be ignored
        eventType: 'TOKEN_AWARD',
        description: 'Duplicate retry attempt',
        clientEventId: clientEventId1, // reusing clientEventId1
        createdBy,
      }),
    })
    const body3 = await res3.json()

    console.log(`Status Code: ${res3.status}`)
    console.log(`Response Body:`, JSON.stringify(body3, null, 2))

    if (res3.status !== 200) throw new Error(`Expected 200 OK for idempotent duplicate, got ${res3.status}`)
    if (!body3.idempotent) throw new Error('Expected idempotent: true in response')
    if (body3.event.tokenChange !== 2) throw new Error('Expected original tokenChange (2) in event')
    if (body3.balance !== initialBalance + 1) throw new Error('Balance changed on duplicate event retry!')
    console.log('✅ Test 3 PASSED: Idempotency correctly returned existing event without duplicate application.\n')

    // Test 4: Invalid Student/Section Relationship (Unenrolled student)
    // Create un-enrolled student for test
    const dummyUserRes = await pool.query(
      `INSERT INTO users (email, name, role) VALUES ($1, $2, $3) RETURNING id`,
      [`unenrolled_${Date.now()}@smarttoken.edu`, 'Unenrolled Student', 'STUDENT']
    )
    const dummyStudentRes = await pool.query(
      `INSERT INTO students (user_id, student_id_number, name, email) VALUES ($1, $2, $3, $4) RETURNING id`,
      [dummyUserRes.rows[0].id, `UNENROLLED-${Date.now()}`, 'Unenrolled Student', `unenrolled_${Date.now()}@smarttoken.edu`]
    )
    const unenrolledStudentId = dummyStudentRes.rows[0].id

    console.log(`Test 4: POST /api/events - Invalid Student/Section Relationship`)
    const res4 = await fetch(`${baseUrl}/api/events`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        sectionId,
        studentId: unenrolledStudentId,
        tokenChange: 1,
        eventType: 'TOKEN_AWARD',
        clientEventId: generateUuid(),
        createdBy,
      }),
    })
    const body4 = await res4.json()

    console.log(`Status Code: ${res4.status}`)
    console.log(`Response Body:`, JSON.stringify(body4, null, 2))

    if (res4.status !== 400) throw new Error(`Expected 400 Bad Request, got ${res4.status}`)
    if (body4.error !== 'Student is not enrolled in this section') {
      throw new Error('Expected enrollment error message')
    }
    console.log('✅ Test 4 PASSED: Invalid student/section relationship rejected.\n')

    // Test 5: Transaction Failure Handling (FK Violation inside Transaction)
    const fakeCreatedBy = generateUuid() // Non-existent user UUID causes FK constraint failure inside transaction
    const fakeToken = jwt.sign({ userId: fakeCreatedBy, role: 'FACULTY' }, process.env.JWT_SECRET || 'dev-secret')
    const fakeAuthHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${fakeToken}` }
    const clientEventIdFail = generateUuid()

    console.log(`Test 5: POST /api/events - Transaction Failure & Rollback Handling`)
    const res5 = await fetch(`${baseUrl}/api/events`, {
      method: 'POST',
      headers: fakeAuthHeaders,
      body: JSON.stringify({
        sectionId,
        studentId,
        tokenChange: 10,
        eventType: 'TOKEN_AWARD',
        clientEventId: clientEventIdFail,
        createdBy: fakeCreatedBy,
      }),
    })
    const body5 = await res5.json()

    console.log(`Status Code: ${res5.status}`)
    console.log(`Response Body:`, JSON.stringify(body5, null, 2))

    if (res5.status !== 500) throw new Error(`Expected 500 Internal Server Error, got ${res5.status}`)

    // Assert database balance was NOT modified
    const checkBalRes = await pool.query(
      `SELECT balance FROM student_balances WHERE student_id = $1 AND section_id = $2`,
      [studentId, sectionId]
    )
    if (checkBalRes.rows[0].balance !== initialBalance + 1) {
      throw new Error('Database balance was modified despite transaction failure!')
    }
    console.log('✅ Test 5 PASSED: Transaction failed cleanly and rolled back atomically.\n')

    console.log('🎉 ALL TOKEN ADJUSTMENT API TESTS PASSED SUCCESSFULLY!')
  } finally {
    if (server) {
      server.close()
    }
    await pool.end()
  }
}

runEventsApiTests().catch((err) => {
  console.error('❌ Events API Test Failed:', err)
  process.exit(1)
})
