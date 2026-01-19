import React, { useState } from 'react';
import { Toast, ToastType } from './common/Toast';
import { PaymentStatusAnimation } from './events/PaymentStatusAnimation';

/**
 * Demo page to preview payment animations
 * Use this for testing and demonstration purposes
 */
export const PaymentAnimationDemo: React.FC = () => {
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastType, setToastType] = useState<ToastType>('success');
  const [toastMessage, setToastMessage] = useState('');

  const handleShowToast = (type: ToastType, message: string) => {
    setToastType(type);
    setToastMessage(message);
    setShowToast(true);
    // Reset after toast closes
    setTimeout(() => setShowToast(false), 5000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-3">
            Payment Animations Demo
          </h1>
          <p className="text-gray-600">
            Preview success and error animations for payment flows
          </p>
        </div>

        {/* Animation Cards */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Success Animation Card */}
          <div className="bg-white rounded-2xl shadow-lg p-8 border-2 border-green-200">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Success Modal</h2>
              <p className="text-gray-600 text-sm mb-4">
                Confetti animation with auto-close
              </p>
            </div>

            <div className="space-y-3">
              <div className="bg-green-50 rounded-lg p-4">
                <h3 className="font-semibold text-green-900 mb-2 text-sm">Features:</h3>
                <ul className="text-sm text-green-700 space-y-1">
                  <li>• 50 animated confetti pieces</li>
                  <li>• Pulsing success icon</li>
                  <li>• Smooth scale & rotate entrance</li>
                  <li>• Auto-closes after 5 seconds</li>
                  <li>• Amount display with bounce-in</li>
                </ul>
              </div>

              <button
                onClick={() => setShowSuccessModal(true)}
                className="w-full px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold rounded-lg transition-all transform hover:scale-105 active:scale-95 shadow-lg shadow-green-500/50"
              >
                Show Success Animation
              </button>
            </div>
          </div>

          {/* Error Animation Card */}
          <div className="bg-white rounded-2xl shadow-lg p-8 border-2 border-red-200">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Error Modal</h2>
              <p className="text-gray-600 text-sm mb-4">
                Shake animation with manual close
              </p>
            </div>

            <div className="space-y-3">
              <div className="bg-red-50 rounded-lg p-4">
                <h3 className="font-semibold text-red-900 mb-2 text-sm">Features:</h3>
                <ul className="text-sm text-red-700 space-y-1">
                  <li>• Attention-grabbing shake effect</li>
                  <li>• Clear error icon with pulse</li>
                  <li>• User-friendly error message</li>
                  <li>• Manual close only (no auto-dismiss)</li>
                  <li>• Amount display for context</li>
                </ul>
              </div>

              <button
                onClick={() => setShowErrorModal(true)}
                className="w-full px-6 py-3 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-semibold rounded-lg transition-all transform hover:scale-105 active:scale-95 shadow-lg shadow-red-500/50"
              >
                Show Error Animation
              </button>
            </div>
          </div>
        </div>

        {/* Toast Notifications Section */}
        <div className="bg-white rounded-2xl shadow-lg p-8 border-2 border-blue-200">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Toast Notifications</h2>
            <p className="text-gray-600 text-sm">
              Lightweight notifications for quick feedback
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button
              onClick={() => handleShowToast('success', 'Payment processed successfully!')}
              className="px-4 py-3 bg-green-100 hover:bg-green-200 text-green-700 font-medium rounded-lg transition-colors"
            >
              Success Toast
            </button>
            <button
              onClick={() => handleShowToast('error', 'Payment failed. Please try again.')}
              className="px-4 py-3 bg-red-100 hover:bg-red-200 text-red-700 font-medium rounded-lg transition-colors"
            >
              Error Toast
            </button>
            <button
              onClick={() => handleShowToast('warning', 'Payment is being processed...')}
              className="px-4 py-3 bg-amber-100 hover:bg-amber-200 text-amber-700 font-medium rounded-lg transition-colors"
            >
              Warning Toast
            </button>
            <button
              onClick={() => handleShowToast('info', 'Check your email for confirmation.')}
              className="px-4 py-3 bg-blue-100 hover:bg-blue-200 text-blue-700 font-medium rounded-lg transition-colors"
            >
              Info Toast
            </button>
          </div>
        </div>

        {/* Technical Details */}
        <div className="mt-8 bg-gray-800 rounded-2xl shadow-lg p-8 text-white">
          <h2 className="text-2xl font-bold mb-4">Technical Details</h2>
          <div className="grid md:grid-cols-2 gap-6 text-sm">
            <div>
              <h3 className="font-semibold text-green-400 mb-2">Performance</h3>
              <ul className="space-y-1 text-gray-300">
                <li>• CSS-based animations (60fps)</li>
                <li>• Minimal React re-renders</li>
                <li>• Proper cleanup on unmount</li>
                <li>• Lazy modal rendering</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-blue-400 mb-2">Accessibility</h3>
              <ul className="space-y-1 text-gray-300">
                <li>• Focus trap within modals</li>
                <li>• Keyboard navigation (ESC)</li>
                <li>• Screen reader friendly</li>
                <li>• WCAG AA color contrast</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Usage Example */}
        <div className="mt-8 bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl shadow-lg p-8 border-2 border-purple-200">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Usage Example</h2>
          <pre className="bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto text-xs">
{`import { PaymentStatusAnimation } from './PaymentStatusAnimation';

// In your component
const [showSuccess, setShowSuccess] = useState(false);

// On payment success
const handlePaymentSuccess = () => {
  setShowSuccess(true);
};

// Render
{showSuccess && (
  <PaymentStatusAnimation
    status="success"
    amount={5000}  // $50.00
    currency="USD"
    onClose={() => setShowSuccess(false)}
    autoCloseDelay={5000}
  />
)}`}
          </pre>
        </div>
      </div>

      {/* Render Modals */}
      {showSuccessModal && (
        <PaymentStatusAnimation
          status="success"
          amount={12500} // $125.00
          currency="USD"
          onClose={() => setShowSuccessModal(false)}
          autoCloseDelay={5000}
        />
      )}

      {showErrorModal && (
        <PaymentStatusAnimation
          status="error"
          amount={12500} // $125.00
          currency="USD"
          onClose={() => setShowErrorModal(false)}
          autoCloseDelay={0}
        />
      )}

      {/* Render Toast */}
      {showToast && (
        <Toast
          type={toastType}
          message={toastMessage}
          duration={4000}
          onClose={() => setShowToast(false)}
        />
      )}
    </div>
  );
};
