import { useEffect, useRef, useMemo } from 'react';

interface UseModalA11yProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ModalA11yReturn {
  dialogProps: {
    role: 'dialog';
    'aria-modal': boolean;
    ref: React.RefObject<HTMLDivElement>;
    onKeyDown: (e: React.KeyboardEvent) => void;
  };
  closeBtnRef: React.RefObject<HTMLButtonElement>;
}

/**
 * Hook to handle modal accessibility features
 * Manages escape key, scroll lock, and focus management
 * FIXED: Only focuses once on open, never steals focus from active inputs
 */
export const useModalA11y = ({ isOpen, onClose }: UseModalA11yProps): ModalA11yReturn => {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const hasFocusedOnOpen = useRef(false);

  // Focus only once when the dialog transitions from closed -> open.
  useEffect(() => {
    if (!isOpen) {
      hasFocusedOnOpen.current = false; // reset for the next time we open
      return;
    }
    if (hasFocusedOnOpen.current) return;
    hasFocusedOnOpen.current = true;

    // Defer to after paint; don't steal focus if an input already has it.
    requestAnimationFrame(() => {
      const active = document.activeElement as HTMLElement | null;
      const dialogEl = dialogRef.current;
      if (!dialogEl) return;

      const activeInsideDialog = active && dialogEl.contains(active);
      if (!activeInsideDialog) {
        closeBtnRef.current?.focus();
      }
    });
  }, [isOpen]);

  // Handle scroll lock
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = isOpen ? 'hidden' : previousOverflow;
    
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  const dialogProps = useMemo(
    () => ({
      role: 'dialog' as const,
      'aria-modal': true,
      ref: dialogRef,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      },
    }),
    [onClose]
  );

  return { dialogProps, closeBtnRef };
};
