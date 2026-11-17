// The standard full-width text box / drop-down / message box for forms people fill in on phones.
// 14px text with a mouse, 16px on a touch screen (pointer-coarse, the same test as
// TOUCH_SCREEN_MEDIA_QUERY): iPhone Safari zooms the whole page in when a field under 16px gets focus,
// cropping the form, in portrait and landscape alike. Pinch-zoom is left alone.
export const FORM_INPUT_CLASS =
  'mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none pointer-coarse:text-base';
