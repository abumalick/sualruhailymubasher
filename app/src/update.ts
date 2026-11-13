import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import type { UpdatePlatform } from '@albadr/shared';

const DISMISSED = 'update-dismissed';

export const updatePlatform = (): UpdatePlatform | 'web' => {
  const p = Capacitor.getPlatform();
  return p === 'android' || p === 'ios' ? p : 'web';
};

// The sideloaded APK's build passes its own link: Play can't update an APK signed by another key.
export const androidUpdateUrl = (): string | undefined => import.meta.env.VITE_ANDROID_UPDATE_URL as string | undefined;

// Each read fails open on its own: an unknown version is never gated.
export async function loadUpdateContext(): Promise<{ installed: string | null; dismissed: string | null }> {
  if (updatePlatform() === 'web') return { installed: null, dismissed: null };
  const [installed, dismissed] = await Promise.all([
    App.getInfo().then((i) => i.version, () => null),
    Preferences.get({ key: DISMISSED }).then((r) => r.value, () => null),
  ]);
  return { installed, dismissed };
}

export const saveDismissed = (version: string) => Preferences.set({ key: DISMISSED, value: version });
