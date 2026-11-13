import { describe, expect, it } from 'vitest';
import { lessonNoticeBody, prepNoticeBody } from './notices';

describe('lessonNoticeBody', () => {
  it('names the course and the lesson in Arabic digits', () => {
    expect(lessonNoticeBody('شرح تفسير السعدي', 461)).toBe('شرح تفسير السعدي · الدرس ٤٦١');
  });
});

describe('prepNoticeBody', () => {
  it('names where the next lesson starts when it is known', () => {
    expect(prepNoticeBody('كتاب التوحيد', 'باب الخوف من الشرك', 3)).toBe('كتاب التوحيد · باب الخوف من الشرك');
  });

  it('otherwise says it follows on from the previous lesson', () => {
    expect(prepNoticeBody('كتاب التوحيد', null, 3)).toBe('كتاب التوحيد · يتابع من حيث توقف الدرس ٢');
  });

  it('names only the course before the first lesson', () => {
    expect(prepNoticeBody('كتاب التوحيد', null, 1)).toBe('كتاب التوحيد');
  });
});
