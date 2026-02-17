import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

export function PageShell(props: { title: string; subtitle: string; children: ReactNode }) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.section
      initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.35, ease: 'easeOut' }}
      className="panel"
    >
      <h2>{props.title}</h2>
      <p className="panel-subtitle">{props.subtitle}</p>
      {props.children}
    </motion.section>
  );
}
