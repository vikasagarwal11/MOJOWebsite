
import React from 'react';
import ReactDOM from 'react-dom';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  message?: string;
};

const EventTeaserModal: React.FC<Props> = ({ open, onClose, title, message }) => {
  if (!open) return null;
  const body = (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-xl font-semibold">{title}</h3>
        <p className="text-gray-600 mt-2">{message || 'Sign in to see full details and RSVP.'}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded border">Close</button>
          <a href="/login" className="px-4 py-2 rounded bg-purple-600 text-white">Sign in</a>
        </div>
      </div>
    </div>
  );
  return ReactDOM.createPortal(body, document.body);
};
export default EventTeaserModal;
