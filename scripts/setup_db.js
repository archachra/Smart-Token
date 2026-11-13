import '../server/env.js'
import pool from '../server/db.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import bcrypt from 'bcrypt'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const SECTION_ID = '043f0728-c357-4e72-b6ce-62823cc064b7'
const COURSE_ID = '02401f1b-8931-4c75-be95-43fdcba5b2a3'

const CLASS_3Q13_STUDENTS = [
  { name: 'Ashmeen Kaur', rollNumber: '1024170045', email: 'ashmeen@smarttoken.edu' },
  { name: 'Rupinder Kaur', rollNumber: '1024170046', email: 'rupinder@smarttoken.edu' },
  { name: 'Prabhleen Kaur Saini', rollNumber: '1024170047', email: 'prabhleen@smarttoken.edu' },
  { name: 'Surya Pratap Singh', rollNumber: '1024170062', email: 'surya@smarttoken.edu' },
  { name: 'Gagandeep Kaur', rollNumber: '1024170063', email: 'gagandeep@smarttoken.edu' },
  { name: 'Kunal Gupta', rollNumber: '1024170064', email: 'kunal@smarttoken.edu' },
  { name: 'Khushi Verma', rollNumber: '1024170065', email: 'khushi@smarttoken.edu' },
  { name: 'Puneet Singh', rollNumber: '1024170066', email: 'puneet@smarttoken.edu' },
  { name: 'Rahul Singh', rollNumber: '1024170067', email: 'rahul@smarttoken.edu' },
  { name: 'Coral Singh', rollNumber: '1024170068', email: 'coral@smarttoken.edu' },
  { name: 'Gourav', rollNumber: '1024170070', email: 'gourav@smarttoken.edu' },
  { name: 'Charvi', rollNumber: '1024170071', email: 'charvi@smarttoken.edu' },
  { name: 'Piyush Sharan', rollNumber: '1024170072', email: 'piyush@smarttoken.edu' },
  { name: 'Arnav Chachra', rollNumber: '1024170073', email: 'arnav@smarttoken.edu' },
  { name: 'Arjan Singh Sawhney', rollNumber: '1024170074', email: 'arjan@smarttoken.edu' },
  { name: 'Harsith Mahay', rollNumber: '1024170075', email: 'harsith@smarttoken.edu' },
  { name: 'Nachiket Singla', rollNumber: '1024170077', email: 'nachiket@smarttoken.edu' },
  { name: 'Kunwar Shauryaveer Singh Bhati', rollNumber: '1024170078', email: 'shaurya@smarttoken.edu' },
  { name: 'Himanshi Gupta', rollNumber: '1024170079', email: 'himanshi@smarttoken.edu' },
  { name: 'Krrish Dhaneja', rollNumber: '1024170080', email: 'krrish@smarttoken.edu' },
  { name: 'Dishita Sharma', rollNumber: '1024170081', email: 'dishita@smarttoken.edu' },
  { name: 'Navdeep Jain', rollNumber: '1024170082', email: 'navdeep@smarttoken.edu' },
  { name: 'Dhruv Chhabra', rollNumber: '1024170085', email: 'dhruv@smarttoken.edu' },
  { name: 'Parth Singh', rollNumber: '1024170086', email: 'parth@smarttoken.edu' },
  { name: 'Kanishak', rollNumber: '1024170088', email: 'kanishak@smarttoken.edu' },
  { name: 'Jaskaran Singh', rollNumber: '1024170089', email: 'jaskaran@smarttoken.edu' },
  { name: 'Jasroop Singh Sachdeva', rollNumber: '1024170090', email: 'jasroop@smarttoken.edu' },
  { name: 'Aditya Gupta', rollNumber: '1024170204', email: 'aditya@smarttoken.edu' },
  { name: 'Rhythmpreet Singh', rollNumber: '1024170301', email: 'rhythm@smarttoken.edu' },
  { name: 'Kashish Kannojia', rollNumber: '1024170342', email: 'kashish@smarttoken.edu' },
]

async function setupDatabase() {
  console.log('--- Setting up SmartToken Production Database ---')
  const client = await pool.connect()

  try {
    // 1. Check if tables exist
    const tableRes = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users'"
    )

    if (tableRes.rowCount === 0) {
      console.log('Tables not found. Applying db/schema.sql...')
      const schemaSql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8')
      await client.query(schemaSql)
      console.log('Schema applied successfully.')
    } else {
      console.log('Existing tables detected. Ensuring required columns exist...')
    }

    // Apply incremental schema updates if not already present
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
      ALTER TABLE sections ADD COLUMN IF NOT EXISTS active_topic TEXT;
      ALTER TABLE sections ADD COLUMN IF NOT EXISTS active_extra_info TEXT;
      ALTER TABLE sections ADD COLUMN IF NOT EXISTS active_material_name TEXT;
      ALTER TABLE sections ADD COLUMN IF NOT EXISTS active_material_path TEXT;
      ALTER TABLE sections ADD COLUMN IF NOT EXISTS active_material_text TEXT;
      ALTER TABLE recording_sessions ADD COLUMN IF NOT EXISTS transcript TEXT;
      ALTER TABLE recording_sessions ADD COLUMN IF NOT EXISTS transcription_status TEXT DEFAULT 'PENDING';
      ALTER TABLE recording_sessions ADD COLUMN IF NOT EXISTS transcription_error TEXT;
      ALTER TABLE recording_sessions ADD COLUMN IF NOT EXISTS transcribed_at TIMESTAMPTZ;
      ALTER TABLE recording_sessions ADD COLUMN IF NOT EXISTS audio_url TEXT;
      ALTER TABLE recording_sessions ADD COLUMN IF NOT EXISTS reference_material TEXT;
      ALTER TABLE recording_sessions ALTER COLUMN raised_hand_id DROP NOT NULL;
    `)

    // 2. Ensure Course CS101 exists
    await client.query(
      `INSERT INTO courses (id, code, title, description)
       VALUES ($1, 'CS101', 'Computer Science 101', 'Intro to CS & Data Structures')
       ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, code = EXCLUDED.code`,
      [COURSE_ID]
    )

    // 3. Ensure Default Section 3Q13 exists with exact hardcoded UUID
    await client.query(
      `INSERT INTO sections (id, course_id, section_name, term)
       VALUES ($1, $2, '3Q13', 'Fall 2026')
       ON CONFLICT (id) DO UPDATE SET section_name = '3Q13'`,
      [SECTION_ID, COURSE_ID]
    )
    console.log(`Section 3Q13 (${SECTION_ID}) verified.`)

    // 4. Ensure Admin user exists
    const adminPassHash = await bcrypt.hash('AdminPass123!', 10)
    await client.query(
      `INSERT INTO users (email, name, role, password_hash)
       VALUES ('admin@smarttoken.edu', 'Admin User', 'ADMIN', $1)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'ADMIN'`,
      [adminPassHash]
    )
    console.log('Admin account (admin@smarttoken.edu) verified.')

    // 5. Ensure Faculty user exists and assigned to 3Q13
    const facultyPassHash = await bcrypt.hash('FacultyPass123!', 10)
    const facRes = await client.query(
      `INSERT INTO users (email, name, role, password_hash)
       VALUES ('ssingh1_phd23@thapar.edu', 'Mr Sukhpal Singh', 'FACULTY', $1)
       ON CONFLICT (email) DO UPDATE SET name = 'Mr Sukhpal Singh', role = 'FACULTY', password_hash = EXCLUDED.password_hash
       RETURNING id`,
      [facultyPassHash]
    )
    const facultyId = facRes.rows[0].id

    // Also support faculty@example.com alias
    await client.query(
      `INSERT INTO users (email, name, role, password_hash)
       VALUES ('faculty@example.com', 'Mr Sukhpal Singh', 'FACULTY', $1)
       ON CONFLICT (email) DO UPDATE SET name = 'Mr Sukhpal Singh', role = 'FACULTY', password_hash = EXCLUDED.password_hash`,
      [facultyPassHash]
    )

    // Link faculty to 3Q13
    await client.query(
      `INSERT INTO section_faculty (section_id, faculty_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [SECTION_ID, facultyId]
    )
    console.log('Faculty accounts (Mr Sukhpal Singh) assigned to Section 3Q13.')

    // 6. Ensure Students exist with passwords and enrolled in 3Q13
    const defaultStudentPassHash = await bcrypt.hash('Student@3Q13', 10)
    for (const stu of CLASS_3Q13_STUDENTS) {
      const uRes = await client.query(
        `INSERT INTO users (email, name, role, password_hash)
         VALUES ($1, $2, 'STUDENT', $3)
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [stu.email, stu.name, defaultStudentPassHash]
      )
      const uId = uRes.rows[0].id

      const sRes = await client.query(
        `INSERT INTO students (user_id, student_id_number, name, email)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (student_id_number) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email
         RETURNING id`,
        [uId, stu.rollNumber, stu.name, stu.email]
      )
      const sId = sRes.rows[0].id

      // Enroll in 3Q13
      await client.query(
        `INSERT INTO enrollments (student_id, section_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [sId, SECTION_ID]
      )

      // Ensure student balance record exists
      await client.query(
        `INSERT INTO student_balances (student_id, section_id, balance)
         VALUES ($1, $2, 0)
         ON CONFLICT (student_id, section_id) DO NOTHING`,
        [sId, SECTION_ID]
      )
    }
    console.log(`Provisioned ${CLASS_3Q13_STUDENTS.length} students enrolled in Section 3Q13.`)
    console.log('--- Database Setup & Seed Completed Successfully ---')
  } catch (err) {
    console.error('Database setup failed:', err)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

setupDatabase()
