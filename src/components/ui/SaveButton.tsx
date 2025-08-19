// src/components/ui/SaveButton.tsx
import React from 'react';
import { Check, Loader2 } from 'lucide-react';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  state: SaveState;
  children?: React.ReactNode; // label when idle
}

export const SaveButton: React.FC<Props> = ({ state, children, className = '', ...rest }) => {
  const isBusy = state === 'saving';

  return (
    <button
      {...rest}
      disabled={isBusy}
      className={[
        'inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full font-semibold',
        'transition-all duration-200 shadow-md focus:outline-none focus:ring-2 focus:ring-purple-500',
        isBusy
          ? 'bg-gray-300 text-gray-700 cursor-wait'
          : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700',
        className,
      ].join(' ')}
      aria-live="polite"
      aria-busy={isBusy}
    >
      {state === 'saving' && <Loader2 className="h-5 w-5 animate-spin" />}
      {state === 'saved' && <Check className="h-5 w-5" />}
      <span>
        {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : children ?? 'Save Changes'}
      </span>
    </button>
  );
};
