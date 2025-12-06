-- Migration: Add recurring reminders support
-- This adds fields to support daily, weekly, and custom recurring reminders

-- Add recurrence fields to reminders table
ALTER TABLE reminders
ADD COLUMN IF NOT EXISTS recurrence_type TEXT CHECK (recurrence_type IN ('once', 'daily', 'weekly', 'custom')),
ADD COLUMN IF NOT EXISTS recurrence_interval INT DEFAULT NULL, -- For custom: repeat every N units
ADD COLUMN IF NOT EXISTS recurrence_unit TEXT CHECK (recurrence_unit IN ('minutes', 'hours', 'days', 'weeks')),
ADD COLUMN IF NOT EXISTS recurrence_count INT DEFAULT NULL, -- How many times to repeat (NULL = forever)
ADD COLUMN IF NOT EXISTS recurrence_end_date TIMESTAMPTZ DEFAULT NULL, -- Alternative: end by date
ADD COLUMN IF NOT EXISTS weekdays INT[] DEFAULT NULL, -- For weekly: [0,1,2,3,4,5,6] (0=Sunday)
ADD COLUMN IF NOT EXISTS last_reminded_at TIMESTAMPTZ DEFAULT NULL, -- Track last reminder sent
ADD COLUMN IF NOT EXISTS times_reminded INT DEFAULT 0; -- Counter for recurrence_count

-- Set default for existing reminders
UPDATE reminders SET recurrence_type = 'once' WHERE recurrence_type IS NULL;

-- Make recurrence_type NOT NULL after setting defaults
ALTER TABLE reminders ALTER COLUMN recurrence_type SET DEFAULT 'once';
ALTER TABLE reminders ALTER COLUMN recurrence_type SET NOT NULL;

COMMENT ON COLUMN reminders.recurrence_type IS 'Type of recurrence: once, daily, weekly, custom';
COMMENT ON COLUMN reminders.recurrence_interval IS 'For custom: repeat every N units (e.g., 4 for "every 4 hours")';
COMMENT ON COLUMN reminders.recurrence_unit IS 'Unit for custom recurrence: minutes, hours, days, weeks';
COMMENT ON COLUMN reminders.recurrence_count IS 'Number of times to repeat (NULL = forever)';
COMMENT ON COLUMN reminders.recurrence_end_date IS 'Stop recurring after this date';
COMMENT ON COLUMN reminders.weekdays IS 'For weekly: Array of weekday numbers (0=Sunday, 6=Saturday)';
COMMENT ON COLUMN reminders.last_reminded_at IS 'Timestamp of last reminder sent';
COMMENT ON COLUMN reminders.times_reminded IS 'Counter of how many times reminded';
