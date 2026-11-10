import { render } from '@testing-library/preact';
import { expect, it, vi } from 'vitest';
import pdfUrl from './fixtures/tawhid-v1-p235.pdf?url';
import referenceUrl from './fixtures/tawhid-v1-p235.poppler.png?url';

vi.mock('../../src/pdf/cache', () => ({
  getPdf: async () => new Uint8Array(await (await fetch(pdfUrl)).arrayBuffer()),
  dropPdf: async () => {},
}));

import { FIXTURE_STATE } from '../../src/dev/fixture-state';
import { Book } from '../../src/ui/Book';

const SAMPLE_WIDTH = 400;
const INK = 0.6;

function grey(source: CanvasImageSource, width: number, height: number): Float32Array {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(source, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  const out = new Float32Array(width * height);
  for (let i = 0; i < out.length; i++) out[i] = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / (3 * 255);
  return out;
}

// Share of a's ink pixels with no ink in b within one pixel. The one-pixel slack absorbs
// the anti-aliasing and stroke-weight differences between pdf.js and poppler; glyphs
// drawn in the wrong place still miss.
function unmatchedInk(a: Float32Array, b: Float32Array, width: number, height: number): number {
  let ink = 0;
  let missed = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (a[y * width + x] > INK) continue;
      ink++;
      let found = false;
      for (let dy = -1; dy <= 1 && !found; dy++) {
        for (let dx = -1; dx <= 1 && !found; dx++) {
          const yy = y + dy;
          const xx = x + dx;
          found = yy >= 0 && yy < height && xx >= 0 && xx < width && b[yy * width + xx] <= INK;
        }
      }
      if (!found) missed++;
    }
  }
  return missed / ink;
}

it('renders an Arabic page with embedded subset fonts like poppler does, inside the RTL app', async () => {
  document.documentElement.dir = 'rtl';
  document.body.style.width = '1000px';
  const course = { ...FIXTURE_STATE.courses[0], pdfUrls: ['https://example.invalid/tawhid-1.pdf'], next: null };
  const { container } = render(
    <Book course={course} pdfIndex={0} page={1} marker={false} ticks={{ read: new Set(), reviewed: new Set() }} onTick={() => {}} />,
  );

  const canvas = await vi.waitFor(
    () => {
      const el = container.querySelector('canvas');
      if (!el || el.width === 0) throw new Error('not rendered yet');
      return el;
    },
    { timeout: 20_000 },
  );
  const img = new Image();
  img.src = referenceUrl;
  await img.decode();
  const height = Math.round((SAMPLE_WIDTH * canvas.height) / canvas.width);
  const reference = grey(img, SAMPLE_WIDTH, height);
  const diff = () => {
    const page = grey(canvas, SAMPLE_WIDTH, height);
    return Math.max(unmatchedInk(page, reference, SAMPLE_WIDTH, height), unmatchedInk(reference, page, SAMPLE_WIDTH, height));
  };
  // Measured: about 0.15 for a correct render, about 0.52 with the glyphs right-anchored.
  // Polled, because the canvas is sized before pdf.js has painted it.
  await vi.waitFor(() => {
    const d = diff();
    console.info(`book visual diff vs poppler: ${d.toFixed(3)}`);
    expect(d).toBeLessThan(0.3);
  }, { timeout: 15_000, interval: 250 });
});
