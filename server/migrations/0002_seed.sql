INSERT INTO courses (id, title, slot, weekdays, time, series_id, pdf_urls, active, sort) VALUES
  ('tafsir-saadi', 'شرح تفسير السعدي', 'fajr', '[0,1,2,3,4,5]', '05:25', 456, '[]', 1, 1),
  ('kitab-tawhid', 'التعليق على شرح كتاب التوحيد من تقريرات الشيخ محمد بن إبراهيم', 'maghrib', '[0,1,2,3,4]', '18:20', 481,
   '["https://al-badr.net/download/mutun/SharhKitaabAtTawheed_IbnIbraheem_01.pdf","https://al-badr.net/download/mutun/SharhKitaabAtTawheed_IbnIbraheem_02.pdf","https://al-badr.net/download/mutun/SharhKitaabAtTawheed_IbnIbraheem_03.pdf"]', 1, 2);

INSERT INTO settings (key, value) VALUES ('live_mode', 'embed');

INSERT INTO live_state (id, is_live) VALUES (1, 0);
