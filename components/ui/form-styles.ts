// The standard full-width text box / drop-down / message box for forms people fill in on phones.
// 16px text below the sm breakpoint (text-base), 14px above it: iPhone Safari zooms the whole page in
// when a field under 16px gets focus, cropping the form. Pinch-zoom is left alone.
export const FORM_INPUT_CLASS =
  'mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-base text-neutral-900 focus:border-neutral-500 focus:outline-none sm:text-sm';
