import { describe, expect, it } from 'vitest';
import { compareVersions, isVersion, parseUpdatePolicy, updatePolicyProblem } from './update';

describe('compareVersions', () => {
  it('compares each part as a number', () => {
    expect(compareVersions('1.0.9', '1.0.16')).toBeLessThan(0);
    expect(compareVersions('1.0.17', '1.0.16')).toBeGreaterThan(0);
    expect(compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0);
    expect(compareVersions('1.0.16', '1.0.16')).toBe(0);
  });

  it('treats missing parts as zero', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.1', '1.0.5')).toBeGreaterThan(0);
  });

  it('refuses anything that is not a version name', () => {
    expect(compareVersions('1.0.16-beta', '1.0.16')).toBeNull();
    expect(compareVersions('', '1.0')).toBeNull();
    expect(compareVersions('1.0', 'v1.0')).toBeNull();
  });
});

describe('isVersion', () => {
  it.each(['1', '1.0', '1.0.16', '10.2.3.4'])('accepts %s', (v) => expect(isVersion(v)).toBe(true));
  it.each(['', '1.', '.1', '1.0.0.0.0', '1.0.16 ', 'abc', 16, null])('refuses %s', (v) => expect(isVersion(v)).toBe(false));
});

describe('parseUpdatePolicy', () => {
  it('reads both platforms', () => {
    const raw = { android: { min: '1.0.17', latest: '1.0.18' }, ios: { min: null, latest: '1.0.18' } };
    expect(parseUpdatePolicy(raw)).toEqual(raw);
  });

  it('drops what it cannot read instead of throwing', () => {
    expect(parseUpdatePolicy(null)).toBeNull();
    expect(parseUpdatePolicy('x')).toBeNull();
    expect(parseUpdatePolicy([])).toBeNull();
    expect(parseUpdatePolicy({ android: 'x', ios: { min: 5, latest: 'abc' } })).toEqual({ ios: { min: null, latest: null } });
    expect(parseUpdatePolicy({ web: { min: '1.0' } })).toEqual({});
  });
});

describe('updatePolicyProblem', () => {
  it('accepts a sound policy, including an empty one that turns everything off', () => {
    expect(updatePolicyProblem({ android: { min: '1.0.17', latest: '1.0.17' }, ios: { min: null, latest: '1.0.18' } })).toBeNull();
    expect(updatePolicyProblem({})).toBeNull();
  });

  it.each([
    [null],
    [{ web: { min: null, latest: null } }],
    [{ android: { min: '1.0', latest: 'x' } }],
    [{ android: { min: '1.0.18', latest: '1.0.17' } }],
    [{ android: { min: '1.0.17', latest: null } }],
    [{ ios: { min: '1.0.17' } }],
  ])('refuses %j', (raw) => expect(updatePolicyProblem(raw)).not.toBeNull());
});
