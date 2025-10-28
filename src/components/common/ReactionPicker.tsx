import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useLayoutEffect
} from 'react';
import { createPortal } from 'react-dom';

interface ReactionPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onReaction: (emoji: string) => void;
  userReactions: { [key: string]: boolean };
  triggerRef: React.RefObject<HTMLElement>;
  disabled?: boolean;
}

const EMOJIS = ['❤️', '😂', '😮', '👍', '👎', '😢', '😡'];
const ARROW_SIZE = 12;
const VIEWPORT_GAP = 12;

export const ReactionPicker: React.FC<ReactionPickerProps> = ({
  isOpen,
  onClose,
  onReaction,
  userReactions,
  triggerRef,
  disabled = false
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
      ? Math.max(containerRect.width - VIEWPORT_GAP * 2, 180)
      : viewportWidth - VIEWPORT_GAP * 2;
    const computedMaxWidth = Math.min(320, Math.max(180, containerMaxWidth), viewportWidth - 16);
    setMaxWidth((prev) =>
      prev === undefined || Math.abs(prev - computedMaxWidth) > 0.5 ? computedMaxWidth : prev
    );

    const boundsLeft = containerRect ? containerRect.left + VIEWPORT_GAP : VIEWPORT_GAP;
    const boundsRight = containerRect
      ? containerRect.right - VIEWPORT_GAP
      : viewportWidth - VIEWPORT_GAP;

    const idealLeft =
      triggerRect.left + triggerRect.width / 2 - popoverRect.width / 2;
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
      nextTop = Math.min(
        topIfBelow,
        viewportHeight - popoverRect.height - VIEWPORT_GAP
      );
    } else if (spaceBelow < popoverRect.height && spaceAbove >= popoverRect.height) {
      nextPlacement = 'top';
      nextTop = Math.max(VIEWPORT_GAP, topIfAbove);
    }

    const triggerCenter = triggerRect.left + triggerRect.width / 2;
    const relativeArrow = triggerCenter - clampedLeft;
    const clampedArrow = Math.min(
      Math.max(relativeArrow, ARROW_SIZE + 4),
      popoverRect.width - ARROW_SIZE - 4
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
    if (button) {
      button.focus();
    }
  }, [focusedIndex]);

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={popoverRef}
      className="fixed z-[9999] flex flex-wrap items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-xl"
      style={{
        top: position.top,
        left: position.left,
        maxWidth: maxWidth ?? 320
      }}
      role="menu"
      aria-label="Reaction picker"
    >
      <div
        className="pointer-events-none absolute h-3 w-3 rotate-45 border border-gray-200 bg-white"
        style={{
          left: arrowOffset - ARROW_SIZE / 2,
          ...(placement === 'top'
            ? { bottom: -ARROW_SIZE / 2 }
            : { top: -ARROW_SIZE / 2 })
        }}
      />

      {EMOJIS.map((emoji, index) => (
        <button
          key={emoji}
          ref={(el) => {
            buttonRefs.current[index] = el;
          }}
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
          disabled={disabled}
          className={`
            flex h-10 w-10 items-center justify-center rounded-full text-xl transition-transform duration-150
            hover:scale-110 hover:bg-gray-100 active:scale-95
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
            ${
              userReactions[emoji]
                ? 'border-2 border-blue-300 bg-blue-100 text-blue-800'
                : 'border border-transparent hover:shadow-md'
            }
            ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
          `}
          title={`React with ${emoji}`}
          role="menuitem"
          tabIndex={0}
        >
          {emoji}
        </button>
      ))}
    </div>,
    document.body
  );
};
