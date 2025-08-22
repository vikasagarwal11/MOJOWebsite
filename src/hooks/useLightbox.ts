import { useCallback, useEffect, useState } from 'react';

export function useLightbox<T>(items: T[]) {
  const [index, setIndex] = useState<number | null>(null);
  const open = useCallback((i: number) => setIndex(i), []);
  const close = useCallback(() => setIndex(null), []);
  const next = useCallback(() => setIndex(i => (i==null?i:Math.min(i+1, items.length-1))), [items.length]);
  const prev = useCallback(() => setIndex(i => (i==null?i:Math.max(i-1, 0))), []);

  useEffect(() => {
    if (index == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, next, prev, close]);

  return { index, open, close, next, prev };
}