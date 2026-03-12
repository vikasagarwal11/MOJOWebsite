import { getFunctions, httpsCallable } from 'firebase/functions';
import React, { useEffect, useRef, useState } from 'react';
import type { GuestContactInfo, OTPSendResult, OTPVerifyResult } from '../../types/guestPayment';

interface OTPVerificationFormProps {
    phone: string;
    firstName: string;
    eventId: string;
    onVerified: (sessionToken: string, expiresAt: Date) => void;
    onBack: () => void;
    onError: (error: string) => void;
}

export const OTPVerificationForm: React.FC<OTPVerificationFormProps> = ({
    phone,
    firstName,
    eventId,
    onVerified,
    onBack,
    onError
}) => {
    const [otp, setOtp] = useState(['', '', '', '', '', '']);
    const [isVerifying, setIsVerifying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [attemptsRemaining, setAttemptsRemaining] = useState(3);
    const [isLocked, setIsLocked] = useState(false);
    const [lockoutEndsAt, setLockoutEndsAt] = useState<Date | null>(null);
    const [countdown, setCountdown] = useState(30);
    const [canResend, setCanResend] = useState(false);
    const [isResending, setIsResending] = useState(false);

    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
    const functions = getFunctions();

    // Countdown timer for resend
    useEffect(() => {
        if (countdown > 0) {
            const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
            return () => clearTimeout(timer);
        } else {
            setCanResend(true);
        }
    }, [countdown]);

    // Lockout countdown
    useEffect(() => {
        if (isLocked && lockoutEndsAt) {
            const interval = setInterval(() => {
                const now = new Date();
                if (now >= lockoutEndsAt) {
                    setIsLocked(false);
                    setLockoutEndsAt(null);
                    setAttemptsRemaining(3);
                    setError(null);
                }
            }, 1000);
            return () => clearInterval(interval);
        }
    }, [isLocked, lockoutEndsAt]);

    const handleOtpChange = (index: number, value: string) => {
        // Only allow digits
        if (value && !/^\d$/.test(value)) return;

        const newOtp = [...otp];
        newOtp[index] = value;
        setOtp(newOtp);
        setError(null);

        // Auto-focus next input
        if (value && index < 5) {
            inputRefs.current[index + 1]?.focus();
        }

        // Auto-submit when all 6 digits entered
        if (newOtp.every(digit => digit !== '') && value) {
            handleVerify(newOtp.join(''));
        }
    };

    const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace' && !otp[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        e.preventDefault();
        const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        const newOtp = [...otp];

        for (let i = 0; i < pastedData.length; i++) {
            newOtp[i] = pastedData[i];
        }

        setOtp(newOtp);

        if (pastedData.length === 6) {
            handleVerify(pastedData);
        } else if (pastedData.length > 0) {
            inputRefs.current[Math.min(pastedData.length, 5)]?.focus();
        }
    };

    const handleVerify = async (otpCode: string) => {
        if (isLocked) {
            setError('Too many failed attempts. Please wait before trying again.');
            return;
        }

        setIsVerifying(true);
        setError(null);

        try {
            const verifyOTP = httpsCallable<
                { phone: string; code: string },
                OTPVerifyResult
            >(functions, 'verifyGuestOTP');

            const result = await verifyOTP({
                phone: phone,
                code: otpCode
            });

            if (result.data.verified && result.data.sessionToken && result.data.expiresAt) {
                onVerified(result.data.sessionToken, new Date(result.data.expiresAt));
            } else {
                setError(result.data.error || 'Invalid verification code');
                setAttemptsRemaining(result.data.attemptsRemaining ?? 0);

                if (result.data.lockoutEndsAt) {
                    setIsLocked(true);
                    setLockoutEndsAt(new Date(result.data.lockoutEndsAt));
                }

                // Clear OTP inputs on error
                setOtp(['', '', '', '', '', '']);
                inputRefs.current[0]?.focus();
            }
        } catch (err: any) {
            console.error('OTP verification error:', err);
            setError(err.message || 'Failed to verify code. Please try again.');
            setOtp(['', '', '', '', '', '']);
            inputRefs.current[0]?.focus();
        } finally {
            setIsVerifying(false);
        }
    };

    const handleResend = async () => {
        setIsResending(true);
        setError(null);

        try {
            const sendOTP = httpsCallable<
                { phone: string; contactInfo: GuestContactInfo },
                OTPSendResult
            >(functions, 'sendGuestOTP');

            const result = await sendOTP({
                phone: phone,
                contactInfo: { phone, firstName, lastName: '', email: '' }
            });

            if (result.data.success) {
                setCountdown(30);
                setCanResend(false);
                setOtp(['', '', '', '', '', '']);
                setAttemptsRemaining(result.data.attemptsRemaining);
                inputRefs.current[0]?.focus();
            } else {
                setError(result.data.error || 'Failed to resend code');
                if (result.data.lockoutEndsAt) {
                    setIsLocked(true);
                    setLockoutEndsAt(new Date(result.data.lockoutEndsAt));
                }
            }
        } catch (err: any) {
            console.error('Resend OTP error:', err);
            setError(err.message || 'Failed to resend code. Please try again.');
        } finally {
            setIsResending(false);
        }
    };

    const getLockoutTimeRemaining = () => {
        if (!lockoutEndsAt) return '';
        const now = new Date();
        const diff = Math.max(0, Math.floor((lockoutEndsAt.getTime() - now.getTime()) / 1000));
        const minutes = Math.floor(diff / 60);
        const seconds = diff % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    return (
        <div className="otp-verification-form">
            <h2>Verify Your Phone Number</h2>
            <p className="subtitle">
                We've sent a 6-digit code to {phone}
            </p>

            {error && (
                <div className="error-message" role="alert">
                    {error}
                </div>
            )}

            {isLocked && lockoutEndsAt && (
                <div className="lockout-message" role="alert">
                    Too many failed attempts. Please wait {getLockoutTimeRemaining()} before trying again.
                </div>
            )}

            <div className="otp-inputs" onPaste={handlePaste}>
                {otp.map((digit, index) => (
                    <input
                        key={index}
                        ref={el => inputRefs.current[index] = el}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={e => handleOtpChange(index, e.target.value)}
                        onKeyDown={e => handleKeyDown(index, e)}
                        disabled={isVerifying || isLocked}
                        className={`otp-input ${error ? 'error' : ''}`}
                        autoFocus={index === 0}
                        aria-label={`Digit ${index + 1}`}
                    />
                ))}
            </div>

            <div className="attempts-info">
                {!isLocked && attemptsRemaining > 0 && (
                    <p className="attempts-remaining">
                        {attemptsRemaining} {attemptsRemaining === 1 ? 'attempt' : 'attempts'} remaining
                    </p>
                )}
            </div>

            <div className="resend-section">
                {canResend ? (
                    <button
                        type="button"
                        onClick={handleResend}
                        disabled={isResending || isLocked}
                        className="resend-button"
                    >
                        {isResending ? 'Sending...' : 'Resend Code'}
                    </button>
                ) : (
                    <p className="resend-timer">
                        Resend code in {countdown}s
                    </p>
                )}
            </div>

            <div className="form-actions">
                <button
                    type="button"
                    onClick={onBack}
                    disabled={isVerifying}
                    className="back-button"
                >
                    Back
                </button>
            </div>

            {isVerifying && (
                <div className="verifying-overlay">
                    <div className="spinner" />
                    <p>Verifying code...</p>
                </div>
            )}
        </div>
    );
};
