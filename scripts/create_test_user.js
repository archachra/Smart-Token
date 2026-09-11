import pool from '../server/db.js';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

// Development‑only credentials – do NOT use in production
const users = [
  {
    id: randomUUID(),
    email: 'admin@example.com',
    password: 'AdminPass123!',
    role: 'ADMIN',
    name: 'Admin User',
  },
  {
    id: randomUUID(),
    email: 'faculty@example.com',
    password: 'FacultyPass123!',
    role: 'FACULTY',
    name: 'Faculty User',
  },
  {
    id: randomUUID(),
    email: 'student@example.com',
    password: 'StudentPass123!',
    role: 'STUDENT',
    name: 'Student User',
  },
];

// Helper to insert a user (and a linked student record when needed)
async function insertUser(user) {
  const passwordHash = await bcrypt.hash(user.password, 10);
  const result = await pool.query(
    `INSERT INTO users (id, email, password_hash, role, name)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           role = EXCLUDED.role,
           name = EXCLUDED.name
     RETURNING id`,
    [user.id, user.email, passwordHash, user.role, user.name]
  );
  const userId = result.rows[0].id;

  if (user.role === 'STUDENT') {
    await pool.query(
      `INSERT INTO students (id, user_id, student_id_number, name, email)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO NOTHING`,
      [randomUUID(), userId, 'STU123456', user.name, user.email]
    );
  }
}

(async () => {
  try {
    for (const u of users) {
      await insertUser(u);
      console.log(`Created ${u.role}: ${u.email} / ${u.password}`);
    }
    console.log('\nAll test users created successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Error creating test users:', err);
    process.exit(1);
  }
})();
