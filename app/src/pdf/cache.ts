import { CapacitorHttp } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { API_BASE } from '../api';
import { isNative } from '../platform';

export interface BookFile {
  courseId: string;
  index: number;
  url: string;
}

// al-badr.net sends no CORS headers: the browser reads the same file through the API's proxy.
export const proxyUrl = (book: BookFile) => `${API_BASE}/api/courses/${encodeURIComponent(book.courseId)}/pdf/${book.index}`;

async function pathFor(url: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(url));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `pdf/${hex}.pdf`;
}

const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function readCached(path: string): Promise<Uint8Array | null> {
  try {
    const { data } = await Filesystem.readFile({ path, directory: Directory.Data });
    return typeof data === 'string' ? fromBase64(data) : new Uint8Array(await data.arrayBuffer());
  } catch {
    return null;
  }
}

async function downloadNative(url: string): Promise<Uint8Array> {
  const res = await CapacitorHttp.get({ url, responseType: 'blob' });
  if (res.status !== 200 || typeof res.data !== 'string') throw new Error(`download failed: ${res.status}`);
  return fromBase64(res.data);
}

// The browser's HTTP cache keeps the proxied file (the proxy sends a week-long max-age).
async function downloadWeb(book: BookFile): Promise<Uint8Array> {
  const res = await fetch(proxyUrl(book));
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function getPdf(book: BookFile): Promise<Uint8Array> {
  if (!isNative()) return downloadWeb(book);
  const path = await pathFor(book.url);
  const cached = await readCached(path);
  if (cached) return cached;
  const bytes = await downloadNative(book.url);
  try {
    await Filesystem.writeFile({ path, data: toBase64(bytes), directory: Directory.Data, recursive: true });
  } catch {
    // the book still opens; it just is not available offline next time
  }
  return bytes;
}

export async function dropPdf(book: BookFile): Promise<void> {
  if (!isNative()) return;
  await Filesystem.deleteFile({ path: await pathFor(book.url), directory: Directory.Data }).catch(() => {});
}
