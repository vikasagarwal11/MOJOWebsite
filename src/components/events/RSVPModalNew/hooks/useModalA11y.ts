import { useEffect, useRef } from 'react';

interface UseModalA11yProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ModalA11yReturn {
  dialogProps: {
    role: 'dialog';
    'aria-modal': boolean;
    'aria-labelledby': string;
  };
  closeBtnRef: React.RefObject<HTMLButtonElement>;
}

/**
 * Hook to handle modal accessibility features
 * Manages escape key, scroll lock, and focus management
 */
export const useModalA11y = ({ isOpen, onClose }: UseModalA11yProps): ModalA11yReturn => {
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    
    window.addEventListener('keydown', onKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = isOpen ? 'hidden' : previousOverflow;

    if (isOpen) {
      const modal = document.querySelector('[role="dialog"]') as HTMLElement | null;
      const firstFocusable = modal?.querySelector<
        HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
      (firstFocusable as HTMLElement | undefined)?.focus();
    }

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  return {
    dialogProps: {
      role: 'dialog',
      'aria-modal': true,
      'aria-labelledby': 'rsvp-title'
    },
    closeBtnRef
  };
};
