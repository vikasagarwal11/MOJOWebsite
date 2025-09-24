import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

interface ReactionPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onReaction: (emoji: string) => void;
  userReactions: { [key: string]: boolean };
  triggerRef: React.RefObject<HTMLElement>;
  disabled?: boolean;
}

const EMOJIS = ['❤️', '😂', '😮', '👍', '👎', '😢', '😡'];

export const ReactionPicker: React.FC<ReactionPickerProps> = ({
  isOpen,
  onClose,
  onReaction,
  userReactions,
  triggerRef,
  disabled = false
}) => {
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [focusedIndex, setFocusedIndex] = useState(0);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Calculate position based on trigger element
  useEffect(() => {
    if (!isOpen || !triggerRef.current) return;
    
    const rect = triggerRef.current.getBoundingClientRect();
    const gap = 8;
    const pickerHeight = 60; // Approximate height of picker
    
    // Position above trigger by default, fallback below if not enough space
    const top = Math.max(gap, rect.top - pickerHeight - gap);
    const center = rect.left + rect.width / 2;
    const left = Math.min(window.innerWidth - gap, Math.max(gap, center));
    
    setPosition({ top, left });
  }, [isOpen, triggerRef]);

  // Focus management
  useEffect(() => {
    if (isOpen && buttonRefs.current[0]) {
      buttonRefs.current[0].focus();
      setFocusedIndex(0);
    }
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return;

    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        setFocusedIndex(prev => Math.min(prev + 1, EMOJIS.length - 1));
        break;
      case 'ArrowLeft':
        e.preventDefault();
        setFocusedIndex(prev => Math.max(prev - 1, 0));
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
  }, [isOpen, focusedIndex, onReaction, onClose]);

  // Simplified click outside to close - only close on escape key
  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  // Focus the correct button when focusedIndex changes
  useEffect(() => {
    if (buttonRefs.current[focusedIndex]) {
      buttonRefs.current[focusedIndex]?.focus();
    }
  }, [focusedIndex]);

  if (!isOpen) return null;

  console.log('🎨 [ReactionPicker] Rendering picker with', EMOJIS.length, 'emojis');

  return createPortal(
    <AnimatePresence>
      <motion.div
        ref={popoverRef}
        initial={{ opacity: 0, scale: 0.8, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.8, y: 10 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="fixed z-[9999] bg-white border border-gray-200 rounded-xl shadow-xl p-3 flex space-x-2"
        style={{ 
          top: position.top, 
          left: position.left, 
          transform: 'translateX(-50%)' 
        }}
        role="menu"
        aria-label="Reaction picker"
      >
        {EMOJIS.map((emoji, index) => (
          <button
            key={emoji}
            ref={el => buttonRefs.current[index] = el}
            onClick={() => {
              console.log('🎨 [ReactionPicker] Emoji clicked!', {
                emoji: emoji,
                disabled: disabled
              });
              if (!disabled) {
                console.log('🎨 [ReactionPicker] Calling onReaction with:', emoji);
                onReaction(emoji);
                onClose();
              } else {
                console.log('🎨 [ReactionPicker] Click ignored - disabled');
              }
            }}
            disabled={disabled}
            className={`
              text-xl p-2 rounded-full transition-all duration-200 
              hover:scale-125 hover:bg-gray-100 active:scale-95
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
              ${userReactions[emoji] 
                ? 'bg-blue-100 border-2 border-blue-300 text-blue-800' 
                : 'hover:shadow-md'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
            style={{ 
              animation: `slideInUp 0.${index * 0.1 + 0.1}s ease-out` 
            }}
            title={`React with ${emoji}`}
            role="menuitem"
            tabIndex={0}
          >
            {emoji}
          </button>
        ))}
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};
