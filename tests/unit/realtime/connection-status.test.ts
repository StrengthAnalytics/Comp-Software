import { describe, expect, it } from 'vitest';
import {
  computeConnectionIndicator,
  deriveConnectionState,
} from '@/lib/realtime/connection-status';

describe('deriveConnectionState', () => {
  it('is offline whenever the browser is offline, regardless of channel status', () => {
    expect(deriveConnectionState(false, ['SUBSCRIBED', 'SUBSCRIBED', 'SUBSCRIBED'])).toBe('offline');
    expect(deriveConnectionState(false, [])).toBe('offline');
  });

  it('is live when online and every channel is subscribed', () => {
    expect(deriveConnectionState(true, ['SUBSCRIBED', 'SUBSCRIBED', 'SUBSCRIBED'])).toBe('live');
  });

  it('is connecting when online but a channel has not subscribed yet', () => {
    // Fresh mount: no status has arrived for any channel.
    expect(deriveConnectionState(true, [undefined, undefined, undefined])).toBe('connecting');
    // One channel still coming up.
    expect(deriveConnectionState(true, ['SUBSCRIBED', undefined, 'SUBSCRIBED'])).toBe('connecting');
  });

  it('is connecting when online but a channel has errored or closed', () => {
    expect(deriveConnectionState(true, ['SUBSCRIBED', 'CHANNEL_ERROR', 'SUBSCRIBED'])).toBe('connecting');
    expect(deriveConnectionState(true, ['SUBSCRIBED', 'TIMED_OUT', 'SUBSCRIBED'])).toBe('connecting');
    expect(deriveConnectionState(true, ['CLOSED', 'SUBSCRIBED', 'SUBSCRIBED'])).toBe('connecting');
  });

  it('treats an empty channel list as connecting (no sockets reported up yet)', () => {
    expect(deriveConnectionState(true, [])).toBe('connecting');
  });
});

describe('computeConnectionIndicator', () => {
  it('shows a green, non-pulsing pill when live', () => {
    const indicator = computeConnectionIndicator('live');
    expect(indicator.text).toBe('Live');
    expect(indicator.dot).toBe('bg-green-500');
    expect(indicator.pulse).toBe(false);
  });

  it('shows an amber, pulsing pill while reconnecting', () => {
    const indicator = computeConnectionIndicator('connecting');
    expect(indicator.text).toBe('Reconnecting…');
    expect(indicator.dot).toBe('bg-amber-500');
    expect(indicator.pulse).toBe(true);
  });

  it('shows a red, pulsing pill when offline', () => {
    const indicator = computeConnectionIndicator('offline');
    expect(indicator.text).toBe('Offline — live updates paused');
    expect(indicator.dot).toBe('bg-red-500');
    expect(indicator.pulse).toBe(true);
  });
});
