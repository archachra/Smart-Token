process.env.NODE_ENV = 'test'

import pool from './db.js'
import app from './index.js'

async function runGetRaisedHandsApiTests() {
  console.log('--- Starting Focused API Tests for GET /api/sections/:sectionId/participation/raised ---\n')

  let server
  const PORT = 3095

  try {
    await new Promise((resolve) => {
      server = app.listen(PORT, resolve)
    })

    const baseUrl = `http://localhost:${PORT}`

    // Fetch valid seed sectionId from DB
    const sectionRes = await pool.query(`SELECT id FROM sections LIMIT 1`)
    if (sectionRes.rowCount === 0) {
      throw new Error('Seed data missing. Run db/verify.js first!')
    }
    const sectionId = sectionRes.rows[0].id

    // Test Case 1: Empty Queue
    // Ensure clean state: delete any existing raised_hands for this section
    await pool.query(`DELETE FROM raised_hands WHERE section_id = $1`, [sectionId])

    console.log(`Test 1: Empty Queue (No active raised hands)`)
    const res1 = await fetch(`${baseUrl}/api/sections/${sectionId}/participation/raised`)
    const body1 = await res1.json()

    console.log(`Status Code: ${res1.status}`)
    console.log(`Response Body:`, JSON.stringify(body1, null, 2))

    if (res1.status !== 200) throw new Error(`Expected 200 OK, got ${res1.status}`)
    if (!Array.isArray(body1.requests) || body1.requests.length !== 0) {
      throw new Error('Expected empty requests array [] when no active raised hands')
    }
    console.log('✅ Test 1 PASSED: Empty queue returned [] correctly.\n')

    // Test Case 2: Successful Retrieval & Chronological Ordering
    // Create 2 students enrolled in section
    const user1 = await pool.query(`INSERT INTO users (email, name, role) VALUES ($1, $2, $3) RETURNING id`, [`st1_${Date.now()}@test.edu`, 'First Student', 'STUDENT'])
    const user2 = await pool.query(`INSERT INTO users (email, name, role) VALUES ($1, $2, $3) RETURNING id`, [`st2_${Date.now()}@test.edu`, 'Second Student', 'STUDENT'])

    const stud1 = await pool.query(`INSERT INTO students (user_id, student_id_number, name, email) VALUES ($1, $2, $3, $4) RETURNING id`, [user1.rows[0].id, `ST1-${Date.now()}`, 'First Student', `st1_${Date.now()}@test.edu`])
    const stud2 = await pool.query(`INSERT INTO students (user_id, student_id_number, name, email) VALUES ($1, $2, $3, $4) RETURNING id`, [user2.rows[0].id, `ST2-${Date.now()}`, 'Second Student', `st2_${Date.now()}@test.edu`])

    const s1Id = stud1.rows[0].id
    const s2Id = stud2.rows[0].id

    await pool.query(`INSERT INTO enrollments (student_id, section_id) VALUES ($1, $2), ($3, $4)`, [s1Id, sectionId, s2Id, sectionId])

    // Insert student 1 raised hand (Earlier)
    const earlierTime = new Date(Date.now() - 5000)
    await pool.query(
      `INSERT INTO raised_hands (section_id, student_id, raised_at) VALUES ($1, $2, $3)`,
      [sectionId, s1Id, earlierTime]
    )

    // Insert student 2 raised hand (Later)
    const laterTime = new Date(Date.now())
    await pool.query(
      `INSERT INTO raised_hands (section_id, student_id, raised_at) VALUES ($1, $2, $3)`,
      [sectionId, s2Id, laterTime]
    )

    console.log(`Test 2: Successful Retrieval & Chronological Ordering (raised_at ASC)`)
    const res2 = await fetch(`${baseUrl}/api/sections/${sectionId}/participation/raised`)
    const body2 = await res2.json()

    console.log(`Status Code: ${res2.status}`)
    console.log(`Response Body:`, JSON.stringify(body2, null, 2))

    if (res2.status !== 200) throw new Error(`Expected 200 OK, got ${res2.status}`)
    if (!Array.isArray(body2.requests) || body2.requests.length !== 2) {
      throw new Error(`Expected 2 requests, got ${body2.requests.length}`)
    }

    const firstReq = body2.requests[0]
    const secondReq = body2.requests[1]

    if (firstReq.studentId !== s1Id || secondReq.studentId !== s2Id) {
      throw new Error('FAIL: Chronological ordering by raised_at ASC was not preserved!')
    }

    if (new Date(firstReq.raisedAt).getTime() > new Date(secondReq.raisedAt).getTime()) {
      throw new Error('FAIL: First raised hand timestamp is later than second!')
    }

    if (!firstReq.id || !firstReq.studentId || !firstReq.studentName || !firstReq.studentIdNumber || !firstReq.raisedAt) {
      throw new Error('FAIL: Missing required response fields (id, studentId, studentName, studentIdNumber, raisedAt)')
    }

    console.log('✅ Test 2 PASSED: Active raised hands returned in chronological order with full student details.\n')

    // Test Case 3: Invalid Section UUID Format
    console.log(`Test 3: Invalid Section UUID Format`)
    const res3 = await fetch(`${baseUrl}/api/sections/invalid-section-uuid/participation/raised`)
    const body3 = await res3.json()

    console.log(`Status Code: ${res3.status}`)
    console.log(`Response Body:`, JSON.stringify(body3, null, 2))

    if (res3.status !== 400) throw new Error(`Expected 400 Bad Request, got ${res3.status}`)
    if (body3.error !== 'Invalid section ID format. Expected valid UUID.') throw new Error('Expected invalid UUID error message')
    console.log('✅ Test 3 PASSED: Invalid UUID format correctly rejected.\n')

    // Test Case 4: Non-Existent Section ID
    const nonExistentUuid = '00000000-0000-0000-0000-000000000000'
    console.log(`Test 4: Non-Existent Section ID`)
    const res4 = await fetch(`${baseUrl}/api/sections/${nonExistentUuid}/participation/raised`)
    const body4 = await res4.json()

    console.log(`Status Code: ${res4.status}`)
    console.log(`Response Body:`, JSON.stringify(body4, null, 2))

    if (res4.status !== 404) throw new Error(`Expected 404 Not Found, got ${res4.status}`)
    if (body4.error !== 'Section not found') throw new Error('Expected Section not found error message')
    console.log('✅ Test 4 PASSED: Non-existent section correctly returned 404.\n')

    console.log('🎉 ALL GET RAISED-HAND API TESTS PASSED SUCCESSFULLY!')
  } finally {
    if (server) {
      server.close()
    }
    await pool.end()
  }
}

runGetRaisedHandsApiTests().catch((err) => {
  console.error('❌ Get Raised Hands API Test Failed:', err)
  process.exit(1)
})
