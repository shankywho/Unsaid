import { m, useReducedMotion, type HTMLMotionProps } from 'framer-motion';
import type { ReactNode } from 'react';

export const EASE = [0.22, 1, 0.36, 1] as const;

/** Fade + 8px slide, 150-300ms, ease-out. Becomes a plain element under prefers-reduced-motion. */
export function Reveal({
  children,
  delay = 0,
  y = 8,
  duration = 0.28,
  inView = false,
  ...rest
}: { children: ReactNode; delay?: number; y?: number; duration?: number; inView?: boolean } & Omit<
  HTMLMotionProps<'div'>,
  'children'
>) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={rest.className}>{children}</div>;
  const anim = { opacity: 1, y: 0 };
  return (
    <m.div
      {...rest}
      initial={{ opacity: 0, y }}
      {...(inView ? { whileInView: anim, viewport: { once: true, margin: '-60px' } } : { animate: anim })}
      transition={{ duration, delay, ease: EASE }}
    >
      {children}
    </m.div>
  );
}

export { useReducedMotion };
