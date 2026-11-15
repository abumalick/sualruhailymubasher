CREATE TABLE sections (
  course_id TEXT NOT NULL,
  section TEXT NOT NULL,
  ord INTEGER NOT NULL,
  PRIMARY KEY (course_id, section)
);

ALTER TABLE lessons ADD COLUMN section TEXT NOT NULL DEFAULT '';
ALTER TABLE lessons ADD COLUMN section_number INTEGER;
ALTER TABLE lessons ADD COLUMN source_ref TEXT;
ALTER TABLE lessons ADD COLUMN date_flag INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX lessons_identity ON lessons(course_id, section, section_number);
CREATE UNIQUE INDEX lessons_source ON lessons(source_ref) WHERE source_ref IS NOT NULL;

ALTER TABLE courses ADD COLUMN lesson_word TEXT NOT NULL DEFAULT 'الدرس';
UPDATE courses SET lesson_word = 'المجلس' WHERE id = 'kabair';

INSERT INTO sections (course_id, section, ord) VALUES ('kitab-tawhid', '', 1), ('kabair', '', 1);
