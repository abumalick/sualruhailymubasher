// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const styles = fileURLToPath(new URL('../src/styles/', import.meta.url));
const tokens = readFileSync(styles + 'tokens.css', 'utf8');
const app = readFileSync(styles + 'app.css', 'utf8');

const token = (name: string) => {
  const m = tokens.match(new RegExp(`--fs-${name}:\\s*([\\d.]+)px`));
  if (!m) throw new Error(`no --fs-${name} token`);
  return Number(m[1]);
};

it('each type-scale token meets the iOS and Material minimum for its role, a step up for Arabic', () => {
  expect(token('caption')).toBeGreaterThanOrEqual(13);
  expect(token('label')).toBeGreaterThanOrEqual(14);
  expect(token('body-sm')).toBeGreaterThanOrEqual(17);
  expect(token('button')).toBeGreaterThanOrEqual(17);
  expect(token('body')).toBeGreaterThanOrEqual(17);
  expect(token('title')).toBeGreaterThanOrEqual(20);
});

it('text below heading size takes its size from a token, never from a literal', () => {
  const literals = [...app.matchAll(/font(?:-size)?:\s*(?:\d{3}\s+)?([\d.]+)px/g)].map((m) => Number(m[1]));
  expect(literals.length).toBeGreaterThan(0);
  expect(literals.filter((px) => px < 20)).toEqual([]);
});

it('every font size token the styles use is defined', () => {
  const used = new Set([...app.matchAll(/var\(--fs-([\w-]+)\)/g)].map((m) => m[1]));
  for (const name of used) expect(() => token(name)).not.toThrow();
});
