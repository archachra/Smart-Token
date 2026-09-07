process.env.NODE_ENV = 'test'

import pool from './db.js'
import app from './index.js'

async function runApiTests() {
  console.log('--- Starting API Tests for GET /api/sections/:sectionId/students ---\n')

  let server
  const PORT = 3099

  try {
    // Start temporary test server
    await new Promise((resolve) => {
      server = app.listen(PORT, resolve)
    })

    const baseUrl = `http://localhost:${PORT}`

    // 1. Fetch valid sectionId from DB
    const sectionRes = await pool.query(`SELECT id FROM sections LIMIT 1`)
    if (sectionRes.rowCount === 0) {
      throw new Error('No section found in database. Run db/verify.js first!')
    }
    const validSectionId = sectionRes.rows[0].id

    // Test Case 1: Valid Section ID
    console.log(`Test 1: GET /api/sections/${validSectionId}/students (Valid Section)`)
    const res1 = await fetch(`${baseUrl}/api/sections/${validSectionId}/students`)
    const body1 = await res1.json()

    console.log(`Status Code: ${res1.status}`)
    console.log(`Response Body:`, JSON.stringify(body1, null, 2))

    if (res1.status !== 200) throw new Error(`Expected 200 OK, got ${res1.status}`)
    if (!Array.isArray(body1.students)) throw new Error('Expected students array in response')
    if (body1.students.length > 0) {
      const s = body1.students[0]
      if (!s.id || !s.name || !s.studentIdNumber || s.balance === undefined) {
        throw new Error('Student item missing required fields (id, name, studentIdNumber, balance)')
      }
    }
    console.log('✅ Test 1 PASSED: Valid section roster returned correctly.\n')

    // Test Case 2: Non-Existent Section (Valid UUID)
    const nonExistentUuid = '00000000-0000-0000-0000-000000000000'
    console.log(`Test 2: GET /api/sections/${nonExistentUuid}/students (Non-Existent Section)`)
    const res2 = await fetch(`${baseUrl}/api/sections/${nonExistentUuid}/students`)
    const body2 = await res2.json()

    console.log(`Status Code: ${res2.status}`)
    console.log(`Response Body:`, JSON.stringify(body2, null, 2))

    if (res2.status !== 404) throw new Error(`Expected 404 Not Found, got ${res2.status}`)
    if (body2.error !== 'Section not found') throw new Error('Expected "Section not found" error')
    console.log('✅ Test 2 PASSED: 404 error returned for non-existent section.\n')

    // Test Case 3: Invalid UUID Format
    const invalidId = 'not-a-valid-uuid'
    console.log(`Test 3: GET /api/sections/${invalidId}/students (Invalid Section ID Format)`)
    const res3 = await fetch(`${baseUrl}/api/sections/${invalidId}/students`)
    const body3 = await res3.json()

    console.log(`Status Code: ${res3.status}`)
    console.log(`Response Body:`, JSON.stringify(body3, null, 2))

    if (res3.status !== 400) throw new Error(`Expected 400 Bad Request, got ${res3.status}`)
    if (!body3.error.includes('Invalid section ID format')) throw new Error('Expected invalid UUID error')
    console.log('✅ Test 3 PASSED: 400 error returned for invalid UUID format.\n')

    console.log('🎉 ALL API TESTS PASSED SUCCESSFULLY!')
  } finally {
    if (server) {
      server.close()
    }
    await pool.end()
  }
}

runApiTests().catch((err) => {
  console.error('❌ API Test Failed:', err)
  process.exit(1)
})
