import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { refresh, touch } from './store';

const INTERVAL_MS = 60_000;

export async function startRefreshLoop(): Promise<() => Promise<void>> {
  let timer: ReturnType<typeof setInterval> | undefined;
  const tick = () => {
    touch();
    void refresh();
  };
  const start = () => {
    if (timer === undefined) timer = setInterval(tick, INTERVAL_MS);
  };
  const stopTimer = () => {
    clearInterval(timer);
    timer = undefined;
  };
  const foreground = () => {
    start();
    tick();
  };

  if (!Capacitor.isNativePlatform()) {
    const onVisibility = () => (document.visibilityState === 'visible' ? foreground() : stopTimer());
    document.addEventListener('visibilitychange', onVisibility);
    if (document.visibilityState === 'visible') start();
    return async () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stopTimer();
    };
  }

  const handles = [
    await App.addListener('resume', foreground),
    await App.addListener('appStateChange', ({ isActive }) => (isActive ? foreground() : stopTimer())),
  ];
  start();
  return async () => {
    stopTimer();
    await Promise.all(handles.map((h) => h.remove()));
  };
}
