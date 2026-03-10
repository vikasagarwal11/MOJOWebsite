import { AnimatePresence, motion } from 'framer-motion';
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

interface ReactionPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onReaction: (emoji: string) => void;
  userReactions: { [key: string]: boolean };
  triggerRef: React.RefObject<HTMLElement>;
  disabled?: boolean;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
}

// Keep this list aligned with allowed post reaction types.
const EMOJIS = ['❤️', '👍', '🎉', '🙌', '😂', '😮', '😢'];

const ARROW_SIZE = 12;
const VIEWPORT_GAP = 12;

const PILL_BUTTON_SIZE = 40;
const PILL_GAP_PX = 8;
const PILL_PADDING_PX = 24;

const idealPillWidth = () =>
  EMOJIS.length * PILL_BUTTON_SIZE +
  (EMOJIS.length - 1) * PILL_GAP_PX +
  PILL_PADDING_PX;

const EMOJI_LABELS: Record<string, string> = {
  '❤️': 'Heart',
  '👍': 'Like',
  '🎉': 'Celebrate',
  '🙌': 'Support',
  '😂': 'Funny',
  '😮': 'Wow',
  '😢': 'Sad',
};

export const ReactionPicker: React.FC<ReactionPickerProps> = ({
  isOpen,
  onClose,
  onReaction,
  userReactions,
  triggerRef,
  disabled = false,
  onPointerEnter,
  onPointerLeave,
}) => {
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [placement, setPlacement] = useState<'top' | 'bottom'>('top');
  const [arrowOffset, setArrowOffset] = useState(0);
  const [maxWidth, setMaxWidth] = useState<number | undefined>();
  const [focusedIndex, setFocusedIndex] = useState(0);

  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const updatePosition = useCallback(() => {
    const triggerEl = triggerRef.current;
    const popoverEl = popoverRef.current;
    if (!triggerEl || !popoverEl) return;

    const triggerRect = triggerEl.getBoundingClientRect();
    const popoverRect = popoverEl.getBoundingClientRect();
    const containerEl = triggerEl.closest('[data-reaction-container]') as HTMLElement | null;
    const containerRect = containerEl?.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const containerMaxWidth = containerRect
      ? Math.max(containerRect.width - VIEWPORT_GAP * 2, 220)
      : viewportWidth - VIEWPORT_GAP * 2;

    // Prefer a single-row pill wide enough for all emojis
    const preferred = Math.max(240, Math.min(560, idealPillWidth()));
    const computedMaxWidth = Math.min(preferred, containerMaxWidth, viewportWidth - 16);

    setMaxWidth((prev) =>
      prev === undefined || Math.abs(prev - computedMaxWidth) > 0.5 ? computedMaxWidth : prev
    );

    const boundsLeft = containerRect ? containerRect.left + VIEWPORT_GAP : VIEWPORT_GAP;
    const boundsRight = containerRect
      ? containerRect.right - VIEWPORT_GAP
      : viewportWidth - VIEWPORT_GAP;

    const idealLeft = triggerRect.left + triggerRect.width / 2 - popoverRect.width / 2;
    const maxLeft = Math.max(boundsRight - popoverRect.width, boundsLeft);
    const clampedLeft = Math.min(Math.max(idealLeft, boundsLeft), maxLeft);

    const topIfAbove = triggerRect.top - popoverRect.height - VIEWPORT_GAP;
    const topIfBelow = triggerRect.bottom + VIEWPORT_GAP;
    const spaceAbove = triggerRect.top - VIEWPORT_GAP;
    const spaceBelow = viewportHeight - triggerRect.bottom - VIEWPORT_GAP;

    let nextPlacement: 'top' | 'bottom' = 'top';
    let nextTop = topIfAbove;

    if (topIfAbove < VIEWPORT_GAP && spaceBelow >= popoverRect.height) {
      nextPlacement = 'bottom';
      nextTop = topIfBelow;
    } else if (topIfAbove < VIEWPORT_GAP) {
      nextPlacement = 'bottom';
      nextTop = Math.min(topIfBelow, viewportHeight - popoverRect.height - VIEWPORT_GAP);
    } else if (spaceBelow < popoverRect.height && spaceAbove >= popoverRect.height) {
      nextPlacement = 'top';
      nextTop = Math.max(VIEWPORT_GAP, topIfAbove);
    }

    const triggerCenter = triggerRect.left + triggerRect.width / 2;
    const relativeArrow = triggerCenter - clampedLeft;
    const clampedArrow = Math.min(
      Math.max(relativeArrow, ARROW_SIZE + 6),
      popoverRect.width - ARROW_SIZE - 6
    );

    setPlacement(nextPlacement);
    setPosition({ top: nextTop, left: clampedLeft });
    setArrowOffset(clampedArrow);
  }, [triggerRef]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    const frame = requestAnimationFrame(updatePosition);
    return () => cancelAnimationFrame(frame);
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;
    const handle = () => updatePosition();
    window.addEventListener('resize', handle);
    window.addEventListener('scroll', handle, true);
    return () => {
      window.removeEventListener('resize', handle);
      window.removeEventListener('scroll', handle, true);
    };
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (isOpen && buttonRefs.current[0]) {
      buttonRefs.current[0].focus();
      setFocusedIndex(0);
    }
  }, [isOpen]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          setFocusedIndex((prev) => Math.min(prev + 1, EMOJIS.length - 1));
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setFocusedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          onReaction(EMOJIS[focusedIndex]);
          onClose();
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [isOpen, focusedIndex, onReaction, onClose]
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  useEffect(() => {
    const button = buttonRefs.current[focusedIndex];
    if (button) button.focus();
  }, [focusedIndex]);

  // ✅ Premium animation config
  const popoverMotion = {
    initial: { opacity: 0, scale: 0.92, y: 10, rotate: -1 },
    animate: { opacity: 1, scale: 1, y: 0, rotate: 0 },
    exit: { opacity: 0, scale: 0.96, y: 12, rotate: 1 },
    transition: { type: 'spring', stiffness: 420, damping: 30, mass: 0.7 },
  };

  return createPortal(
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          ref={popoverRef}
          data-reaction-picker="true"
          role="menu"
          aria-label="Reaction picker"
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
          {...popoverMotion}
          className="
            fixed z-[9999]
            inline-flex items-center justify-center
            rounded-full
            border border-white/60
            bg-white/70
            px-3 py-2
            shadow-[0_20px_60px_rgba(0,0,0,0.18)]
            backdrop-blur-xl
          "
          style={{
            top: position.top,
            left: position.left,
            width: Math.min(maxWidth ?? idealPillWidth(), idealPillWidth()),
          }}
        >
          {/* ✅ subtle premium gradient overlay */}
          <div
            className="
              pointer-events-none absolute inset-0 rounded-full
              bg-gradient-to-b from-white/70 to-white/35
            "
          />

          {/* ✅ Arrow */}
          <div
            className="
              pointer-events-none absolute
              h-3 w-3 rotate-45
              bg-white/70
              border border-white/60
              backdrop-blur-xl
              shadow-md
            "
            style={{
              left: arrowOffset - ARROW_SIZE / 2,
              ...(placement === 'top'
                ? { bottom: -ARROW_SIZE / 2 }
                : { top: -ARROW_SIZE / 2 }),
            }}
          />

          {/* ✅ Emoji Row */}
          <div
            className="relative flex flex-nowrap items-center justify-center gap-2"
            style={{
              transform: `scale(${
                Math.min(
                  1,
                  Math.min(maxWidth ?? idealPillWidth(), idealPillWidth()) / idealPillWidth()
                )
              })`,
              transformOrigin: 'center',
            }}
          >
            {EMOJIS.map((emoji, index) => {
              const selected = !!userReactions[emoji];

              return (
                <motion.button
                  key={emoji}
                  ref={(el) => {
                    buttonRefs.current[index] = el;
                  }}
                  type="button"
                  role="menuitem"
                  tabIndex={0}
                  disabled={disabled}
                  title={
                    EMOJI_LABELS[emoji]
                      ? `${EMOJI_LABELS[emoji]} ${emoji}`
                      : `React ${emoji}`
                  }
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!disabled) {
                      onReaction(emoji);
                      onClose();
                    }
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  whileHover={
                    disabled
                      ? undefined
                      : {
                          y: -4,
                          scale: 1.14,
                        }
                  }
                  whileTap={disabled ? undefined : { scale: 0.95 }}
                  transition={{ type: 'spring', stiffness: 650, damping: 28 }}
                  className={[
                    'group relative flex h-10 w-10 items-center justify-center rounded-full text-xl',
                    'focus:outline-none focus:ring-2 focus:ring-[#F25129]/60 focus:ring-offset-2',
                    selected
                      ? 'bg-[#F25129]/14 ring-1 ring-[#F25129]/30 shadow-[0_8px_24px_rgba(242,81,41,0.25)]'
                      : 'bg-white/70 ring-1 ring-black/5 hover:bg-white/90',
                    disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
                  ].join(' ')}
                >
                  {/* ✅ emoji */}
                  <span className="relative z-10">{emoji}</span>

                  {/* ✅ hover glow */}
                  <span
                    className="
                      pointer-events-none absolute inset-0 rounded-full
                      opacity-0 blur-md transition-opacity duration-200
                      group-hover:opacity-100
                      bg-[#F25129]/20
                    "
                  />

                  {/* ✅ mini label tooltip */}
                  <AnimatePresence>
                    {(focusedIndex === index || (!disabled && undefined)) && null}
                  </AnimatePresence>

                  <span
                    className="
                      pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2
                      rounded-full bg-black/75 px-2.5 py-1
                      text-[11px] text-white
                      opacity-0 translate-y-1
                      transition-all duration-200
                      group-hover:opacity-100 group-hover:translate-y-0
                    "
                  >
                    {EMOJI_LABELS[emoji] ?? 'React'}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
};
