ALTER TABLE recording_sessions
  ADD COLUMN IF NOT EXISTS transcript TEXT,
  ADD COLUMN IF NOT EXISTS transcription_status TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS transcription_error TEXT,
  ADD COLUMN IF NOT EXISTS transcribed_at TIMESTAMPTZ;

ALTER TABLE recording_sessions
  DROP CONSTRAINT IF EXISTS recording_sessions_transcription_status_check;

ALTER TABLE recording_sessions
  ADD CONSTRAINT recording_sessions_transcription_status_check
  CHECK (transcription_status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'));
