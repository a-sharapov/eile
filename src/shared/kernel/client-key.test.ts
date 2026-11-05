import { expect, it } from 'bun:test';
import { defineClientKey } from './client-key.ts';

it('ключ адреса — тот же внутри одной соли, у другой соли другой, самого адреса в нём нет', () => {
  const key = defineClientKey();
  const other = defineClientKey();
  expect(key('203.0.113.7')).toBe(key('203.0.113.7'));
  expect(key('203.0.113.7')).not.toBe(key('203.0.113.8'));
  expect(other('203.0.113.7')).not.toBe(key('203.0.113.7'));
  expect(key('203.0.113.7')).toMatch(/^[\w-]{43}$/);
  expect(key('203.0.113.7')).not.toContain('203');
});
