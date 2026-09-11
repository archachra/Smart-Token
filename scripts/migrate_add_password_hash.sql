-- Migration to add password_hash column
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
