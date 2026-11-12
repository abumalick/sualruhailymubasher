import { App } from '@capacitor/app';
import { isNative } from './platform';

// Once a listener exists, Capacitor no longer steps the WebView back itself: the handler owns every press.
export function onBackButton(handler: (canGoBack: boolean) => void): () => void {
  if (!isNative()) return () => {};
  const handle = App.addListener('backButton', ({ canGoBack }) => handler(canGoBack));
  return () => void handle.then((h) => h.remove());
}
