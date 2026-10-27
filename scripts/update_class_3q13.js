import '../server/env.js';
import pool from '../server/db.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const SECTION_ID = '043f0728-c357-4e72-b6ce-62823cc064b7';
const DEFAULT_PASSWORD = 'Student@3Q13';

const CLASS_LIST = [
  { name: 'Ashmeen Kaur', rollNumber: '1024170045', email: 'ashmeen@smarttoken.edu' },
  { name: 'Rupinder Kaur', rollNumber: '1024170046', email: 'rupinder@smarttoken.edu' },
  { name: 'Prabhleen Kaur Saini', rollNumber: '1024170047', email: 'prabhleen@smarttoken.edu' },
  { name: 'Surya Pratap Singh', rollNumber: '1024170062', email: 'surya@smarttoken.edu' },
  { name: 'Gagandeep Kaur', rollNumber: '1024170063', email: 'gagandeep@smarttoken.edu' },
  { name: 'Kunal Gupta', rollNumber: '1024170064', email: 'kunal@smarttoken.edu', existingMatch: ['kunal'] },
  { name: 'Khushi Verma', rollNumber: '1024170065', email: 'khushi@smarttoken.edu' },
  { name: 'Puneet Singh', rollNumber: '1024170066', email: 'puneet@smarttoken.edu' },
  { name: 'Rahul Singh', rollNumber: '1024170067', email: 'rahul@smarttoken.edu' },
  { name: 'Coral Singh', rollNumber: '1024170068', email: 'coral@smarttoken.edu' },
  { name: 'Gourav', rollNumber: '1024170070', email: 'gourav@smarttoken.edu' },
  { name: 'Charvi', rollNumber: '1024170071', email: 'charvi@smarttoken.edu' },
  { name: 'Piyush Sharan', rollNumber: '1024170072', email: 'piyush@smarttoken.edu', existingMatch: ['piyush'] },
  { name: 'Arnav Chachra', rollNumber: '1024170073', email: 'arnav@smarttoken.edu', existingMatch: ['arnav', 'student@smarttoken.edu'] },
  { name: 'Arjan Singh Sawhney', rollNumber: '1024170074', email: 'arjan@smarttoken.edu' },
  { name: 'Harsith Mahay', rollNumber: '1024170075', email: 'harsith@smarttoken.edu' },
  { name: 'Nachiket Singla', rollNumber: '1024170077', email: 'nachiket@smarttoken.edu' },
  { name: 'Kunwar Shauryaveer Singh Bhati', rollNumber: '1024170078', email: 'shaurya@smarttoken.edu', existingMatch: ['shaurya'] },
  { name: 'Himanshi Gupta', rollNumber: '1024170079', email: 'himanshi@smarttoken.edu' },
  { name: 'Krrish Dhaneja', rollNumber: '1024170080', email: 'krrish@smarttoken.edu' },
  { name: 'Dishita Sharma', rollNumber: '1024170081', email: 'dishita@smarttoken.edu' },
  { name: 'Navdeep Jain', rollNumber: '1024170082', email: 'navdeep@smarttoken.edu' },
  { name: 'Dhruv Chhabra', rollNumber: '1024170085', email: 'dhruv@smarttoken.edu' },
  { name: 'Parth Singh', rollNumber: '1024170086', email: 'parth@smarttoken.edu' },
  { name: 'Kanishak', rollNumber: '1024170088', email: 'kanishak@smarttoken.edu' },
  { name: 'Jaskaran Singh', rollNumber: '1024170089', email: 'jaskaran@smarttoken.edu' },
  { name: 'Jasroop Singh Sachdeva', rollNumber: '1024170090', email: 'jasroop@smarttoken.edu' },
  { name: 'Aditya Gupta', rollNumber: '1024170204', email: 'aditya@smarttoken.edu', existingMatch: ['aditya'] },
  { name: 'Rhythmpreet Singh', rollNumber: '1024170301', email: 'rhythm@smarttoken.edu', existingMatch: ['rhythm'] },
  { name: 'Kashish Kannojia', rollNumber: '1024170342', email: 'kashish@smarttoken.edu' },
];

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Update section name to 3Q13
    console.log('1. Updating section name to 3Q13...');
    await client.query(
      `UPDATE sections SET section_name = '3Q13', updated_at = NOW() WHERE id = $1`,
      [SECTION_ID]
    );

    // 2. Remove dummy test student (student@example.com / STU123456)
    console.log('2. Removing dummy test student (student@example.com)...');
    const dummyUserRes = await client.query(
      `SELECT id FROM users WHERE email = 'student@example.com'`
    );
    if (dummyUserRes.rows.length > 0) {
      const dummyUserId = dummyUserRes.rows[0].id;
      const dummyStudentRes = await client.query(
        `SELECT id FROM students WHERE user_id = $1`,
        [dummyUserId]
      );
      if (dummyStudentRes.rows.length > 0) {
        const dummyStudentId = dummyStudentRes.rows[0].id;

        // Break self-referential / cross-referential foreign keys
        await client.query(
          `UPDATE events SET correction_of = NULL 
           WHERE student_id = $1 OR correction_of IN (SELECT id FROM events WHERE student_id = $1)`,
          [dummyStudentId]
        );
        await client.query(
          `UPDATE recording_evaluations SET finalized_event_id = NULL 
           WHERE recording_session_id IN (SELECT id FROM recording_sessions WHERE student_id = $1)
              OR finalized_event_id IN (SELECT id FROM events WHERE student_id = $1)`,
          [dummyStudentId]
        );
        await client.query(
          `DELETE FROM recording_evaluations 
           WHERE recording_session_id IN (SELECT id FROM recording_sessions WHERE student_id = $1)`,
          [dummyStudentId]
        );
        await client.query(
          `UPDATE assignment_submissions SET finalized_event_id = NULL WHERE student_id = $1`,
          [dummyStudentId]
        );
        await client.query(`DELETE FROM assignment_submissions WHERE student_id = $1`, [dummyStudentId]);
        await client.query(`DELETE FROM recording_sessions WHERE student_id = $1`, [dummyStudentId]);
        await client.query(`DELETE FROM raised_hands WHERE student_id = $1`, [dummyStudentId]);
        await client.query(`DELETE FROM events WHERE student_id = $1`, [dummyStudentId]);
        await client.query(`DELETE FROM enrollments WHERE student_id = $1`, [dummyStudentId]);
        await client.query(`DELETE FROM student_balances WHERE student_id = $1`, [dummyStudentId]);
        await client.query(`DELETE FROM students WHERE id = $1`, [dummyStudentId]);
      }
      await client.query(`DELETE FROM users WHERE id = $1`, [dummyUserId]);
      console.log('   Dummy student deleted successfully.');
    } else {
      console.log('   Dummy student not found, skipping delete.');
    }

    // 3. Process each student from CLASS_LIST
    console.log('3. Updating & inserting 30 students in class 3Q13...');
    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

    // Fetch existing students
    const existingStudentsRes = await client.query(
      `SELECT s.id as student_id, s.user_id, s.name, s.student_id_number, u.email
       FROM students s
       JOIN users u ON s.user_id = u.id`
    );
    const existingList = existingStudentsRes.rows;

    for (const item of CLASS_LIST) {
      // Find if student already exists in DB
      let matchedExisting = null;
      if (item.existingMatch) {
        matchedExisting = existingList.find((es) => {
          const esName = es.name.toLowerCase();
          const esEmail = es.email.toLowerCase();
          return item.existingMatch.some(
            (m) => esName.includes(m.toLowerCase()) || esEmail.includes(m.toLowerCase())
          );
        });
      }

      if (matchedExisting) {
        // Update existing student and user
        console.log(`   Updating existing student: ${matchedExisting.name} -> ${item.name} (${item.rollNumber})`);
        await client.query(
          `UPDATE users 
           SET name = $1, email = $2, password_hash = $3, updated_at = NOW() 
           WHERE id = $4`,
          [item.name, item.email, passwordHash, matchedExisting.user_id]
        );
        await client.query(
          `UPDATE students 
           SET name = $1, student_id_number = $2, email = $3, updated_at = NOW() 
           WHERE id = $4`,
          [item.name, item.rollNumber, item.email, matchedExisting.student_id]
        );

        // Ensure enrollment
        await client.query(
          `INSERT INTO enrollments (id, student_id, section_id, attendance_status, enrolled_at)
           VALUES ($1, $2, $3, 'PRESENT', NOW())
           ON CONFLICT DO NOTHING`,
          [crypto.randomUUID(), matchedExisting.student_id, SECTION_ID]
        );

        // Ensure balance record
        await client.query(
          `INSERT INTO student_balances (student_id, section_id, balance, updated_at)
           VALUES ($1, $2, 0, NOW())
           ON CONFLICT DO NOTHING`,
          [matchedExisting.student_id, SECTION_ID]
        );
      } else {
        // Create new user and student
        console.log(`   Inserting new student: ${item.name} (${item.rollNumber})`);
        const userId = crypto.randomUUID();
        const studentId = crypto.randomUUID();

        await client.query(
          `INSERT INTO users (id, email, name, role, password_hash, created_at, updated_at)
           VALUES ($1, $2, $3, 'STUDENT', $4, NOW(), NOW())`,
          [userId, item.email, item.name, passwordHash]
        );

        await client.query(
          `INSERT INTO students (id, user_id, student_id_number, name, email, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
          [studentId, userId, item.rollNumber, item.name, item.email]
        );

        await client.query(
          `INSERT INTO enrollments (id, student_id, section_id, attendance_status, enrolled_at)
           VALUES ($1, $2, $3, 'PRESENT', NOW())`,
          [crypto.randomUUID(), studentId, SECTION_ID]
        );

        await client.query(
          `INSERT INTO student_balances (student_id, section_id, balance, updated_at)
           VALUES ($1, $2, 0, NOW())`,
          [studentId, SECTION_ID]
        );
      }
    }

    await client.query('COMMIT');
    console.log('✅ Class 3Q13 roster migration complete!');

    // Verification queries
    const secRes = await pool.query(`SELECT section_name FROM sections WHERE id = $1`, [SECTION_ID]);
    console.log('Section Name:', secRes.rows[0].section_name);

    const countRes = await pool.query(
      `SELECT count(*) FROM enrollments WHERE section_id = $1`,
      [SECTION_ID]
    );
    console.log('Total Enrolled Students in 3Q13:', countRes.rows[0].count);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    throw err;
  } finally {
    client.release();
    process.exit(0);
  }
}

run();
