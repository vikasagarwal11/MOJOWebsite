/**
 * Zelle QR Modal Component
 * 
 * Displays a Zelle QR code for payment with:
 * - QR code image displayed in a modal
 * - 60-second countdown timer
 * - Auto-close after timer expires
 * - Email instruction modal after closing
 */

import { AnimatePresence, motion } from 'framer-motion';
import { Clock, Mail, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';

interface ZelleQRModalProps {
  isOpen: boolean;
  onClose: () => void;
  amount: number; // Amount in cents
}

export const ZelleQRModal: React.FC<ZelleQRModalProps> = ({ isOpen, onClose, amount }) => {
  const [timeRemaining, setTimeRemaining] = useState(60); // 60 seconds
  const [showEmailInstructions, setShowEmailInstructions] = useState(false);

  // Timer countdown
  useEffect(() => {
    if (!isOpen) {
      setTimeRemaining(60); // Reset timer when modal is closed
      return;
    }

    if (timeRemaining <= 0) {
      // Timer expired - close QR modal and show email instructions
      handleTimerExpired();
      return;
    }

    const timer = setInterval(() => {
      setTimeRemaining((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, timeRemaining]);

  const handleTimerExpired = () => {
    onClose(); // Close QR modal
    setShowEmailInstructions(true); // Show email instructions
  };

  const handleCloseEmailInstructions = () => {
    setShowEmailInstructions(false);
    setTimeRemaining(60); // Reset timer for next time
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <>
      {/* QR Code Modal */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
            onClick={onClose}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative"
            >
              {/* Close Button */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Close"
              >
                <X className="w-6 h-6" />
              </button>

              {/* Header */}
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">
                  Pay via Zelle
                </h3>
                <p className="text-lg font-semibold text-purple-600">
                  ${(amount / 100).toFixed(2)}
                </p>
              </div>

              {/* Timer */}
              <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-center justify-center gap-2">
                  <Clock className="w-5 h-5 text-amber-600" />
                  <span className="text-sm font-medium text-amber-900">
                    Time remaining: <span className="font-bold text-lg">{formatTime(timeRemaining)}</span>
                  </span>
                </div>
                <p className="text-xs text-amber-700 text-center mt-2">
                  Modal will auto-close after timer expires
                </p>
              </div>

              {/* QR Code Image */}
              <div className="mb-6 p-4 bg-gray-50 rounded-lg border-2 border-gray-200 flex items-center justify-center">
                <div className="w-64 h-64 bg-white rounded-lg flex items-center justify-center border border-gray-300">
                  {/* TODO: Replace with actual Zelle QR code image */}
                  <img
                    src="/assets/payment_qr/qr.png"
                    alt="Zelle QR Code"
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>

              {/* Instructions */}
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-900 text-center leading-relaxed">
                  <span className="font-semibold">Scan the QR code</span> with your banking app to complete the Zelle payment
                </p>
              </div>

              {/* Manual Close Button */}
              <button
                onClick={onClose}
                className="w-full px-4 py-3 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
              >
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Email Instructions Modal */}
      <AnimatePresence>
        {showEmailInstructions && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
            onClick={handleCloseEmailInstructions}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative"
            >
              {/* Close Button */}
              <button
                onClick={handleCloseEmailInstructions}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Close"
              >
                <X className="w-6 h-6" />
              </button>

              {/* Header */}
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Mail className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  Next Step: Send Payment Proof
                </h3>
              </div>

              {/* Instructions */}
              <div className="mb-6 space-y-4">
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-900 leading-relaxed">
                    ⚠️ Your payment is <span className="font-bold">waiting for admin approval</span>
                  </p>
                </div>

                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-900 font-semibold mb-2">
                    Please send your payment screenshot to:
                  </p>
                  <a
                    href="mailto:momsfitnessmojo@gmail.com"
                    className="text-blue-600 hover:text-blue-700 font-bold text-base underline break-all"
                  >
                    momsfitnessmojo@gmail.com
                  </a>
                </div>

                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-700 leading-relaxed">
                    <span className="font-semibold">Important:</span> Your RSVP will be confirmed only after the admin verifies your payment screenshot.
                  </p>
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={handleCloseEmailInstructions}
                className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Mail className="w-5 h-5" />
                Got It
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
