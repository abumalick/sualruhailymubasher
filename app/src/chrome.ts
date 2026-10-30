import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';

const BG = { light: '#f6f1e6', dark: '#1c0b1a' };

async function applyStatusBar(dark: boolean) {
  try {
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
    await StatusBar.setBackgroundColor({ color: dark ? BG.dark : BG.light });
  } catch {}
}

export function initChrome() {
  if (!Capacitor.isNativePlatform()) return;
  const media = matchMedia('(prefers-color-scheme: dark)');
  void applyStatusBar(media.matches);
  media.addEventListener('change', (e) => void applyStatusBar(e.matches));
  requestAnimationFrame(() => void SplashScreen.hide().catch(() => {}));
}
