import { Preferences } from '@capacitor/preferences';

export type TickKind = 'read' | 'reviewed';
export type Ticks = { read: Set<string>; reviewed: Set<string> };

export async function loadTicks(): Promise<Ticks> {
  const { keys } = await Preferences.keys();
  const ticks: Ticks = { read: new Set(), reviewed: new Set() };
  for (const key of keys) {
    const sep = key.indexOf(':');
    const kind = key.slice(0, sep);
    if (kind === 'read' || kind === 'reviewed') ticks[kind].add(key.slice(sep + 1));
  }
  return ticks;
}

export async function setTick(kind: TickKind, courseId: string, n: number, on: boolean): Promise<void> {
  const key = `${kind}:${courseId}:${n}`;
  if (on) await Preferences.set({ key, value: '1' });
  else await Preferences.remove({ key });
}
