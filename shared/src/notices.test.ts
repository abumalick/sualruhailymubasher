import { describe, expect, it } from 'vitest';
import { lessonNoticeBody, prepNoticeBody } from './notices';

describe('lessonNoticeBody', () => {
  it('names the course and where it is held, with no lesson number', () => {
    expect(lessonNoticeBody('شرح كتاب الكبائر للذهبي', 'مسجد قباء')).toBe('شرح كتاب الكبائر للذهبي · مسجد قباء');
  });

  it('is the course title alone without a place', () => {
    expect(lessonNoticeBody('شرح كتاب الكبائر للذهبي', '')).toBe('شرح كتاب الكبائر للذهبي');
  });
});

describe('prepNoticeBody', () => {
  it('names where the next lesson starts when it is known', () => {
    expect(prepNoticeBody('كتاب التوحيد', 'المسجد', 'باب الخوف من الشرك')).toBe(
      'كتاب التوحيد · المسجد — يبدأ من: باب الخوف من الشرك',
    );
  });

  it('names only the course and place without a start point', () => {
    expect(prepNoticeBody('كتاب التوحيد', 'المسجد', null)).toBe('كتاب التوحيد · المسجد');
    expect(prepNoticeBody('كتاب التوحيد', '', null)).toBe('كتاب التوحيد');
  });
});
