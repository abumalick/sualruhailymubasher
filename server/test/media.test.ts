import { describe, expect, it } from 'vitest';
import { MEDIA_MAX_BYTES, MEDIA_TYPES, mediaKeyProblem } from '../src/media';

describe('mediaKeyProblem', () => {
  it('accepts a lesson audio key', () => {
    expect(mediaKeyProblem('lessons/dalil-talib/1112.mp3')).toBeNull();
    expect(mediaKeyProblem('lessons/targhib/9.m4a')).toBeNull();
  });

  it.each([
    'lessons/x/../a.mp3',
    'lessons/dalil-talib/abc.mp3',
    'media/a.mp3',
    'lessons/dalil-talib/1112.wav',
    'lessons/Dalil/1112.mp3',
    'lessons/dalil-talib/1112.mp3/extra',
  ])('rejects %s', (key) => {
    expect(mediaKeyProblem(key)).not.toBeNull();
  });

  it('caps uploads under the Workers body limit and maps extensions to types', () => {
    expect(MEDIA_MAX_BYTES).toBe(95_000_000);
    expect(MEDIA_TYPES).toEqual({ mp3: 'audio/mpeg', m4a: 'audio/mp4' });
  });
});
