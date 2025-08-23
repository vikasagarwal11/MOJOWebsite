import { useCallback, useEffect, useState } from 'react';
export function useLightbox<T>(items: T[], opts: { loop?: boolean } = {}) {
  const { loop = true } = opts;
  const [index, setIndex] = useState<number | null>(null);

  const open  = useCallback((i: number) => setIndex(i), []);
  const close = useCallback(() => setIndex(null), []);

  const next = useCallback(() => {
    setIndex(i => {
      if (i == null) return i;
      const last = items.length - 1;
      return (i >= last) ? (loop ? 0 : last) : i + 1;
    });
  }, [items.length, loop]);

  const prev = useCallback(() => {
    setIndex(i => {
      if (i == null) return i;
      const last = items.length - 1;
      return (i <= 0) ? (loop ? last : 0) : i - 1;
    });
  }, [items.length, loop]);

  useEffect(() => {
    if (index == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, close, next, prev]);

  return { index, open, close, next, prev };
}
