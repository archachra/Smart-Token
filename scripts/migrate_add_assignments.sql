-- Migration: Add assignments and assignment_submissions tables

CREATE TABLE IF NOT EXISTS assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    file_url TEXT,
    file_name VARCHAR(255),
    max_tokens INTEGER NOT NULL DEFAULT 5,
    extra_info TEXT,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assignment_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    suggested_tokens INTEGER,
    reason TEXT,
    approved_tokens INTEGER,
    finalized_by UUID REFERENCES users(id) ON DELETE SET NULL,
    finalized_at TIMESTAMPTZ,
    finalized_event_id UUID UNIQUE REFERENCES events(id) ON DELETE SET NULL,
    evaluation_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    evaluation_error TEXT,
    CONSTRAINT unique_student_assignment_submission UNIQUE (assignment_id, student_id),
    CONSTRAINT assignment_submissions_status_check CHECK (status IN ('PENDING', 'APPROVED')),
    CONSTRAINT assignment_submissions_eval_status_check CHECK (evaluation_status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'))
);

CREATE INDEX IF NOT EXISTS idx_assignments_section_id ON assignments(section_id);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_assignment_id ON assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_student_id ON assignment_submissions(student_id);
