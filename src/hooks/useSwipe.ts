import { useRef, useCallback } from 'react';

type SwipeOpts = {
  onLeft?: () => void;
  onRight?: () => void;
  onUp?: () => void;
  onDown?: () => void;
  /** distance in px to trigger a swipe when direction is locked */
  thresholdPx?: number;
  /** how "straight" the swipe must be (degrees from axis); larger = more permissive */
  angleLockDeg?: number;
  /** px/ms; fast flicks will trigger even with shorter distance */
  velocityPxMs?: number;
};

/**
 * Pointer-based swipe with:
 * - single binding target (parent/stage)
 * - direction lock by angle (no over-aggressive cancels)
 * - velocity escape hatch for quick flicks
 * - uses setPointerCapture on the single bound element (no tug-of-war)
 */
export function useSwipe({
  onLeft, onRight, onUp, onDown,
  thresholdPx = 28,
  angleLockDeg = 35,
  velocityPxMs = 0.35,
}: SwipeOpts = {}) {
  const startX = useRef(0);
  const startY = useRef(0);
  const startT = useRef(0);
  const activeId = useRef<number | null>(null);
  const swiping = useRef(false);

  // Avoid starting a swipe on interactive controls
  const INTERACTIVE = 'button, a, input, textarea, [role="button"], [data-no-swipe]';

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement)?.closest?.(INTERACTIVE)) return;

    activeId.current = e.pointerId;
    swiping.current = false;
    startX.current = e.clientX;
    startY.current = e.clientY;
    startT.current = e.timeStamp;

    // Capture on the single, bound element (the stage)
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (activeId.current !== e.pointerId) return;

    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;

    // Enter "swipe" mode after a tiny slop so taps still click
    if (!swiping.current && Math.max(Math.abs(dx), Math.abs(dy)) > 8) {
      swiping.current = true;
    }

    // Once panning, prevent scrolling/back-swipe
    if (swiping.current) e.preventDefault();
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (activeId.current !== e.pointerId) return;

    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    const dt = Math.max(1, e.timeStamp - startT.current); // ms
    const vX = Math.abs(dx) / dt;
    const vY = Math.abs(dy) / dt;

    if (swiping.current) {
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);

      // Direction lock by angle
      const rad = (90 - angleLockDeg) * Math.PI / 180;
      const tan = Math.tan(rad);        // ~0.7 by default
      const ratio = ay === 0 ? Infinity : ax / ay;

      const horizLocked = ratio > tan;       // mostly horizontal
      const vertLocked  = (1 / ratio) > tan; // mostly vertical

      const horizontalHit = horizLocked && (ax >= thresholdPx || vX >= velocityPxMs);
      const verticalHit   = vertLocked  && (ay >= thresholdPx || vY >= velocityPxMs);

      if (horizontalHit) {
        dx < 0 ? onLeft?.() : onRight?.();
      } else if (verticalHit) {
        dy < 0 ? onUp?.() : onDown?.();
      }
    }

    activeId.current = null;
    swiping.current = false;
  }, [onLeft, onRight, onUp, onDown, thresholdPx, angleLockDeg, velocityPxMs]);

  const cancel = useCallback(() => {
    activeId.current = null;
    swiping.current = false;
  }, []);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
  };
}
