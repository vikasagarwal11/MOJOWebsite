import { useEffect, useRef } from 'react';

type Options = {
  /** How long to press before entering preview mode (ms) */
  pressDelay?: number;
  /** Movement threshold before we assume the user is scrolling (px) */
  moveThreshold?: number;
  /** How often to process pointermove while previewing (ms) */
  moveThrottleMs?: number;
  /** CSS selector that returns the card element; it must contain the <video> */
  cardSelector?: string;
  /** Find the <video> from a card element (default: card.querySelector('video')) */
  getVideoEl?: (card: Element | null) => HTMLVideoElement | null;
  /** Enable desktop hover preview */
  enableDesktopHover?: boolean;
  /** Hover delay for desktop (ms) */
  hoverDelayMs?: number;
};

export function useFingerPreviewOnGrid(
  gridRef: React.RefObject<HTMLElement>,
  opts: Options = {}
) {
  const pressDelay = opts.pressDelay ?? 120;
  const moveThreshold = opts.moveThreshold ?? 14;
  const moveThrottleMs = opts.moveThrottleMs ?? 50;
  const cardSelector = opts.cardSelector ?? '[data-media-card]';
  const getVideoEl = opts.getVideoEl ?? ((el) => (el?.querySelector('video') as HTMLVideoElement | null) || null);
  const enableDesktopHover = opts.enableDesktopHover ?? true;
  const hoverDelayMs = opts.hoverDelayMs ?? 120;

  const state = useRef<{
    active: boolean;
    timer: number | null;
    startX: number;
    startY: number;
    lastMoveTs: number;
    currentVideo: HTMLVideoElement | null;
  }>({ active: false, timer: null, startX: 0, startY: 0, lastMoveTs: 0, currentVideo: null });

  useEffect(() => {
    const grid = gridRef.current;
    console.log('🔍 useFingerPreviewOnGrid: grid ref:', grid, 'type:', typeof grid);
    if (!grid || !(grid instanceof HTMLElement)) {
      console.log('❌ useFingerPreviewOnGrid: Invalid grid ref, skipping hook setup');
      return;
    }
    console.log('✅ useFingerPreviewOnGrid: Setting up event listeners on:', grid);

    let hoverTimer: number | null = null;
    let lastHoverCard: Element | null = null;

    const clearTimer = () => {
      if (state.current.timer != null) {
        window.clearTimeout(state.current.timer);
        state.current.timer = null;
      }
    };

    const clearHoverTimer = () => {
      if (hoverTimer != null) {
        window.clearTimeout(hoverTimer);
        hoverTimer = null;
      }
    };

    const pauseVideo = (v: HTMLVideoElement | null) => {
      if (!v) return;
      // Stop HLS loading to prevent bandwidth spikes
      (v as any)._hls?.stopLoad?.();
      v.pause();
      // Keep buffer/time if you want the lightbox to resume; don't reset currentTime
      v.muted = true;
    };

    const playVideo = (v: HTMLVideoElement | null) => {
      if (!v) return;
      v.muted = true;
      v.playsInline = true;
      v.play().catch(() => {
        // Silently handle autoplay failures
      });
    };

    const pickCardAtPoint = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return null;
      return el.closest(cardSelector);
    };

    const startPreviewAt = (x: number, y: number) => {
      const card = pickCardAtPoint(x, y);
      const next = getVideoEl(card);
      const curr = state.current.currentVideo;
      if (next && next !== curr) {
        pauseVideo(curr);
        state.current.currentVideo = next;
        playVideo(next);
      }
    };

    const startPreviewOnCard = (card: Element | null) => {
      const next = getVideoEl(card);
      if (next && next !== state.current.currentVideo) {
        pauseVideo(state.current.currentVideo);
        state.current.currentVideo = next;
        playVideo(next);
      }
    };

    const beginPreviewMode = () => {
      state.current.active = true;
      grid.classList.add('previewing'); // to disable scroll (see CSS below)
    };

    const endPreviewMode = () => {
      state.current.active = false;
      grid.classList.remove('previewing');
      pauseVideo(state.current.currentVideo);
      state.current.currentVideo = null;
    };

    // Touch/Mobile handlers
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return; // only for touch
      state.current.startX = e.clientX;
      state.current.startY = e.clientY;
      state.current.lastMoveTs = 0;

      clearTimer();
      // enter preview only if the user holds briefly (prevents accidental triggers while scrolling)
      state.current.timer = window.setTimeout(() => {
        beginPreviewMode();
        startPreviewAt(e.clientX, e.clientY);
      }, pressDelay);
    };

    const onPointerMove = (e: PointerEvent) => {
      // if not yet active, see if user is scrolling (cancel preview)
      if (!state.current.active) {
        const dx = Math.abs(e.clientX - state.current.startX);
        const dy = Math.abs(e.clientY - state.current.startY);
        if (dx > moveThreshold || dy > moveThreshold) {
          // user is likely scrolling → cancel entering preview
          clearTimer();
        }
        return;
      }

      // throttle while active
      const now = performance.now();
      if (now - state.current.lastMoveTs < moveThrottleMs) return;
      state.current.lastMoveTs = now;

      startPreviewAt(e.clientX, e.clientY);
    };

    const onPointerUpOrCancel = () => {
      clearTimer();
      if (state.current.active) endPreviewMode();
    };

    // Desktop hover handlers
    const onPointerOver = (e: PointerEvent) => {
      if (!enableDesktopHover || e.pointerType !== 'mouse' || state.current.active) return;
      // pick the card under the pointer
      const card = (e.target as Element | null)?.closest(cardSelector);
      if (!card || card === lastHoverCard) return;
      lastHoverCard = card;

      clearHoverTimer();
      hoverTimer = window.setTimeout(() => startPreviewOnCard(card), hoverDelayMs);
    };

    const onPointerOut = (e: PointerEvent) => {
      if (!enableDesktopHover || e.pointerType !== 'mouse' || state.current.active) return;
      // if we left the current card entirely, pause
      const toEl = e.relatedTarget as Element | null;
      const leftCard = (e.target as Element | null)?.closest(cardSelector);
      if (leftCard && (!toEl || !toEl.closest(cardSelector))) {
        clearHoverTimer();
        pauseVideo(state.current.currentVideo);
        state.current.currentVideo = null;
        lastHoverCard = null;
      }
    };

    // Register event listeners
    grid.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUpOrCancel, { passive: true });
    window.addEventListener('pointercancel', onPointerUpOrCancel, { passive: true });

    if (enableDesktopHover) {
      grid.addEventListener('pointerover', onPointerOver, { passive: true });
      grid.addEventListener('pointerout', onPointerOut, { passive: true });
    }

    return () => {
      clearTimer();
      clearHoverTimer();
      grid.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUpOrCancel);
      window.removeEventListener('pointercancel', onPointerUpOrCancel);
      if (enableDesktopHover) {
        grid.removeEventListener('pointerover', onPointerOver);
        grid.removeEventListener('pointerout', onPointerOut);
      }
      // safety: end mode if still on
      if (state.current.active) endPreviewMode();
    };
  }, [gridRef, pressDelay, moveThreshold, moveThrottleMs, cardSelector, getVideoEl, enableDesktopHover, hoverDelayMs]);
}
