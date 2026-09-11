process.env.NODE_ENV = 'test'

import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import pool from './db.js'
import app from './index.js'

function generateUuid() {
  return crypto.randomUUID()
}

async function runAttendanceApiTests() {
  console.log('--- Starting Focused API Tests for PATCH /api/sections/:sectionId/students/:studentId/attendance ---\n')

  let server
  const PORT = 3097

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
    // Unauthenticated request (should be 401)
    const unauthRes = await fetch(`${baseUrl}/api/sections/${sectionId}/students/${studentId}/attendance`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'PRESENT', clientEventId: generateUuid(), createdBy }),
    });
    if (unauthRes.status !== 401) throw new Error(`Expected 401 for unauthenticated attendance, got ${unauthRes.status}`);

    // Login to obtain JWT for Faculty
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'faculty@example.com', password: 'FacultyPass123!' }),
    });
    if (loginRes.status !== 200) throw new Error('Login failed for faculty');
    const { token } = await loginRes.json();
    const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    // Ensure student starts in 'ABSENT' state with initial balance
    await pool.query(
      `UPDATE enrollments SET attendance_status = 'ABSENT' WHERE student_id = $1 AND section_id = $2`,
      [studentId, sectionId]
    )

    const initBalRes = await pool.query(
      `SELECT COALESCE(balance, 0) as balance FROM student_balances WHERE student_id = $1 AND section_id = $2`,
      [studentId, sectionId]
    )
    const initialBalance = initBalRes.rowCount > 0 ? initBalRes.rows[0].balance : 0

    // Test 1: Direction 1: ABSENT -> PRESENT (+1 token)
    const clientEventId1 = generateUuid()
    console.log(`Test 1: ABSENT -> PRESENT (+1 Token)`)
    const res1 = await fetch(`${baseUrl}/api/sections/${sectionId}/students/${studentId}/attendance`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        status: 'PRESENT',
        clientEventId: clientEventId1,
        createdBy,
      }),
    })
    const body1 = await res1.json()

    console.log(`Status Code: ${res1.status}`)
    console.log(`Response Body:`, JSON.stringify(body1, null, 2))

    if (res1.status !== 200) throw new Error(`Expected 200 OK, got ${res1.status}`)
    if (body1.status !== 'PRESENT') throw new Error('Expected status to be PRESENT')
    if (body1.tokenChange !== 1) throw new Error(`Expected tokenChange 1, got ${body1.tokenChange}`)
    if (body1.balance !== initialBalance + 1) throw new Error(`Expected balance ${initialBalance + 1}, got ${body1.balance}`)
    console.log('✅ Test 1 PASSED: ABSENT -> PRESENT updated status and awarded +1 token.\n')

    // Test 2: Direction 2: PRESENT -> ABSENT (-1 token)
    const clientEventId2 = generateUuid()
    console.log(`Test 2: PRESENT -> ABSENT (-1 Token)`)
    const res2 = await fetch(`${baseUrl}/api/sections/${sectionId}/students/${studentId}/attendance`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        status: 'ABSENT',
        clientEventId: clientEventId2,
        createdBy,
      }),
    })
    const body2 = await res2.json()

    console.log(`Status Code: ${res2.status}`)
    console.log(`Response Body:`, JSON.stringify(body2, null, 2))

    if (res2.status !== 200) throw new Error(`Expected 200 OK, got ${res2.status}`)
    if (body2.status !== 'ABSENT') throw new Error('Expected status to be ABSENT')
    if (body2.tokenChange !== -1) throw new Error(`Expected tokenChange -1, got ${body2.tokenChange}`)
    if (body2.balance !== initialBalance) throw new Error(`Expected balance ${initialBalance}, got ${body2.balance}`)
    console.log('✅ Test 2 PASSED: PRESENT -> ABSENT updated status and deducted -1 token.\n')

    // Test 3: Repeated Same-Status Update (ABSENT -> ABSENT, 0 token change)
    const clientEventId3 = generateUuid()
    console.log(`Test 3: Repeated Same-Status Update (ABSENT -> ABSENT)`)
    const res3 = await fetch(`${baseUrl}/api/sections/${sectionId}/students/${studentId}/attendance`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        status: 'ABSENT',
        clientEventId: clientEventId3,
        createdBy,
      }),
    })
    const body3 = await res3.json()

    console.log(`Status Code: ${res3.status}`)
    console.log(`Response Body:`, JSON.stringify(body3, null, 2))

    if (res3.status !== 200) throw new Error(`Expected 200 OK, got ${res3.status}`)
    if (body3.status !== 'ABSENT') throw new Error('Expected status to be ABSENT')
    if (body3.tokenChange !== 0) throw new Error(`Expected tokenChange 0, got ${body3.tokenChange}`)
    if (body3.balance !== initialBalance) throw new Error(`Expected balance ${initialBalance}, got ${body3.balance}`)
    console.log('✅ Test 3 PASSED: Repeated same-status update left token balance unchanged.\n')

    // Test 4: Duplicate clientEventId (Idempotency Check)
    console.log(`Test 4: Idempotency Check with Duplicate clientEventId`)
    const res4 = await fetch(`${baseUrl}/api/sections/${sectionId}/students/${studentId}/attendance`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        status: 'PRESENT', // different status attempt, should be idempotent
        clientEventId: clientEventId1, // reusing clientEventId1
        createdBy,
      }),
    })
    const body4 = await res4.json()

    console.log(`Status Code: ${res4.status}`)
    console.log(`Response Body:`, JSON.stringify(body4, null, 2))

    if (res4.status !== 200) throw new Error(`Expected 200 OK for idempotent duplicate, got ${res4.status}`)
    if (!body4.idempotent) throw new Error('Expected idempotent: true in response')
    console.log('✅ Test 4 PASSED: Idempotency correctly returned existing status without re-applying change.\n')

    // Test 5: Invalid Student/Section Enrollment
    const dummyUserRes = await pool.query(
      `INSERT INTO users (email, name, role) VALUES ($1, $2, $3) RETURNING id`,
      [`unenrolled_att_${Date.now()}@smarttoken.edu`, 'Unenrolled Student', 'STUDENT']
    )
    const dummyStudentRes = await pool.query(
      `INSERT INTO students (user_id, student_id_number, name, email) VALUES ($1, $2, $3, $4) RETURNING id`,
      [dummyUserRes.rows[0].id, `UNENROLLED-ATT-${Date.now()}`, 'Unenrolled Student', `unenrolled_att_${Date.now()}@smarttoken.edu`]
    )
    const unenrolledStudentId = dummyStudentRes.rows[0].id

    console.log(`Test 5: Invalid Enrollment (Unenrolled Student)`)
    const res5 = await fetch(`${baseUrl}/api/sections/${sectionId}/students/${unenrolledStudentId}/attendance`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        status: 'PRESENT',
        clientEventId: generateUuid(),
        createdBy,
      }),
    })
    const body5 = await res5.json()

    console.log(`Status Code: ${res5.status}`)
    console.log(`Response Body:`, JSON.stringify(body5, null, 2))

    if (res5.status !== 400) throw new Error(`Expected 400 Bad Request, got ${res5.status}`)
    if (body5.error !== 'Student is not enrolled in this section') throw new Error('Expected enrollment error message')
    console.log('✅ Test 5 PASSED: Invalid enrollment correctly rejected.\n')

    // Test 6: Transaction Failure Handling (FK failure inside transaction)
    const fakeCreatedBy = generateUuid()
    const fakeToken = jwt.sign({ userId: fakeCreatedBy, role: 'FACULTY' }, process.env.JWT_SECRET || 'dev-secret')
    const fakeAuthHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${fakeToken}` }
    console.log(`Test 6: Transaction Failure & Rollback Handling`)
    const res6 = await fetch(`${baseUrl}/api/sections/${sectionId}/students/${studentId}/attendance`, {
      method: 'PATCH',
      headers: fakeAuthHeaders,
      body: JSON.stringify({
        status: 'PRESENT',
        clientEventId: generateUuid(),
        createdBy: fakeCreatedBy,
      }),
    })
    const body6 = await res6.json()

    console.log(`Status Code: ${res6.status}`)
    console.log(`Response Body:`, JSON.stringify(body6, null, 2))

    if (res6.status !== 500) throw new Error(`Expected 500 Internal Server Error, got ${res6.status}`)

    // Verify DB state remained untouched
    const checkAttRes = await pool.query(
      `SELECT attendance_status FROM enrollments WHERE student_id = $1 AND section_id = $2`,
      [studentId, sectionId]
    )
    if (checkAttRes.rows[0].attendance_status !== 'ABSENT') {
      throw new Error('Attendance status was updated despite transaction rollback!')
    }
    console.log('✅ Test 6 PASSED: Transaction failed cleanly and rolled back state atomically.\n')

    console.log('🎉 ALL ATTENDANCE API TESTS PASSED SUCCESSFULLY!')
  } finally {
    if (server) {
      server.close()
    }
    await pool.end()
  }
}

runAttendanceApiTests().catch((err) => {
  console.error('❌ Attendance API Test Failed:', err)
  process.exit(1)
})
