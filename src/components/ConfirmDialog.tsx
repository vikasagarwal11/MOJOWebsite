import React from 'react';

export default function ConfirmDialog({
  open, title, message,
  confirmText = 'Delete', cancelText = 'Cancel',
  onConfirm, onCancel, danger = false,
}: {
  open: boolean;
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div role="dialog" aria-modal="true"
           className="w-full max-w-md rounded-2xl bg-white shadow-xl p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        {message && <p className="mt-2 text-gray-600">{message}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onCancel}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors">
            {cancelText}
          </button>
          <button onClick={onConfirm}
                  className={`px-4 py-2 rounded-lg text-white font-medium transition-colors ${
                    danger 
                      ? 'bg-red-600 hover:bg-red-700 active:bg-red-800' 
                      : 'bg-purple-600 hover:bg-purple-700 active:bg-purple-800'
                  }`}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
