import { describe, expect, it } from 'bun:test';
import { isLinkLocalHost, isLoopbackHost } from './outbound.ts';

describe('исходящие адреса настроек', () => {
  it('петля — эта машина; частные сети (LAN) петлёй не считаются', () => {
    for (const host of [
      'localhost',
      'app.localhost',
      '127.0.0.1',
      '127.1.2.3',
      '::1',
      '[::1]',
    ])
      expect(isLoopbackHost(host)).toBe(true);
    for (const host of [
      '192.168.1.5',
      '10.0.0.1',
      '8.8.8.8',
      'api.openai.com',
      '169.254.169.254',
    ])
      expect(isLoopbackHost(host)).toBe(false);
  });

  it('link-local и облачная метадата режутся; LAN и публичные — нет', () => {
    for (const host of [
      '169.254.169.254',
      '169.254.0.1',
      'fe80::1',
      '[fe80::1]',
      'fd00:ec2::254',
    ])
      expect(isLinkLocalHost(host)).toBe(true);
    // 192.168/10/172.16 — своя сеть (MinIO, локальная модель): не режем, это суть self-hosting.
    for (const host of [
      '192.168.1.5',
      '10.0.0.1',
      '172.16.0.1',
      '127.0.0.1',
      '8.8.8.8',
      'api.openai.com',
    ])
      expect(isLinkLocalHost(host)).toBe(false);
  });
});
