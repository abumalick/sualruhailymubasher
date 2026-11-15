export const MEDIA_MAX_BYTES = 95_000_000;
export const MEDIA_TYPES: Record<string, string> = { mp3: 'audio/mpeg', m4a: 'audio/mp4' };

const MEDIA_KEY = /^lessons\/[a-z0-9-]+\/[0-9]+\.(mp3|m4a)$/;

export function mediaKeyProblem(key: string): string | null {
  return MEDIA_KEY.test(key) ? null : 'invalid media key';
}
