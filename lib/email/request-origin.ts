import { headers } from 'next/headers';

// Vercel's own record of where this deployment lives (set by Vercel, not by the request), as a bare
// host: the production domain in production, else this branch's or deployment's preview address.
function vercelHost(): string | null {
  const host =
    process.env.VERCEL_ENV === 'production'
      ? process.env.VERCEL_PROJECT_PRODUCTION_URL
      : process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
  return host?.trim() || null;
}

// The site's own address ("https://platformpro.app") for links in emails, so they point at whichever
// deployment sent them (production or a preview). On Vercel it comes from Vercel's settings, never
// from request headers: the public entry form emails any address the submitter types, so a forged
// Host header must not be able to choose the link. Elsewhere it falls back to the request's host.
// Null when neither is known.
export async function requestOrigin(): Promise<string | null> {
  const fromVercel = vercelHost();
  if (fromVercel) {
    return `https://${fromVercel}`;
  }
  const requestHeaders = await headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  if (!host) {
    return null;
  }
  const protocol = requestHeaders.get('x-forwarded-proto') ?? 'https';
  return `${protocol}://${host}`;
}
