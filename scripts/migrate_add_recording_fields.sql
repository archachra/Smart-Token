-- Migration to add topic, extra_info, and audio_url columns to recording_sessions
ALTER TABLE recording_sessions ADD COLUMN IF NOT EXISTS topic TEXT;
ALTER TABLE recording_sessions ADD COLUMN IF NOT EXISTS extra_info TEXT;
ALTER TABLE recording_sessions ADD COLUMN IF NOT EXISTS audio_url TEXT;
