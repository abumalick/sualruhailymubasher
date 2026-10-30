ALTER TABLE courses ADD COLUMN offset_min INTEGER NOT NULL DEFAULT 0;
UPDATE courses SET offset_min = 25 WHERE id = 'tafsir-saadi';
UPDATE courses SET offset_min = 30 WHERE id = 'kitab-tawhid';
ALTER TABLE courses DROP COLUMN time;
