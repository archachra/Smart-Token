process.env.NODE_ENV = 'test'

import crypto from 'crypto'
import pool from './db.js'
import app from './index.js'

function generateUuid() {
  return crypto.randomUUID()
}

async function runRaisedHandApiTests() {
  console.log('--- Starting Focused API Tests for POST /api/sections/:sectionId/participation/raise ---\n')

  let server
  const PORT = 3096

  try {
    await new Promise((resolve) => {
      server = app.listen(PORT, resolve)
    })

    const baseUrl = `http://localhost:${PORT}`

    // Fetch valid seed IDs from DB
    const sectionRes = await pool.query(`SELECT id FROM sections LIMIT 1`)
    const studentRes = await pool.query(`SELECT id FROM students LIMIT 1`)

    if (sectionRes.rowCount === 0 || studentRes.rowCount === 0) {
      throw new Error('Seed data missing. Run db/verify.js first!')
    }

    const sectionId = sectionRes.rows[0].id
    const studentId = studentRes.rows[0].id;
  // Unauthenticated request (should be 401)
  const unauthRes = await fetch(`${baseUrl}/api/sections/${sectionId}/participation/raise`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId }),
  });
  if (unauthRes.status !== 401) throw new Error(`Expected 401 for unauthenticated raise hand, got ${unauthRes.status}`);

  // Login to obtain JWT for Student
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'student@example.com', password: 'StudentPass123!' }),
  });
  if (loginRes.status !== 200) throw new Error('Login failed for student');
  const { token } = await loginRes.json();
  const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };


    // Ensure clean state: delete any existing raised_hands for this test student
    await pool.query(
      `DELETE FROM raised_hands WHERE student_id = $1 AND section_id = $2`,
      [studentId, sectionId]
    )

    // Record initial event count & initial balance
    const initEventCountRes = await pool.query(`SELECT COUNT(*)::int AS count FROM events`)
    const initialEventCount = initEventCountRes.rows[0].count

    const initBalRes = await pool.query(
      `SELECT COALESCE(balance, 0) AS balance FROM student_balances WHERE student_id = $1 AND section_id = $2`,
      [studentId, sectionId]
    )
    const initialBalance = initBalRes.rowCount > 0 ? initBalRes.rows[0].balance : 0

    // Test 1: Successful Raise Hand
    console.log(`Test 1: Successful Raise Hand`)
    const res1 = await fetch(`${baseUrl}/api/sections/${sectionId}/participation/raise`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        studentId,
      }),
    })
    const body1 = await res1.json()

    console.log(`Status Code: ${res1.status}`)
    console.log(`Response Body:`, JSON.stringify(body1, null, 2))

    if (res1.status !== 201) throw new Error(`Expected 201 Created, got ${res1.status}`)
    if (!body1.request || !body1.request.id || !body1.request.raisedAt) {
      throw new Error('Response missing request object with id and raisedAt timestamp')
    }
    if (body1.request.sectionId !== sectionId || body1.request.studentId !== studentId) {
      throw new Error('Response sectionId or studentId mismatch')
    }

    // Assert NO events created and student_balances NOT modified
    const postEventCountRes = await pool.query(`SELECT COUNT(*)::int AS count FROM events`)
    if (postEventCountRes.rows[0].count !== initialEventCount) {
      throw new Error('FAIL: An event row was created in events table! Raised hands must not create events.')
    }

    const postBalRes = await pool.query(
      `SELECT COALESCE(balance, 0) AS balance FROM student_balances WHERE student_id = $1 AND section_id = $2`,
      [studentId, sectionId]
    )
    if (postBalRes.rows[0].balance !== initialBalance) {
      throw new Error('FAIL: student_balances balance was modified! Raised hands must not alter balances.')
    }

    console.log('✅ Test 1 PASSED: Raised hand created successfully without altering events or balances.\n')

    // Test 2: Duplicate Active Raise Request
    console.log(`Test 2: Duplicate Active Raised Hand Attempt`)
    const res2 = await fetch(`${baseUrl}/api/sections/${sectionId}/participation/raise`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        studentId,
      }),
    })
    const body2 = await res2.json()

    console.log(`Status Code: ${res2.status}`)
    console.log(`Response Body:`, JSON.stringify(body2, null, 2))

    if (res2.status !== 400) throw new Error(`Expected 400 Bad Request, got ${res2.status}`)
    if (body2.error !== 'Student already has an active raised hand in this section') {
      throw new Error('Expected duplicate active raised hand error')
    }
    console.log('✅ Test 2 PASSED: Duplicate active raised hand correctly prevented.\n')

    // Test 3: Invalid Enrollment (Unenrolled Student)
    const dummyUserRes = await pool.query(
      `INSERT INTO users (email, name, role) VALUES ($1, $2, $3) RETURNING id`,
      [`unenrolled_rh_${Date.now()}@smarttoken.edu`, 'Unenrolled Student', 'STUDENT']
    )
    const dummyStudentRes = await pool.query(
      `INSERT INTO students (user_id, student_id_number, name, email) VALUES ($1, $2, $3, $4) RETURNING id`,
      [dummyUserRes.rows[0].id, `UNENROLLED-RH-${Date.now()}`, 'Unenrolled Student', `unenrolled_rh_${Date.now()}@smarttoken.edu`]
    )
    const unenrolledStudentId = dummyStudentRes.rows[0].id

    console.log(`Test 3: Invalid Enrollment (Unenrolled Student)`)
    const res3 = await fetch(`${baseUrl}/api/sections/${sectionId}/participation/raise`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        studentId: unenrolledStudentId,
      }),
    })
    const body3 = await res3.json()

    console.log(`Status Code: ${res3.status}`)
    console.log(`Response Body:`, JSON.stringify(body3, null, 2))

    if (res3.status !== 400) throw new Error(`Expected 400 Bad Request, got ${res3.status}`)
    if (body3.error !== 'Student is not enrolled in this section') throw new Error('Expected enrollment error message')
    console.log('✅ Test 3 PASSED: Invalid enrollment correctly rejected.\n')

    // Test 4: Invalid UUID Formats
    console.log(`Test 4: Invalid UUID Format`)
    const res4 = await fetch(`${baseUrl}/api/sections/invalid-uuid/participation/raise`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        studentId: 'bad-student-uuid',
      }),
    })
    const body4 = await res4.json()

    console.log(`Status Code: ${res4.status}`)
    console.log(`Response Body:`, JSON.stringify(body4, null, 2))

    if (res4.status !== 400) throw new Error(`Expected 400 Bad Request, got ${res4.status}`)
    console.log('✅ Test 4 PASSED: Invalid UUID format correctly rejected.\n')

    console.log('🎉 ALL RAISED-HAND API TESTS PASSED SUCCESSFULLY!')
  } finally {
    if (server) {
      server.close()
    }
    await pool.end()
  }
}

runRaisedHandApiTests().catch((err) => {
  console.error('❌ Raised Hand API Test Failed:', err)
  process.exit(1)
})
