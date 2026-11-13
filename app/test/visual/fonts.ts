// The app's own faces (as main.tsx loads them), so layout is measured with the glyphs users get, not a system fallback.
import '@fontsource/aref-ruqaa/400.css';
import '@fontsource/aref-ruqaa/700.css';
import '@fontsource/amiri/400.css';
import '@fontsource/amiri/700.css';
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';

export async function fontsLoaded() {
  const faces = ['400 16px Amiri', '700 16px Amiri', '400 16px "IBM Plex Sans Arabic"', '600 16px "IBM Plex Sans Arabic"', '700 16px "Aref Ruqaa"'];
  const loaded = await Promise.all(faces.map((f) => document.fonts.load(f, 'ب')));
  const missing = faces.filter((_, i) => loaded[i].length === 0);
  if (missing.length) throw new Error(`fonts not loaded: ${missing.join(', ')}`);
  await document.fonts.ready;
}
