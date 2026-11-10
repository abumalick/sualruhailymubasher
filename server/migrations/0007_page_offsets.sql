-- Printed page = PDF page - offset, one entry per volume in pdf_urls (missing entries are 0).
ALTER TABLE courses ADD COLUMN page_offsets TEXT NOT NULL DEFAULT '[]';
UPDATE courses SET page_offsets = '[2,2,2]' WHERE id = 'kitab-tawhid';
