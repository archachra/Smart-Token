process.env.NODE_ENV = 'test'

import crypto from 'crypto'
import pool from './db.js'
import app from './index.js'

function generateUuid() {
  return crypto.randomUUID()
}

async function runDeleteRaisedHandApiTests() {
  console.log('--- Starting Focused API Tests for DELETE /api/sections/:sectionId/participation/raised/:requestId ---\n')

  let server
  const PORT = 3094

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

    // Fetch valid IDs
    const sectionId = sectionRes.rows[0].id;
    const studentId = studentRes.rows[0].id;
    // Unauthenticated request (should be 401)
    const unauthRes = await fetch(`${baseUrl}/api/sections/${sectionId}/participation/raised/${generateUuid()}`, {
      method: 'DELETE'
    });
    if (unauthRes.status !== 401) throw new Error(`Expected 401 for unauthenticated delete, got ${unauthRes.status}`);
    // Login to obtain JWT for Faculty
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'faculty@example.com', password: 'FacultyPass123!' })
    });
    if (loginRes.status !== 200) throw new Error('Login failed for faculty');
    const { token } = await loginRes.json();
    const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    // Ensure clean state: delete any existing raised_hands for test student
    await pool.query(`DELETE FROM raised_hands WHERE student_id = $1 AND section_id = $2`, [studentId, sectionId])

    // Insert a raised-hand request to test deletion
    const insertRes = await pool.query(
      `INSERT INTO raised_hands (section_id, student_id) VALUES ($1, $2) RETURNING id`,
      [sectionId, studentId]
    )
    const requestId = insertRes.rows[0].id

    // Record initial event count & balance
    const initEventCountRes = await pool.query(`SELECT COUNT(*)::int AS count FROM events`)
    const initialEventCount = initEventCountRes.rows[0].count

    const initBalRes = await pool.query(
      `SELECT COALESCE(balance, 0) AS balance FROM student_balances WHERE student_id = $1 AND section_id = $2`,
      [studentId, sectionId]
    )
    const initialBalance = initBalRes.rowCount > 0 ? initBalRes.rows[0].balance : 0

    // Test Case 1: Successful Removal
    console.log(`Test 1: DELETE /api/sections/${sectionId}/participation/raised/${requestId} (Successful Removal)`)
    const res1 = await fetch(`${baseUrl}/api/sections/${sectionId}/participation/raised/${requestId}`, {
      method: 'DELETE',
      headers: authHeaders,
    })
    const body1 = await res1.json()

    console.log(`Status Code: ${res1.status}`)
    console.log(`Response Body:`, JSON.stringify(body1, null, 2))

    if (res1.status !== 200) throw new Error(`Expected 200 OK, got ${res1.status}`)
    if (body1.message !== 'Raised-hand request removed successfully') {
      throw new Error('Expected success confirmation message')
    }
    if (body1.removedRequest.id !== requestId) {
      throw new Error('Removed request ID mismatch')
    }

    // Verify active request is gone from DB (resolved_at IS NOT NULL)
    const checkDbRes = await pool.query(`SELECT 1 FROM raised_hands WHERE id = $1 AND resolved_at IS NULL`, [requestId])
    if (checkDbRes.rowCount > 0) throw new Error('FAIL: Active raised-hand request still exists in database!')

    // Assert NO events created and student_balances NOT modified
    const postEventCountRes = await pool.query(`SELECT COUNT(*)::int AS count FROM events`)
    if (postEventCountRes.rows[0].count !== initialEventCount) {
      throw new Error('FAIL: An event row was created! Deleting raised hands must not create events.')
    }

    const postBalRes = await pool.query(
      `SELECT COALESCE(balance, 0) AS balance FROM student_balances WHERE student_id = $1 AND section_id = $2`,
      [studentId, sectionId]
    )
    if (postBalRes.rows[0].balance !== initialBalance) {
      throw new Error('FAIL: student_balances balance was modified! Deleting raised hands must not alter balances.')
    }

    console.log('✅ Test 1 PASSED: Raised-hand request removed successfully without altering events or balances.\n')

    // Test Case 2: Non-Existent Request ID
    const nonExistentRequestId = generateUuid()
    console.log(`Test 2: Non-Existent Request ID (${nonExistentRequestId})`)
    const res2 = await fetch(`${baseUrl}/api/sections/${sectionId}/participation/raised/${nonExistentRequestId}`, {
      method: 'DELETE',
      headers: authHeaders,
    })
    const body2 = await res2.json()

    console.log(`Status Code: ${res2.status}`)
    console.log(`Response Body:`, JSON.stringify(body2, null, 2))

    if (res2.status !== 404) throw new Error(`Expected 404 Not Found, got ${res2.status}`)
    if (body2.error !== 'Raised-hand request not found in this section') {
      throw new Error('Expected 404 error message')
    }
    console.log('✅ Test 2 PASSED: Non-existent request ID correctly returned 404.\n')

    // Test Case 3: Request Belonging to Wrong Section ID
    const wrongSectionId = generateUuid()
    // Ensure clean state: delete any existing raised_hands for test student
    await pool.query(`DELETE FROM raised_hands WHERE student_id = $1 AND section_id = $2`, [studentId, sectionId])
    // Re-insert raised hand under valid sectionId
    const reInsertRes = await pool.query(
      `INSERT INTO raised_hands (section_id, student_id) VALUES ($1, $2) RETURNING id`,
      [sectionId, studentId]
    )
    const validRequestId = reInsertRes.rows[0].id

    console.log(`Test 3: Wrong Section ID (${wrongSectionId})`)
    const res3 = await fetch(`${baseUrl}/api/sections/${wrongSectionId}/participation/raised/${validRequestId}`, {
      method: 'DELETE',
      headers: authHeaders,
    })
    const body3 = await res3.json()

    console.log(`Status Code: ${res3.status}`)
    console.log(`Response Body:`, JSON.stringify(body3, null, 2))

    if (res3.status !== 404) throw new Error(`Expected 404 Not Found, got ${res3.status}`)
    if (body3.error !== 'Raised-hand request not found in this section') {
      throw new Error('Expected 404 error message for wrong section')
    }
    console.log('✅ Test 3 PASSED: Deleting request from wrong section correctly returned 404.\n')

    // Test Case 4: Invalid UUID Format
    console.log(`Test 4: Invalid UUID Format`)
    const res4 = await fetch(`${baseUrl}/api/sections/invalid-section-uuid/participation/raised/invalid-request-uuid`, {
      method: 'DELETE',
      headers: authHeaders,
    })
    const body4 = await res4.json()

    console.log(`Status Code: ${res4.status}`)
    console.log(`Response Body:`, JSON.stringify(body4, null, 2))

    if (res4.status !== 400) throw new Error(`Expected 400 Bad Request, got ${res4.status}`)
    console.log('✅ Test 4 PASSED: Invalid UUID format correctly rejected.\n')
  } finally {
    if (server) {
      server.close()
    }
    await pool.end()
  }
}

runDeleteRaisedHandApiTests().catch((err) => {
  console.error('❌ Delete Raised Hand API Test Failed:', err)
  process.exit(1)
})
