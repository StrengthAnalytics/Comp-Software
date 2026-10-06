import { describe, expect, it } from 'vitest';
import { displayRotaTime, humaniseRotaTimes, toTwelveHourClock } from '@/lib/rota/time';

describe('toTwelveHourClock', () => {
  it('converts 24-hour times to the rota style', () => {
    expect(toTwelveHourClock('08:30')).toBe('8:30am');
    expect(toTwelveHourClock('08:30:00')).toBe('8:30am');
    expect(toTwelveHourClock('12:20')).toBe('12:20pm');
    expect(toTwelveHourClock('17:00')).toBe('5:00pm');
    expect(toTwelveHourClock('00:15')).toBe('12:15am');
    expect(toTwelveHourClock('9:05')).toBe('9:05am');
  });

  it('is null for anything else', () => {
    expect(toTwelveHourClock(null)).toBeNull();
    expect(toTwelveHourClock('')).toBeNull();
    expect(toTwelveHourClock('8:30am')).toBeNull();
    expect(toTwelveHourClock('25:00')).toBeNull();
  });
});

describe('displayRotaTime', () => {
  it('converts a bare 24-hour time and keeps other text as typed', () => {
    expect(displayRotaTime('08:30')).toBe('8:30am');
    expect(displayRotaTime('9:30am')).toBe('9:30am');
    expect(displayRotaTime('doors open')).toBe('doors open');
  });

  it('is null for blank or missing values', () => {
    expect(displayRotaTime(null)).toBeNull();
    expect(displayRotaTime('   ')).toBeNull();
  });
});

describe('humaniseRotaTimes', () => {
  it('converts zero-padded 24-hour times inside text', () => {
    expect(humaniseRotaTimes('Weigh-in 08:00 · Lift-off 10:00 · Platform 1')).toBe(
      'Weigh-in 8:00am · Lift-off 10:00am · Platform 1',
    );
    expect(humaniseRotaTimes('Weigh-in 13:00:00')).toBe('Weigh-in 1:00pm');
  });

  it('leaves hand-written times alone', () => {
    expect(humaniseRotaTimes('Weigh in 7:00-8:30am')).toBe('Weigh in 7:00-8:30am');
    expect(humaniseRotaTimes('11:00-12:30pm')).toBe('11:00-12:30pm');
    expect(humaniseRotaTimes('Friday 8pm-10pm')).toBe('Friday 8pm-10pm');
    expect(humaniseRotaTimes('Weigh-in 11:00-12:30pm')).toBe('Weigh-in 11:00-12:30pm');
    expect(humaniseRotaTimes('Weigh-in 08:00 am')).toBe('Weigh-in 08:00 am');
    expect(humaniseRotaTimes('Arrive 08:00')).toBe('Arrive 08:00');
  });

  it('passes null through', () => {
    expect(humaniseRotaTimes(null)).toBeNull();
  });
});
