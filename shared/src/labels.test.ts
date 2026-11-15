import { describe, expect, it } from 'vitest';
import { lessonLabel, noticePlace } from './labels';

describe('lessonLabel', () => {
  it('names a sectioned lesson by its section and Arabic-Indic number', () => {
    expect(lessonLabel('الدرس', 'كتاب الشهادات', 2)).toBe('كتاب الشهادات – الدرس ٢');
  });

  it('uses the course word when there is no section', () => {
    expect(lessonLabel('المجلس', '', 54)).toBe('المجلس ٥٤');
    expect(lessonLabel('الدرس', '', 10)).toBe('الدرس ١٠');
  });

  it('ignores the course word when there is a section', () => {
    expect(lessonLabel('المجلس', 'كتاب الحدود', 11)).toBe('كتاب الحدود – الدرس ١١');
  });
});

describe('noticePlace', () => {
  it('joins the title and the place', () => {
    expect(noticePlace('شرح كتاب الكبائر للذهبي', 'مسجد قباء')).toBe('شرح كتاب الكبائر للذهبي · مسجد قباء');
  });

  it('is the title alone without a place', () => {
    expect(noticePlace('شرح كتاب الكبائر للذهبي', '')).toBe('شرح كتاب الكبائر للذهبي');
  });
});
