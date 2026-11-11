import { describe, expect, it } from 'vitest';
import { createHasher } from './hash';

describe('createHasher', () => {
  it('gives the same digest for the same input', () => {
    const a = createHasher().numbers([1, 2.5, -3]).text('abc').digest();
    const b = createHasher().numbers([1, 2.5, -3]).text('abc').digest();
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
  });

  it('changes when any number changes, even in the last bit', () => {
    const a = createHasher().numbers([1, 2.5, -3]).digest();
    const b = createHasher().numbers([1, 2.5000000000000004, -3]).digest();
    expect(a).not.toBe(b);
  });

  it('changes with order and with text', () => {
    expect(createHasher().numbers([1, 2]).digest()).not.toBe(createHasher().numbers([2, 1]).digest());
    expect(createHasher().text('ab').digest()).not.toBe(createHasher().text('ba').digest());
  });

  it('accepts typed arrays', () => {
    expect(createHasher().numbers(new Float64Array([1, 2])).digest()).toBe(createHasher().numbers([1, 2]).digest());
  });
});
