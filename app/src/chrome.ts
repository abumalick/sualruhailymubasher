import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { watchData } from './store';

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
  let hidden = false;
  const hide = () => {
    if (hidden) return;
    hidden = true;
    stop();
    clearTimeout(fallback);
    void SplashScreen.hide().catch(() => {});
  };
  const stop = watchData((d) => (d.state || d.error) && hide());
  const fallback = setTimeout(hide, 3000);
}
