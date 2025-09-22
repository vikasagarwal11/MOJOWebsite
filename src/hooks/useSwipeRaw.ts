// hooks/useSwipeRaw.ts
import { useEffect, useRef } from 'react';

type SwipeOpts = {
  onLeft?: () => void;
  onRight?: () => void;
  onUp?: () => void;
  onDown?: () => void;

  /** distance to trigger */
  thresholdPx?: number;
  /** perpendicular tolerance before we cancel a locked axis */
  restraintPx?: number;
  /** distance before we consider it a pan, not a tap */
  slopPx?: number;
  /** 'x' | 'y' | 'auto' | 'any' (default 'auto' that locks to dominant axis) */
  axis?: 'x' | 'y' | 'auto' | 'any';
  /** ignore swipes that start near left/right edge (iOS back/forward) */
  edgeGuardPx?: number;
  /** allow mouse swipes (for desktop testing) */
  allowMouse?: boolean;
  /** set true to detach listeners */
  disabled?: boolean;
  /** dev logs */
  debug?: boolean;
};

const INTERACTIVE = 'button, a, input, textarea, [role="button"], [data-no-swipe]';

function useLatest<T>(value: T) {
  const r = useRef(value);
  r.current = value;
  return r;
}

/**
 * Native, passive:false pointer listeners bound to a single element via ref.
 * Usage:
 *   const bindSwipeRef = useSwipeRaw<HTMLDivElement>({...});
 *   <div ref={bindSwipeRef}>...</div>
 */
export function useSwipeRaw<T extends HTMLElement = HTMLDivElement>(opts: SwipeOpts) {
  const optsRef = useLatest(opts);
  const nodeRef = useRef<T | null>(null);

  useEffect(() => {
    const el = nodeRef.current;
    if (!el || optsRef.current.disabled) {
      console.log('[SWIPE] Hook disabled or no element:', { el: !!el, disabled: optsRef.current.disabled });
      return;
    }
    console.log('[SWIPE] Binding swipe listeners to element:', el);

    let pointerId: number | null = null;
    let startX = 0, startY = 0;
    let swiping = false;
    let axisLock: 'x' | 'y' | 'unknown' = 'unknown';

    const thresholdPx = optsRef.current.thresholdPx ?? 20;
    const restraintPx = optsRef.current.restraintPx ?? 80;
    const slopPx = optsRef.current.slopPx ?? 8;
    const axis = optsRef.current.axis ?? 'auto';
    const edgeGuardPx = optsRef.current.edgeGuardPx ?? 24;
    const allowMouse = !!optsRef.current.allowMouse;
    const debug = !!optsRef.current.debug;

    const log = (...args: any[]) => debug && console.log('[SWIPE]', ...args);

    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' && !allowMouse) return;
      if ((e.target as HTMLElement)?.closest?.(INTERACTIVE)) return;

      // iOS back/forward edge-gesture guard
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // For vertical axis, guard top/bottom edges; for horizontal, guard left/right edges
      if (axis === 'y' || axis === 'auto') {
        if (y < edgeGuardPx || y > rect.height - edgeGuardPx) {
          log('edge-guard: ignore start near top/bottom edge');
          return;
        }
      }
      if (axis === 'x' || axis === 'auto') {
        if (x < edgeGuardPx || x > rect.width - edgeGuardPx) {
          log('edge-guard: ignore start near left/right edge');
          return;
        }
      }

      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      swiping = false;
      axisLock = 'unknown';

      try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch {}
      // DO NOT preventDefault on down; only once we detect a pan.
      log('down', { x: startX, y: startY, pointerId });
    };

    const onMove = (e: PointerEvent) => {
      if (pointerId == null || e.pointerId !== pointerId) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (!swiping) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < slopPx) return;
        swiping = true;

        // lock axis
        if (axis === 'auto') axisLock = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
        else if (axis === 'x' || axis === 'y') axisLock = axis;
        else axisLock = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';

        log('pan start', { dx, dy, axisLock });
      }

      // Once panning, stop browser scroll/zoom stealing the gesture
      e.preventDefault();

      // cancel swiping if it becomes too diagonal for the locked axis
      if (axisLock === 'x' && Math.abs(dy) > restraintPx) { log('cancel: diagonal on x', { dx, dy }); reset(); }
      if (axisLock === 'y' && Math.abs(dx) > restraintPx) { log('cancel: diagonal on y', { dx, dy }); reset(); }
    };

    const onUp = (e: PointerEvent) => {
      if (pointerId == null || e.pointerId !== pointerId) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (swiping) {
        // horizontal
        if ((axisLock !== 'y') && Math.abs(dx) >= thresholdPx && Math.abs(dy) <= restraintPx) {
          log('trigger', dx < 0 ? 'LEFT' : 'RIGHT', { dx, dy });
          dx < 0 ? optsRef.current.onLeft?.() : optsRef.current.onRight?.();
        }
        // vertical
        else if ((axisLock !== 'x') && Math.abs(dy) >= thresholdPx && Math.abs(dx) <= restraintPx) {
          log('trigger', dy < 0 ? 'UP' : 'DOWN', { dx, dy });
          dy < 0 ? optsRef.current.onUp?.() : optsRef.current.onDown?.();
        } else {
          log('no trigger', { dx, dy, axisLock });
        }
      } else {
        log('tap');
      }

      try { (e.target as Element).releasePointerCapture?.(e.pointerId); } catch {}
      reset();
    };

    const onCancel = () => { reset(); };

    function reset() {
      pointerId = null;
      swiping = false;
      axisLock = 'unknown';
    }

    const opt: AddEventListenerOptions = { passive: false };
    el.addEventListener('pointerdown', onDown, opt);
    el.addEventListener('pointermove', onMove, opt);
    el.addEventListener('pointerup', onUp, opt);
    el.addEventListener('pointercancel', onCancel, opt);
    el.addEventListener('pointerleave', onCancel, opt);

    // Ensure correct touch-action on the element (do not force globally)
    const prevTouchAction = el.style.touchAction;
    if (!prevTouchAction) {
      // For TikTok-style vertical swipes, allow horizontal pan but own vertical
      el.style.touchAction = axis === 'y' ? 'pan-x pinch-zoom' : 'pan-y pinch-zoom';
    }

    return () => {
      el.removeEventListener('pointerdown', onDown, opt);
      el.removeEventListener('pointermove', onMove, opt);
      el.removeEventListener('pointerup', onUp, opt);
      el.removeEventListener('pointercancel', onCancel, opt);
      el.removeEventListener('pointerleave', onCancel, opt);
      if (!prevTouchAction) el.style.touchAction = '';
    };
  }, [opts.disabled, opts.onUp, opts.onDown, opts.onLeft, opts.onRight]); // rebind if callbacks or disabled change

  return (node: T | null) => { nodeRef.current = node; };
}