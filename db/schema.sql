-- SmartToken Database Schema v1
-- PostgreSQL 16+ schema definitions

-- Enable pgcrypto / uuid extension if needed
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DROP TABLE IF EXISTS recording_sessions CASCADE;
DROP TABLE IF EXISTS raised_hands CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS student_balances CASCADE;
DROP TABLE IF EXISTS section_faculty CASCADE;
DROP TABLE IF EXISTS enrollments CASCADE;
DROP TABLE IF EXISTS sections CASCADE;
DROP TABLE IF EXISTS courses CASCADE;
DROP TABLE IF EXISTS students CASCADE;
DROP TABLE IF EXISTS users CASCADE;

DROP TYPE IF EXISTS recording_status CASCADE;
DROP TYPE IF EXISTS event_type CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;

-- Enums
CREATE TYPE user_role AS ENUM ('ADMIN', 'FACULTY', 'STUDENT');
CREATE TYPE event_type AS ENUM ('ATTENDANCE', 'PARTICIPATION', 'TOKEN_AWARD', 'CORRECTION');
CREATE TYPE recording_source AS ENUM ('STUDENT_DEVICE', 'FACULTY_DEVICE');
CREATE TYPE recording_status AS ENUM ('APPROVED', 'RECORDING', 'COMPLETED');

-- Helper function to automatically update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

-- 1. Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. Students Table
CREATE TABLE students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    student_id_number VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_students_updated_at
BEFORE UPDATE ON students
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3. Courses Table
CREATE TABLE courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(32) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_courses_updated_at
BEFORE UPDATE ON courses
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. Sections Table
CREATE TABLE sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    section_name VARCHAR(64) NOT NULL,
    term VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_section_per_term UNIQUE (course_id, section_name, term)
);

CREATE TRIGGER update_sections_updated_at
BEFORE UPDATE ON sections
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. Enrollments Table
CREATE TABLE enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    attendance_status VARCHAR(16) NOT NULL DEFAULT 'ABSENT',
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_student_section_enrollment UNIQUE (student_id, section_id)
);

-- 6. Section Faculty Table
CREATE TABLE section_faculty (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    faculty_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_section_faculty UNIQUE (section_id, faculty_id)
);

-- 7. Student Balances Table (Composite Primary Key: student_id, section_id)
CREATE TABLE student_balances (
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    balance INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (student_id, section_id)
);

CREATE TRIGGER update_student_balances_updated_at
BEFORE UPDATE ON student_balances
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 8. Events Table (Append-Only Event Ledger)
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_event_id UUID UNIQUE NOT NULL,
    section_id UUID NOT NULL REFERENCES sections(id) ON DELETE RESTRICT,
    student_id UUID REFERENCES students(id) ON DELETE RESTRICT,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    event_type event_type NOT NULL,
    token_change INTEGER NOT NULL DEFAULT 0,
    description TEXT,
    correction_of UUID REFERENCES events(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Raised Hands Table (Active Participation Queue State)
CREATE TABLE raised_hands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    raised_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    CONSTRAINT unique_active_raised_hand UNIQUE (section_id, student_id)
);

-- 10. Recording Sessions Table (Participation Workflow State)
CREATE TABLE recording_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    raised_hand_id UUID NOT NULL REFERENCES raised_hands(id) ON DELETE CASCADE,
    status recording_status NOT NULL DEFAULT 'APPROVED',
    recording_source recording_source NOT NULL DEFAULT 'STUDENT_DEVICE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    CONSTRAINT unique_session_per_raised_hand UNIQUE (raised_hand_id)
);

-- Performance Indexes
CREATE INDEX idx_sections_course_id ON sections(course_id);
CREATE INDEX idx_enrollments_section_id ON enrollments(section_id);
CREATE INDEX idx_enrollments_student_id ON enrollments(student_id);
CREATE INDEX idx_section_faculty_faculty_id ON section_faculty(faculty_id);
CREATE INDEX idx_events_section_id ON events(section_id);
CREATE INDEX idx_events_student_id ON events(student_id);
CREATE INDEX idx_events_created_by ON events(created_by);
CREATE INDEX idx_events_correction_of ON events(correction_of);
CREATE INDEX idx_raised_hands_section_raised_at ON raised_hands(section_id, raised_at ASC);
CREATE INDEX idx_recording_sessions_section_id ON recording_sessions(section_id);
CREATE INDEX idx_recording_sessions_student_id ON recording_sessions(student_id);
CREATE INDEX idx_recording_sessions_raised_hand_id ON recording_sessions(raised_hand_id);


