import { Preferences } from '@capacitor/preferences';
import type { Follow, Prefs } from './logic/prefs';

const PREFS = 'prefs';
const ONBOARDED = 'onboarded';

async function readJson<T>(key: string, valid: (v: unknown) => boolean): Promise<T | null> {
  const { value } = await Preferences.get({ key });
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return valid(parsed) ? (parsed as T) : null;
  } catch {
    return null;
  }
}

const isList = (v: unknown) => Array.isArray(v);

export const loadPrefs = () => readJson<Prefs>(PREFS, (v) => isList((v as Prefs)?.wanted) && isList((v as Prefs).known));

export const savePrefs = (p: Prefs) => Preferences.set({ key: PREFS, value: JSON.stringify(p) });

export const loadOnboarded = async () => (await Preferences.get({ key: ONBOARDED })).value === '1';

export const saveOnboarded = () => Preferences.set({ key: ONBOARDED, value: '1' });

export interface Legacy {
  topics: string[] | null;
  topicCourses: string[] | null;
  follow: Follow | null;
}

export const loadLegacy = async (): Promise<Legacy> => ({
  topics: await readJson<string[]>('topics', isList),
  topicCourses: await readJson<string[]>('topic-courses', isList),
  follow: await readJson<Follow>('follow', (v) => isList((v as Follow)?.ids) && typeof (v as Follow).known === 'object'),
});

export async function dropLegacy(): Promise<void> {
  await Preferences.remove({ key: 'follow' });
  await Preferences.remove({ key: 'topic-courses' });
}
