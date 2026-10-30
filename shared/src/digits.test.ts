import { describe, expect, it } from 'vitest';
import { toArabicDigits } from './digits';

describe('toArabicDigits', () => {
  it('converts to Arabic-Indic digits', () => {
    expect(toArabicDigits(443)).toBe('٤٤٣');
    expect(toArabicDigits(0)).toBe('٠');
  });
});
