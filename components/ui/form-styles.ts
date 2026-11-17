// Shared text box / drop-down / message box classes, so every field in the app is safe to tap on a phone.
//
// INPUT_TEXT_CLASS is the one rule: 14px text with a mouse, 16px on a touch screen (pointer-coarse, the
// same test as TOUCH_SCREEN_MEDIA_QUERY). iPhone Safari zooms the whole page in when a field under 16px
// gets focus, cropping the screen, in portrait and landscape alike. Pinch-zoom is left alone. Any field
// with its own compact styling (dense table cells, filters) should still use INPUT_TEXT_CLASS for its
// text size.
export const INPUT_TEXT_CLASS = 'text-sm pointer-coarse:text-base';

const INPUT_BOX = `rounded-md border px-3 py-2 ${INPUT_TEXT_CLASS} text-neutral-900 focus:outline-none`;
// The standard bordered box. Width and spacing are left to the caller.
export const INPUT_CLASS = `${INPUT_BOX} border-neutral-300 focus:border-neutral-500`;
// Empty fields that must be filled before a lifter can be confirmed (e.g. weigh-in bodyweight/openers).
export const INPUT_REQUIRED_CLASS = `${INPUT_BOX} border-red-400 bg-red-50 focus:border-red-500`;
// The standard full-width field under its label, for forms.
export const FORM_INPUT_CLASS = `mt-1 block w-full ${INPUT_CLASS}`;
