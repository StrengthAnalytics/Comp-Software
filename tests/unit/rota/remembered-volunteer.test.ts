import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  forgetRememberedVolunteer,
  loadRememberedVolunteer,
  saveRememberedVolunteer,
} from '@/lib/rota/remembered-volunteer';

const STORAGE_KEY = 'rota-volunteer-details';
const details = { name: 'Sam', email: 'sam@example.com', phone: '07700900002' };

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.localStorage.clear();
});

describe('remembered volunteer details', () => {
  it('saves, loads and forgets the details', () => {
    expect(loadRememberedVolunteer()).toBeNull();
    saveRememberedVolunteer(details);
    expect(loadRememberedVolunteer()).toEqual(details);
    forgetRememberedVolunteer();
    expect(loadRememberedVolunteer()).toBeNull();
  });

  it('ignores a corrupt or incomplete stored value', () => {
    globalThis.localStorage.setItem(STORAGE_KEY, '{not json');
    expect(loadRememberedVolunteer()).toBeNull();
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: 'Sam' }));
    expect(loadRememberedVolunteer()).toBeNull();
  });

  it('never throws when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadRememberedVolunteer()).toBeNull();
    expect(() => saveRememberedVolunteer(details)).not.toThrow();
    expect(() => forgetRememberedVolunteer()).not.toThrow();
  });
});
