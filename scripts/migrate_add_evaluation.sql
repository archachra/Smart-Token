CREATE TABLE IF NOT EXISTS recording_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_session_id UUID NOT NULL UNIQUE REFERENCES recording_sessions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING',
  relevant BOOLEAN,
  correct BOOLEAN,
  reason TEXT,
  suggested_token_change INTEGER,
  provider TEXT,
  model TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  final_token_change INTEGER,
  finalized_by UUID REFERENCES users(id),
  finalized_at TIMESTAMPTZ,
  finalized_event_id UUID UNIQUE REFERENCES events(id),
  CONSTRAINT recording_evaluations_status_check CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'FINALIZED')),
  CONSTRAINT recording_evaluations_token_change_check CHECK (suggested_token_change IS NULL OR suggested_token_change BETWEEN -1 AND 1)
);

ALTER TABLE recording_evaluations
  ADD COLUMN IF NOT EXISTS final_token_change INTEGER,
  ADD COLUMN IF NOT EXISTS finalized_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finalized_event_id UUID UNIQUE REFERENCES events(id);

ALTER TABLE recording_evaluations DROP CONSTRAINT IF EXISTS recording_evaluations_status_check;
ALTER TABLE recording_evaluations ADD CONSTRAINT recording_evaluations_status_check
  CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'FINALIZED'));
