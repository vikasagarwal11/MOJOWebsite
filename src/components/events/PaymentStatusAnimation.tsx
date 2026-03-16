import { CheckCircle, XCircle } from 'lucide-react';
import React, { useEffect, useState } from 'react';

interface PaymentStatusAnimationProps {
  status: 'success' | 'error';
  amount?: number;
  currency?: string;
  onClose?: () => void;
  autoCloseDelay?: number; // Auto close after delay (ms), 0 to disable
}

/**
 * Beautiful animated modal for payment success/failure
 * Features confetti animation for success and shake animation for errors
 */
export const PaymentStatusAnimation: React.FC<PaymentStatusAnimationProps> = ({
  status,
  amount,
  currency = 'USD',
  onClose,
  autoCloseDelay = 0,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [confettiPieces, setConfettiPieces] = useState<Array<{ id: number; left: number; delay: number; duration: number }>>([]);

  useEffect(() => {
    // Trigger entrance animation
    setIsVisible(true);

    // Generate confetti pieces for success animation
    if (status === 'success') {
      const pieces = Array.from({ length: 50 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.3,
        duration: 2 + Math.random() * 1,
      }));
      setConfettiPieces(pieces);
    }

    // Auto close timer
    if (autoCloseDelay > 0) {
      const timer = setTimeout(() => {
        handleClose();
      }, autoCloseDelay);
      return () => clearTimeout(timer);
    }
  }, [status, autoCloseDelay]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => {
      onClose?.();
    }, 300); // Wait for exit animation
  };

  const isSuccess = status === 'success';

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity duration-300 ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={handleClose}
      />

      {/* Modal */}
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none`}
      >
        <div
          className={`pointer-events-auto bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden transition-all duration-500 ${
            isVisible
              ? 'opacity-100 scale-100 translate-y-0'
              : 'opacity-0 scale-95 translate-y-4'
          } ${!isSuccess && isVisible ? 'animate-shake' : ''}`}
        >
          {/* Confetti Animation for Success */}
          {isSuccess && (
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              {confettiPieces.map((piece) => (
                <div
                  key={piece.id}
                  className="absolute w-2 h-2 animate-confetti"
                  style={{
                    left: `${piece.left}%`,
                    top: '-10px',
                    animationDelay: `${piece.delay}s`,
                    animationDuration: `${piece.duration}s`,
                    backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'][
                      Math.floor(Math.random() * 5)
                    ],
                  }}
                />
              ))}
            </div>
          )}

          {/* Success/Error Header with Gradient */}
          <div
            className={`relative px-6 py-8 ${
              isSuccess
                ? 'bg-gradient-to-br from-green-400 via-emerald-500 to-teal-600'
                : 'bg-gradient-to-br from-red-400 via-rose-500 to-pink-600'
            }`}
          >
            {/* Animated Icon */}
            <div className="flex justify-center">
              <div
                className={`relative ${
                  isSuccess ? 'animate-success-icon' : 'animate-error-icon'
                }`}
              >
                {isSuccess ? (
                  <div className="relative">
                    {/* Pulsing rings */}
                    <div className="absolute inset-0 bg-white/30 rounded-full animate-ping" />
                    <div className="absolute inset-0 bg-white/20 rounded-full animate-pulse" />
                    {/* Icon */}
                    <div className="relative bg-white rounded-full p-4 shadow-lg">
                      <CheckCircle className="w-16 h-16 text-green-600 animate-draw-check" />
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    {/* Error pulse */}
                    <div className="absolute inset-0 bg-white/30 rounded-full animate-pulse" />
                    {/* Icon */}
                    <div className="relative bg-white rounded-full p-4 shadow-lg">
                      <XCircle className="w-16 h-16 text-red-600" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-8 text-center">
            {/* Title */}
            <h2
              className={`text-2xl sm:text-3xl font-bold mb-3 ${
                isSuccess ? 'text-gray-900' : 'text-gray-900'
              }`}
            >
              {isSuccess ? 'Payment Successful!' : 'Payment Failed'}
            </h2>

            {/* Amount Display */}
            {amount !== undefined && (
              <div className={`mb-6 ${isSuccess ? 'animate-bounce-in' : ''}`}>
                <div
                  className={`inline-block px-6 py-3 rounded-xl ${
                    isSuccess
                      ? 'bg-green-50 border-2 border-green-200'
                      : 'bg-red-50 border-2 border-red-200'
                  }`}
                >
                  <p className="text-sm text-gray-600 mb-1">Amount {isSuccess ? 'Paid' : 'Attempted'}</p>
                  <p
                    className={`text-3xl font-bold ${
                      isSuccess ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    ${(amount / 100).toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1 uppercase">{currency}</p>
                </div>
              </div>
            )}

            {/* Message */}
            <p className="text-gray-600 mb-8 leading-relaxed">
              {isSuccess ? (
                <>
                  Your payment has been processed successfully.
                  <br />
                  You'll receive a confirmation email shortly.
                </>
              ) : (
                <>
                  We couldn't process your payment.
                  <br />
                  Please check your payment details and try again.
                </>
              )}
            </p>

            {/* Action Button */}
            <button
              onClick={handleClose}
              className={`w-full px-6 py-3 rounded-lg font-semibold text-white transition-all transform hover:scale-105 active:scale-95 ${
                isSuccess
                  ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 shadow-lg shadow-green-500/50'
                  : 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 shadow-lg shadow-red-500/50'
              }`}
            >
              {isSuccess ? 'Continue' : 'Try Again'}
            </button>
          </div>

          {/* Decorative Elements */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -z-10" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full blur-2xl -z-10" />
        </div>
      </div>

      {/* Custom Animations */}
      <style>{`
        @keyframes confetti {
          0% {
            transform: translateY(0) rotateZ(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotateZ(720deg);
            opacity: 0;
          }
        }

        @keyframes shake {
          0%, 100% {
            transform: translateX(0);
          }
          10%, 30%, 50%, 70%, 90% {
            transform: translateX(-4px);
          }
          20%, 40%, 60%, 80% {
            transform: translateX(4px);
          }
        }

        @keyframes success-icon {
          0% {
            transform: scale(0) rotate(-180deg);
            opacity: 0;
          }
          50% {
            transform: scale(1.1) rotate(10deg);
          }
          100% {
            transform: scale(1) rotate(0deg);
            opacity: 1;
          }
        }

        @keyframes error-icon {
          0% {
            transform: scale(0);
            opacity: 0;
          }
          50% {
            transform: scale(1.2);
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }

        @keyframes bounce-in {
          0% {
            transform: scale(0.3);
            opacity: 0;
          }
          50% {
            transform: scale(1.05);
          }
          70% {
            transform: scale(0.9);
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }

        @keyframes draw-check {
          0% {
            stroke-dasharray: 100;
            stroke-dashoffset: 100;
          }
          100% {
            stroke-dashoffset: 0;
          }
        }

        .animate-confetti {
          animation: confetti forwards;
        }

        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }

        .animate-success-icon {
          animation: success-icon 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        }

        .animate-error-icon {
          animation: error-icon 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        }

        .animate-bounce-in {
          animation: bounce-in 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55) 0.3s backwards;
        }

        .animate-draw-check {
          animation: draw-check 0.5s ease-out 0.3s backwards;
        }
      `}</style>
    </>
  );
};
