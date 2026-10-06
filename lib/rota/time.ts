// Time formatting for the volunteer rota. The rota speaks in the organisers' own clock style —
// "8:30am", "12:20pm" — as their Google-Sheet rota did. Arrive-by times and column subtitles are
// free text, so older rows may still hold 24-hour "08:30"; the display helpers below convert those
// on the way out without touching anything else the admin typed.

const HH_MM = /^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

// "08:30" / "08:30:00" / "8:30" → "8:30am"; "12:20" → "12:20pm"; "00:15" → "12:15am". Null for
// anything that isn't a 24-hour time of day.
export function toTwelveHourClock(time: string | null): string | null {
  if (!time) {
    return null;
  }
  const match = HH_MM.exec(time.trim());
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const suffix = hours < 12 ? 'am' : 'pm';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${match[2]}${suffix}`;
}

// An arrive-by value for display: a bare 24-hour time becomes "8:30am"; any other text (already
// "8:30am", "doors open", …) is shown as the admin typed it.
export function displayRotaTime(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  return toTwelveHourClock(trimmed) ?? trimmed;
}

// Converts the 24-hour times the old "Generate from sessions" wrote into column subtitles
// ("Weigh-in 08:00 · Lift-off 10:00") to the 12-hour style. Only a zero-padded "HH:MM" straight after
// "Weigh-in " or "Lift-off " is touched, so anything the admin typed by hand (e.g. "11:00-12:30pm",
// where guessing am/pm could be wrong) is shown exactly as written.
export function humaniseRotaTimes(text: string | null): string | null {
  if (text === null) {
    return null;
  }
  return text.replaceAll(
    /\b(Weigh-in|Lift-off) (([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?)\b(?![-–\s]*[\dap])/gi,
    (token, label: string, time: string) => {
      const converted = toTwelveHourClock(time);
      return converted ? `${label} ${converted}` : token;
    },
  );
}
