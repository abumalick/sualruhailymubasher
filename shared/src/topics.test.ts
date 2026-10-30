import { describe, expect, it } from 'vitest';
import { courseTopic, LIVE_OTHER_TOPIC } from './index';

describe('topics', () => {
  it('names course and live-other topics', () => {
    expect(courseTopic('tafsir-saadi', 'live')).toBe('c-tafsir-saadi-live');
    expect(courseTopic('kitab-tawhid', 'rec')).toBe('c-kitab-tawhid-rec');
    expect(courseTopic('kitab-tawhid', 'prep')).toBe('c-kitab-tawhid-prep');
    expect(LIVE_OTHER_TOPIC).toBe('live-other');
  });
});
