ALTER TABLE exceptions ADD COLUMN source_ref TEXT;
CREATE UNIQUE INDEX exceptions_source_ref ON exceptions(source_ref, coalesce(course_id, ''));
