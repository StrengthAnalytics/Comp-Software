import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePersistentIdSet } from '@/lib/use-persistent-id-set';

const KEY = 'entries:expanded:comp-1';

afterEach(() => {
  globalThis.localStorage.clear();
});

describe('usePersistentIdSet', () => {
  it('starts with every id collapsed', () => {
    const { result } = renderHook(() => usePersistentIdSet(KEY));
    const [has] = result.current;
    expect(has('a')).toBe(false);
  });

  it('toggles an id on and off, persisting each change', () => {
    const { result } = renderHook(() => usePersistentIdSet(KEY));

    act(() => result.current[1]('a'));
    expect(result.current[0]('a')).toBe(true);
    expect(JSON.parse(globalThis.localStorage.getItem(KEY) ?? '[]')).toEqual(['a']);

    act(() => result.current[1]('a'));
    expect(result.current[0]('a')).toBe(false);
    expect(JSON.parse(globalThis.localStorage.getItem(KEY) ?? '[]')).toEqual([]);
  });

  it('restores the saved set on mount', () => {
    globalThis.localStorage.setItem(KEY, JSON.stringify(['a', 'b']));
    const { result } = renderHook(() => usePersistentIdSet(KEY));
    expect(result.current[0]('a')).toBe(true);
    expect(result.current[0]('b')).toBe(true);
    expect(result.current[0]('c')).toBe(false);
  });

  it('falls back to all-collapsed for a corrupt or wrong-shaped stored value', () => {
    globalThis.localStorage.setItem(KEY, 'not json');
    const corrupt = renderHook(() => usePersistentIdSet(KEY));
    expect(corrupt.result.current[0]('a')).toBe(false);

    globalThis.localStorage.setItem(KEY, JSON.stringify({ a: true }));
    const wrongShape = renderHook(() => usePersistentIdSet(KEY));
    expect(wrongShape.result.current[0]('a')).toBe(false);
  });

  it('keeps separately keyed lists independent', () => {
    const first = renderHook(() => usePersistentIdSet(KEY));
    act(() => first.result.current[1]('a'));

    const second = renderHook(() => usePersistentIdSet('submissions:expanded:comp-1'));
    expect(second.result.current[0]('a')).toBe(false);
  });
});
