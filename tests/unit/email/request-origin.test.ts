import { afterEach, describe, expect, it, vi } from 'vitest';

const { requestHeaders } = vi.hoisted(() => ({ requestHeaders: new Map<string, string>() }));
vi.mock('next/headers', () => ({
  headers: async () => ({ get: (name: string) => requestHeaders.get(name) ?? null }),
}));

import { requestOrigin } from '@/lib/email/request-origin';

afterEach(() => {
  requestHeaders.clear();
  vi.unstubAllEnvs();
});

function onVercel(env: string, production: string, branch: string, deployment: string) {
  vi.stubEnv('VERCEL_ENV', env);
  vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', production);
  vi.stubEnv('VERCEL_BRANCH_URL', branch);
  vi.stubEnv('VERCEL_URL', deployment);
}

describe('requestOrigin', () => {
  it("uses Vercel's production domain in production and ignores a forged Host header", async () => {
    onVercel('production', 'platformpro.app', '', 'comp-abc123.vercel.app');
    requestHeaders.set('x-forwarded-host', 'evil.example');
    expect(await requestOrigin()).toBe('https://platformpro.app');
  });

  it("uses the branch's preview address on a preview deployment", async () => {
    onVercel('preview', 'platformpro.app', 'comp-git-rota.vercel.app', 'comp-abc123.vercel.app');
    expect(await requestOrigin()).toBe('https://comp-git-rota.vercel.app');
  });

  it('falls back to the request host off Vercel, and to null without one', async () => {
    onVercel('', '', '', '');
    requestHeaders.set('host', 'localhost:3000');
    requestHeaders.set('x-forwarded-proto', 'http');
    expect(await requestOrigin()).toBe('http://localhost:3000');

    requestHeaders.clear();
    expect(await requestOrigin()).toBeNull();
  });
});
