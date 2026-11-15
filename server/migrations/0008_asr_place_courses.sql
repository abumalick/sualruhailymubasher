ALTER TABLE courses ADD COLUMN place TEXT NOT NULL DEFAULT '';

-- offset_min = median(start - prayer time) of the live-start posts, 21 Oct to 14 Nov 2026, minus 5 min
-- because the posts trail the start. Minutes after the prayer time, per course:
--   kitab-tawhid (Fajr, 4 posts):  34.9 36.6 39.5 41.5, median 38.1, minus 5 = 33
--   kabair (Asr, 3 posts):         27.4 30.8 31.6, median 30.8, minus 5 = 26
--   targhib (Asr, 3 posts):        23.7 27.2 34.8, median 27.2, minus 5 = 22
--   dalil-talib (Asr, 12 posts):   median 33.9, minus 5 = 29
-- Weekdays use JS numbering, 0 = Sunday.
INSERT INTO courses (id, title, slot, weekdays, offset_min, place, series_id, pdf_urls, page_offsets, edition, active, sort) VALUES
  ('kitab-tawhid', 'شرح كتاب التوحيد', 'fajr', '[6]', 33, 'المسجد النبوي (الغربية)', 287, '[]', '[]', NULL, 1, 1),
  ('kabair', 'شرح كتاب الكبائر للذهبي', 'asr', '[2]', 26, 'مسجد قباء', 251, '[]', '[]', NULL, 1, 2),
  ('targhib', 'شرح صحيح الترغيب والترهيب', 'asr', '[3]', 22, 'المسجد النبوي (حلقة ٢)', 84, '[]', '[]', NULL, 1, 3),
  ('dalil-talib', 'شرح دليل الطالب', 'asr', '[4,5,6]', 29, 'المسجد النبوي (حلقة ٢)', 69, '[]', '[]', NULL, 1, 4);
