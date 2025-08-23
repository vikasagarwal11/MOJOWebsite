import { useRef, useCallback } from 'react';

type SwipeOpts = {
  onLeft?: () => void;
  onRight?: () => void;
  thresholdPx?: number;
  restraintPx?: number;
};

export function useSwipe({ onLeft, onRight, thresholdPx = 40, restraintPx = 30 }: SwipeOpts = {}) {
  const startX = useRef(0);
  const startY = useRef(0);
  const tracking = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    tracking.current = true;
    startX.current = e.clientX;
    startY.current = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!tracking.current) return;
    tracking.current = false;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    if (Math.abs(dx) >= thresholdPx && Math.abs(dy) <= restraintPx) {
      if (dx < 0) onLeft?.(); else onRight?.();
    }
  }, [onLeft, onRight, thresholdPx, restraintPx]);

  return { onPointerDown, onPointerUp };
}
