import { Preferences } from '@capacitor/preferences';
import { parseFollow, type Follow } from './logic/follow';

const KEY = 'follow';

export const loadFollow = async (): Promise<Follow | null> => parseFollow((await Preferences.get({ key: KEY })).value);

export const saveFollow = (f: Follow) => Preferences.set({ key: KEY, value: JSON.stringify(f) });

// Versions before the choice existed saved push topics on every launch; this one saves them only after a choice.
export const usedBeforeChoice = async () => (await Preferences.get({ key: 'topics' })).value !== null;
