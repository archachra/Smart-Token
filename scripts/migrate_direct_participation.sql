-- Migration to support direct open participation and faculty active topics
ALTER TABLE recording_sessions ALTER COLUMN raised_hand_id DROP NOT NULL;
ALTER TABLE sections ADD COLUMN IF NOT EXISTS active_topic TEXT;
ALTER TABLE sections ADD COLUMN IF NOT EXISTS active_extra_info TEXT;
