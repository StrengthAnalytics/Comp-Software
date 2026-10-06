import { headers } from 'next/headers';

// The site's own address ("https://platformpro.app"), worked out from the request a server action
// is answering, so links in emails point at whichever deployment sent them (production or a
// preview). Null when the request carries no host.
export async function requestOrigin(): Promise<string | null> {
  const requestHeaders = await headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  if (!host) {
    return null;
  }
  const protocol = requestHeaders.get('x-forwarded-proto') ?? 'https';
  return `${protocol}://${host}`;
}
