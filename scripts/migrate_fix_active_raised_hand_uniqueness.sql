ALTER TABLE raised_hands DROP CONSTRAINT IF EXISTS unique_active_raised_hand;
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_raised_hand
  ON raised_hands(section_id, student_id)
  WHERE resolved_at IS NULL;
