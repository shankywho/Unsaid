import type { HTMLAttributes } from 'react';
import { cn } from './cn';

/**
 * Fade + 6px slide, 200 ms. Pure CSS and only under prefers-reduced-motion: no-preference,
 * so content is always in the DOM and visible by default (no scroll-triggered opacity:0).
 */
export function Reveal({ className, style, delay, ...rest }: HTMLAttributes<HTMLDivElement> & { delay?: number }) {
  return (
    <div
      className={cn('reveal', className)}
      style={delay ? { ...style, animationDelay: `${Math.round(delay * 1000)}ms` } : style}
      {...rest}
    />
  );
}
