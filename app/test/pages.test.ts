import { describe, expect, it } from 'vitest';
import { printedPage } from '../src/ui/format';

const tawhid = { pageOffsets: [2, 2, 2] };

describe('printedPage', () => {
  it('Kitab at-Tawhid: PDF page 280 carries the printed number 278', () => {
    expect(printedPage(tawhid, 0, 280)).toBe(278);
    expect(printedPage(tawhid, 2, 3)).toBe(1);
  });

  it('uses the offset of the volume the page is in', () => {
    expect(printedPage({ pageOffsets: [2, 0, 5] }, 1, 40)).toBe(40);
    expect(printedPage({ pageOffsets: [2, 0, 5] }, 2, 40)).toBe(35);
  });

  it('a missing pdfIndex means the first volume', () => {
    expect(printedPage(tawhid, null, 280)).toBe(278);
  });

  it('no offsets (Tafsir, or a state cached before offsets existed) leaves the page as is', () => {
    expect(printedPage({ pageOffsets: [] }, 0, 636)).toBe(636);
    expect(printedPage({}, 0, 636)).toBe(636);
    expect(printedPage({ pageOffsets: [2] }, 1, 50)).toBe(50);
  });

  it('front matter before printed page 1 has no printed number', () => {
    expect(printedPage(tawhid, 0, 2)).toBeNull();
    expect(printedPage(tawhid, 0, 1)).toBeNull();
  });

  it('an unknown page stays unknown', () => {
    expect(printedPage(tawhid, 0, null)).toBeNull();
  });
});
