import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import pool from './db.js'

async function runAssignmentApiTests() {
  console.log('--- Starting API Tests for Assignment Workflow ---\n')

  const baseUrl = 'http://localhost:3001'
  let facultyToken, studentToken, sectionId, studentId, studentUserId, facultyUserId
  let createdAssignmentId, submissionId

  try {
    // 1. Get faculty and student logins
    const facLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'faculty@example.com', password: 'FacultyPass123!' }),
    })
    if (facLogin.status !== 200) throw new Error('Faculty login failed')
    const facData = await facLogin.json()
    facultyToken = facData.token

    const studLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'student@example.com', password: 'StudentPass123!' }),
    })
    if (studLogin.status !== 200) throw new Error('Student login failed')
    const studData = await studLogin.json()
    studentToken = studData.token

    // Fetch section and student
    const secRes = await pool.query(`SELECT id FROM sections LIMIT 1`)
    sectionId = secRes.rows[0].id

    const studRes = await pool.query(
      `SELECT s.id, s.user_id FROM students s JOIN users u ON u.id = s.user_id WHERE u.email = 'student@example.com'`
    )
    studentId = studRes.rows[0].id
    studentUserId = studRes.rows[0].user_id

    // Ensure student is enrolled
    await pool.query(
      `INSERT INTO enrollments (student_id, section_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [studentId, sectionId]
    )

    // Ensure faculty is assigned
    const facUserRes = await pool.query(`SELECT id FROM users WHERE email = 'faculty@example.com'`)
    facultyUserId = facUserRes.rows[0].id
    await pool.query(
      `INSERT INTO section_faculty (faculty_id, section_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [facultyUserId, sectionId]
    )

    console.log('✅ Auth and section setup verified.')

    // Test 1: Faculty Creates Assignment
    console.log('\nTest 1: Faculty creates an assignment with metadata and file')
    const formData = new FormData()
    formData.append('title', 'Unit 1: Data Structures Lab')
    formData.append('maxTokens', '8')
    formData.append('extraInfo', 'Check time complexity of tree traversal. Max 8 tokens.')
    const assignmentBlob = new Blob(['Problem 1: Implement an AVL tree balance check function.'], { type: 'text/plain' })
    formData.append('file', assignmentBlob, 'lab1_questions.txt')

    const createRes = await fetch(`${baseUrl}/api/sections/${sectionId}/assignments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${facultyToken}` },
      body: formData,
    })

    const createBody = await createRes.json()
    console.log('Create Status:', createRes.status)
    if (createRes.status !== 201) throw new Error(`Expected 201, got ${createRes.status}: ${JSON.stringify(createBody)}`)
    if (!createBody.assignment || createBody.assignment.title !== 'Unit 1: Data Structures Lab') {
      throw new Error('Assignment data does not match')
    }
    createdAssignmentId = createBody.assignment.id
    console.log('✅ Created assignment ID:', createdAssignmentId)

    // Test 2: List Section Assignments
    console.log('\nTest 2: List Section Assignments')
    const listRes = await fetch(`${baseUrl}/api/sections/${sectionId}/assignments`, {
      headers: { Authorization: `Bearer ${facultyToken}` },
    })
    const listBody = await listRes.json()
    console.log('List Status:', listRes.status, 'Total items:', listBody.assignments?.length)
    if (listRes.status !== 200 || !Array.isArray(listBody.assignments)) {
      throw new Error('Failed to list assignments')
    }
    const found = listBody.assignments.find((a) => a.id === createdAssignmentId)
    if (!found) throw new Error('Created assignment not found in list')
    console.log('Found assignment stats:', {
      totalSubmissions: found.totalSubmissions,
      pendingSubmissions: found.pendingSubmissions,
      approvedSubmissions: found.approvedSubmissions,
    })
    console.log('✅ List assignments verified.')

    // Test 3: Get Single Assignment Detail
    console.log('\nTest 3: Get Single Assignment Detail')
    const detailRes = await fetch(`${baseUrl}/api/sections/${sectionId}/assignments/${createdAssignmentId}`, {
      headers: { Authorization: `Bearer ${facultyToken}` },
    })
    const detailBody = await detailRes.json()
    if (detailRes.status !== 200 || detailBody.assignment.id !== createdAssignmentId) {
      throw new Error('Failed to fetch assignment detail')
    }
    console.log('✅ Assignment detail verified:', detailBody.assignment.title)

    // Test 4: Student Submits Assignment Answer
    console.log('\nTest 4: Student submits answer file')
    const subFormData = new FormData()
    const studentAnswerBlob = new Blob([
      'Student Solution: AVL tree balance factor is calculated as height(left) - height(right). Here is the code.'
    ], { type: 'text/plain' })
    subFormData.append('file', studentAnswerBlob, 'solution_student1.txt')

    const subRes = await fetch(`${baseUrl}/api/sections/${sectionId}/assignments/${createdAssignmentId}/submissions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentToken}` },
      body: subFormData,
    })
    const subBody = await subRes.json()
    console.log('Submit Status:', subRes.status)
    if (subRes.status !== 201) throw new Error(`Expected 201, got ${subRes.status}: ${JSON.stringify(subBody)}`)
    submissionId = subBody.submission.id
    console.log('✅ Student submitted answer, submission ID:', submissionId)

    // Test 5: Student checks own submission
    console.log('\nTest 5: Student fetches own submission')
    const mySubRes = await fetch(`${baseUrl}/api/sections/${sectionId}/assignments/${createdAssignmentId}/my-submission`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    })
    const mySubBody = await mySubRes.json()
    if (mySubRes.status !== 200 || !mySubBody.submission) {
      throw new Error('Failed to get my submission')
    }
    console.log('My submission status:', mySubBody.submission.status, 'fileName:', mySubBody.submission.fileName)
    console.log('✅ My submission verified.')

    // Test 6: Faculty lists submissions
    console.log('\nTest 6: Faculty lists submissions for assignment')
    const facSubsRes = await fetch(`${baseUrl}/api/sections/${sectionId}/assignments/${createdAssignmentId}/submissions`, {
      headers: { Authorization: `Bearer ${facultyToken}` },
    })
    const facSubsBody = await facSubsRes.json()
    if (facSubsRes.status !== 200 || !Array.isArray(facSubsBody.submissions)) {
      throw new Error('Failed to get assignment submissions')
    }
    const mySubFromFacultyView = facSubsBody.submissions.find((s) => s.id === submissionId)
    if (!mySubFromFacultyView) throw new Error('Submission not found in faculty list')
    console.log('Submission in faculty list:', {
      studentName: mySubFromFacultyView.studentName,
      status: mySubFromFacultyView.status,
      evaluationStatus: mySubFromFacultyView.evaluationStatus,
    })
    console.log('✅ Faculty submissions list verified.')

    // Wait a brief moment or simulate AI evaluation if not completed
    console.log('\nTest 7: Faculty approves tokens (Decision)')
    // Get student balance before decision
    const balBeforeRes = await pool.query(
      `SELECT COALESCE(balance, 0) AS balance FROM student_balances WHERE student_id = $1 AND section_id = $2`,
      [studentId, sectionId]
    )
    const balBefore = balBeforeRes.rows[0]?.balance || 0

    const decisionRes = await fetch(
      `${baseUrl}/api/sections/${sectionId}/assignments/${createdAssignmentId}/submissions/${submissionId}/decision`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${facultyToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ finalTokens: 7 }),
      }
    )
    const decisionBody = await decisionRes.json()
    console.log('Decision Status:', decisionRes.status)
    if (decisionRes.status !== 200) throw new Error(`Expected 200, got ${decisionRes.status}: ${JSON.stringify(decisionBody)}`)
    if (decisionBody.submission.status !== 'APPROVED' || decisionBody.submission.approved_tokens !== 7) {
      throw new Error(`Expected status APPROVED and approved_tokens 7, got ${JSON.stringify(decisionBody.submission)}`)
    }

    // Verify balance increased
    const balAfterRes = await pool.query(
      `SELECT COALESCE(balance, 0) AS balance FROM student_balances WHERE student_id = $1 AND section_id = $2`,
      [studentId, sectionId]
    )
    const balAfter = balAfterRes.rows[0]?.balance || 0
    console.log(`Balance before: ${balBefore}, after: ${balAfter}`)
    if (balAfter !== balBefore + 7) {
      throw new Error(`Expected balance to increase by 7, was ${balBefore} -> ${balAfter}`)
    }

    // Verify event logged
    const eventRes = await pool.query(`SELECT * FROM events WHERE id = $1`, [decisionBody.submission.finalized_event_id])
    if (eventRes.rowCount === 0 || eventRes.rows[0].token_change !== 7) {
      throw new Error('Event was not correctly recorded in ledger')
    }
    console.log('✅ Event successfully recorded in ledger:', eventRes.rows[0].description)

    console.log('\n🎉 ALL ASSIGNMENT API TESTS PASSED SUCCESSFULLY!')
  } finally {
    // Cleanup test artifacts from DB
    if (createdAssignmentId) {
      console.log('\nCleaning up test assignment data...')
      await pool.query(`DELETE FROM assignment_submissions WHERE assignment_id = $1`, [createdAssignmentId])
      await pool.query(`DELETE FROM assignments WHERE id = $1`, [createdAssignmentId])
      console.log('Cleanup complete.')
    }
    await pool.end()
  }
}

runAssignmentApiTests().catch((err) => {
  console.error('❌ Test failed:', err)
  process.exit(1)
})
