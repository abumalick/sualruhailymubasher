export function ingestAlarming(beat: { at: string; ok: boolean }, nowMs: number): boolean {
  return !beat.ok || nowMs - new Date(beat.at).getTime() > 2 * 3600 * 1000;
}
