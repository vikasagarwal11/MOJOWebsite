import { getFunctions, httpsCallable } from 'firebase/functions';
import { Loader2, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';

interface OTPVerificationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onVerified: (sessionToken: string) => void;
    phone: string;
    email: string;
    firstName: string;
    lastName: string;
    eventId: string;
}

export const OTPVerificationModal: React.FC<OTPVerificationModalProps> = ({
    isOpen,
    onClose,
    onVerified,
    phone,
    email,
    firstName,
    lastName,
    eventId,
}) => {
    const [otp, setOtp] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [countdown, setCountdown] = useState(0);
    const [attemptsRemaining, setAttemptsRemaining] = useState(3);
    const otpSentRef = useRef(false); // Track if OTP has been sent for this modal session

    // Auto-send OTP when modal opens (only once per session)
    useEffect(() => {
        if (isOpen && countdown === 0 && !otpSentRef.current) {
            otpSentRef.current = true;
            sendOTP();
        }

        // Reset when modal closes
        if (!isOpen) {
            otpSentRef.current = false;
        }
    }, [isOpen]);

    // Countdown timer
    useEffect(() => {
        if (countdown > 0) {
            const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [countdown]);

    const sendOTP = async () => {
        setIsSending(true);
        try {
            const functions = getFunctions(undefined, 'us-east1');
            const sendOTPFn = httpsCallable<
                { phone: string; firstName: string; eventId: string },
                { success: boolean; requestId: string; attemptsRemaining: number; message?: string }
            >(functions, 'sendGuestOTP');

            const result = await sendOTPFn({ phone, firstName, eventId });

            if (result.data.success) {
                toast.success(`OTP sent to ${phone}`);
                setCountdown(30); // 30 second cooldown
                setAttemptsRemaining(result.data.attemptsRemaining);
            } else {
                toast.error(result.data.message || 'Failed to send OTP');
            }
        } catch (error: any) {
            console.error('Error sending OTP:', error);
            toast.error(error.message || 'Failed to send OTP. Please try again.');
        } finally {
            setIsSending(false);
        }
    };

    const verifyOTP = async () => {
        if (otp.length !== 6) {
            toast.error('Please enter a 6-digit code');
            return;
        }

        setIsVerifying(true);
        try {
            const functions = getFunctions(undefined, 'us-east1');
            const verifyOTPFn = httpsCallable<
                { phone: string; code: string; eventId: string; contactInfo: { firstName: string; lastName: string; email: string; phone: string } },
                { verified: boolean; sessionToken?: string; expiresAt?: string; error?: string; attemptsRemaining?: number }
            >(functions, 'verifyGuestOTP');

            const result = await verifyOTPFn({
                phone,
                code: otp,
                eventId,
                contactInfo: { firstName, lastName, email, phone },
            });

            if (result.data.verified && result.data.sessionToken) {
                toast.success('Phone verified successfully!');
                onVerified(result.data.sessionToken);
                onClose();
            } else {
                toast.error(result.data.error || 'Invalid OTP code');
                if (result.data.attemptsRemaining !== undefined) {
                    setAttemptsRemaining(result.data.attemptsRemaining);
                }
                setOtp(''); // Clear the input
            }
        } catch (error: any) {
            console.error('Error verifying OTP:', error);
            toast.error(error.message || 'Failed to verify OTP. Please try again.');
            setOtp(''); // Clear the input
        } finally {
            setIsVerifying(false);
        }
    };

    const handleOTPChange = (value: string) => {
        // Only allow digits and max 6 characters
        const cleaned = value.replace(/\D/g, '').slice(0, 6);
        setOtp(cleaned);
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && otp.length === 6) {
            verifyOTP();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label="Close"
                >
                    <X className="w-5 h-5" />
                </button>

                {/* Header */}
                <div className="text-center mb-6">
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Verify Your Phone</h2>
                    <p className="text-sm text-gray-600">
                        We sent a 6-digit code to <span className="font-semibold">{phone}</span>
                    </p>
                </div>

                {/* OTP Input */}
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Enter Verification Code
                    </label>
                    <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={otp}
                        onChange={(e) => handleOTPChange(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="000000"
                        className="w-full px-4 py-3 text-center text-2xl font-bold tracking-widest border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                        maxLength={6}
                        autoFocus
                        disabled={isVerifying}
                    />
                    <div className="mt-2 flex items-center justify-between text-xs">
                        <span className="text-gray-500">
                            {attemptsRemaining} attempt{attemptsRemaining !== 1 ? 's' : ''} remaining
                        </span>
                        {otp.length > 0 && (
                            <span className="text-blue-600 font-medium">
                                {otp.length}/6
                            </span>
                        )}
                    </div>
                </div>

                {/* Verify Button */}
                <button
                    onClick={verifyOTP}
                    disabled={otp.length !== 6 || isVerifying}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mb-4"
                >
                    {isVerifying ? (
                        <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Verifying...
                        </>
                    ) : (
                        'Verify Code'
                    )}
                </button>

                {/* Resend OTP */}
                <div className="text-center">
                    <button
                        onClick={sendOTP}
                        disabled={countdown > 0 || isSending}
                        className="text-sm text-blue-600 hover:text-blue-700 font-medium disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
                    >
                        {isSending ? (
                            'Sending...'
                        ) : countdown > 0 ? (
                            `Resend code in ${countdown}s`
                        ) : (
                            'Resend code'
                        )}
                    </button>
                </div>

                {/* Help text */}
                <p className="mt-6 text-xs text-center text-gray-500">
                    Didn't receive the code? Check your phone and try resending.
                </p>
            </div>
        </div>
    );
};
