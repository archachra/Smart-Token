import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'

const { Client } = pg

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const dbConfig = {
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432', 10),
  user: process.env.PGUSER || 'arnavchachra',
  password: process.env.PGPASSWORD || '',
  database: 'postgres',
}

const DB_NAME = process.env.SMARTTOKEN_DB_NAME || 'smarttoken_db'

async function setupDatabase() {
  console.log('--- Step 1: Initializing PostgreSQL Connection ---')
  const rootClient = new Client(dbConfig)
  await rootClient.connect()

  // Check if database exists, create if missing
  const res = await rootClient.query(
    `SELECT 1 FROM pg_database WHERE datname = $1`,
    [DB_NAME]
  )
  if (res.rowCount === 0) {
    console.log(`Database "${DB_NAME}" does not exist. Creating...`)
    await rootClient.query(`CREATE DATABASE ${DB_NAME}`)
    console.log(`Database "${DB_NAME}" created successfully.`)
  } else {
    console.log(`Database "${DB_NAME}" already exists.`)
  }
  await rootClient.end()
}

async function runSchemaVerification() {
  console.log(`\n--- Step 2: Applying Schema to "${DB_NAME}" ---`)
  const targetClient = new Client({ ...dbConfig, database: DB_NAME })
  await targetClient.connect()

  const schemaPath = path.join(__dirname, 'schema.sql')
  const schemaSql = fs.readFileSync(schemaPath, 'utf8')

  console.log('Executing schema.sql...')
  await targetClient.query(schemaSql)
  console.log('schema.sql applied cleanly.')

  console.log('\n--- Step 3: Running Schema Rule & Constraint Assertions ---')

  try {
    // 1. Create Users
    console.log('Testing "users" table insertion...')
    const facultyRes = await targetClient.query(
      `INSERT INTO users (email, name, role) VALUES ($1, $2, $3) RETURNING id`,
      ['faculty@smarttoken.edu', 'Prof. Alan Turing', 'FACULTY']
    )
    const facultyId = facultyRes.rows[0].id

    const studentUserRes = await targetClient.query(
      `INSERT INTO users (email, name, role) VALUES ($1, $2, $3) RETURNING id`,
      ['student@smarttoken.edu', 'Alex Johnson', 'STUDENT']
    )
    const studentUserId = studentUserRes.rows[0].id

    // 2. Create Student
    console.log('Testing "students" table insertion...')
    const studentRes = await targetClient.query(
      `INSERT INTO students (user_id, student_id_number, name, email) VALUES ($1, $2, $3, $4) RETURNING id`,
      [studentUserId, 'CS101-001', 'Alex Johnson', 'student@smarttoken.edu']
    )
    const studentId = studentRes.rows[0].id

    // 3. Create Course & Section
    console.log('Testing "courses" and "sections" table insertion...')
    const courseRes = await targetClient.query(
      `INSERT INTO courses (code, title, description) VALUES ($1, $2, $3) RETURNING id`,
      ['CS101', 'Computer Science 101', 'Intro to CS & Data Structures']
    )
    const courseId = courseRes.rows[0].id

    const sectionRes = await targetClient.query(
      `INSERT INTO sections (course_id, section_name, term) VALUES ($1, $2, $3) RETURNING id`,
      [courseId, 'Section A', 'Fall 2026']
    )
    const sectionId = sectionRes.rows[0].id

    // 4. Enrollments & Section Faculty
    console.log('Testing "enrollments" and "section_faculty" insertion...')
    await targetClient.query(
      `INSERT INTO enrollments (student_id, section_id) VALUES ($1, $2)`,
      [studentId, sectionId]
    )
    await targetClient.query(
      `INSERT INTO section_faculty (section_id, faculty_id) VALUES ($1, $2)`,
      [sectionId, facultyId]
    )

    // 5. Test student_balances composite PK (student_id, section_id)
    console.log('Testing "student_balances" composite primary key (student_id, section_id)...')
    await targetClient.query(
      `INSERT INTO student_balances (student_id, section_id, balance) VALUES ($1, $2, $3)`,
      [studentId, sectionId, 5]
    )

    // Assert duplicate PK insertion throws error
    let balancePkErr = null
    try {
      await targetClient.query(
        `INSERT INTO student_balances (student_id, section_id, balance) VALUES ($1, $2, $3)`,
        [studentId, sectionId, 10]
      )
    } catch (err) {
      balancePkErr = err
    }
    if (balancePkErr && balancePkErr.code === '23505') {
      console.log('  [PASS] Composite PK (student_id, section_id) correctly enforced.')
    } else {
      throw new Error('FAILED: student_balances duplicate PK constraint was not enforced!')
    }

    // 6. Test events table append-only & client_event_id unique constraint
    console.log('Testing "events" append-only table & client_event_id uniqueness...')
    const clientEventId1 = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
    const origEventRes = await targetClient.query(
      `INSERT INTO events (client_event_id, section_id, student_id, created_by, event_type, token_change, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [clientEventId1, sectionId, studentId, facultyId, 'TOKEN_AWARD', 2, 'Awarded +2 tokens for presentation']
    )
    const origEventId = origEventRes.rows[0].id

    // Assert duplicate client_event_id throws error
    let dupEventErr = null
    try {
      await targetClient.query(
        `INSERT INTO events (client_event_id, section_id, student_id, created_by, event_type, token_change, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [clientEventId1, sectionId, studentId, facultyId, 'TOKEN_AWARD', 2, 'Duplicate event attempt']
      )
    } catch (err) {
      dupEventErr = err
    }
    if (dupEventErr && dupEventErr.code === '23505') {
      console.log('  [PASS] client_event_id unique constraint correctly enforced for idempotent offline sync.')
    } else {
      throw new Error('FAILED: events client_event_id unique constraint was not enforced!')
    }

    // 7. Test correction_of nullable self-referential FK in events
    console.log('Testing "events" correction_of self-referential FK link...')
    const clientEventId2 = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'
    const corrEventRes = await targetClient.query(
      `INSERT INTO events (client_event_id, section_id, student_id, created_by, event_type, token_change, description, correction_of)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, correction_of`,
      [clientEventId2, sectionId, studentId, facultyId, 'CORRECTION', -1, 'Deducted 1 token for duplicate entry', origEventId]
    )

    if (corrEventRes.rows[0].correction_of === origEventId) {
      console.log('  [PASS] correction_of self-referential FK correctly references original event.')
    } else {
      throw new Error('FAILED: correction_of FK reference mismatch!')
    }

    console.log('\n--- Step 4: Verification Result ---')
    console.log('🎉 ALL DATABASE SCHEMA CONSTRAINTS & MIGRATION RULES VERIFIED SUCCESSFULLY!')
  } finally {
    await targetClient.end()
  }
}

async function main() {
  try {
    await setupDatabase()
    await runSchemaVerification()
  } catch (err) {
    console.error('❌ Database verification failed:', err)
    process.exit(1)
  }
}

main()
