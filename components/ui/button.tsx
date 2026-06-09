import type { ButtonHTMLAttributes } from 'react';

// The platform's action vocabulary. One primary action per view (brand colour), secondary for
// everything routine, danger for destructive steps, ghost for low-emphasis inline actions.
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-300',
  secondary:
    'border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100 disabled:border-neutral-200 disabled:text-neutral-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
  ghost: 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 disabled:text-neutral-400',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-3 py-2 text-sm',
};

// The classes alone, for things that look like a button but aren't a <button> — typically a
// next/link styled as a call to action.
export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md'): string {
  return `inline-flex items-center justify-center gap-2 rounded-md font-medium ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} disabled:cursor-not-allowed`;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

// Standard button. `type` defaults to "button" (not the HTML default "submit") so a button inside
// a form never submits it by accident — pass type="submit" explicitly on the real submit action.
export function Button({ variant = 'primary', size = 'md', className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={`${buttonClasses(variant, size)} ${className ?? ''}`} {...rest} />;
}
