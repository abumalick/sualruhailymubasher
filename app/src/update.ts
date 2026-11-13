import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import type { UpdatePlatform, UpdatePolicy } from '@albadr/shared';
import { useEffect, useState } from 'preact/hooks';
import { updateStatus, updateUrl, type UpdateStatus } from './logic/update';

const DISMISSED = 'update-dismissed';

const platform = (): UpdatePlatform | 'web' => {
  const p = Capacitor.getPlatform();
  return p === 'android' || p === 'ios' ? p : 'web';
};

export interface UpdateNotice {
  status: UpdateStatus;
  url: string | null;
  dismiss: () => void;
}

export function useUpdate(policy: UpdatePolicy | null | undefined): UpdateNotice {
  const [installed, setInstalled] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const where = platform();
  useEffect(() => {
    if (where === 'web') return;
    void App.getInfo().then((i) => setInstalled(i.version), () => {});
    void Preferences.get({ key: DISMISSED }).then((r) => setDismissed(r.value), () => {});
  }, []);
  const status = updateStatus({ platform: where, installed, policy: policy ?? null, dismissed });
  return {
    status,
    url: where === 'web' ? null : updateUrl(where, import.meta.env.VITE_ANDROID_UPDATE_URL as string | undefined),
    dismiss: () => {
      if (status.kind !== 'available') return;
      setDismissed(status.version);
      void Preferences.set({ key: DISMISSED, value: status.version });
    },
  };
}
