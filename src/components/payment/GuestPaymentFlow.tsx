import { Timestamp } from 'firebase/firestore';
import { AlertCircle, CheckCircle } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { GuestContactInfo, GuestPaymentState } from '../../types/guestPayment';
import { EventPricing } from '../../types/payment';
import { GuestContactForm } from './GuestContactForm';
import { GuestPaymentMethodSelector } from './GuestPaymentMethodSelector';
import { OTPVerificationForm } from './OTPVerificationForm';
import { StripeGuestPayment } from './StripeGuestPayment';
import { ZellePaymentInstructions } from './ZellePaymentInstructions';

interface GuestPaymentFlowProps {
    eventId: string;
    eventTitle: string;
    eventDate: Timestamp;
    pricing: EventPricing;
    onComplete: (transactionId: string) => void;
    onCancel: () => void;
}

/**
 * Guest Payment Flow Orchestrator
 * Manages the complete guest payment workflow:
 * 1. Contact information collection
 * 2. OTP verification
 * 3. Payment method selection and processing
 * 4. Confirmation
 */
export const GuestPaymentFlow: React.FC<GuestPaymentFlowProps> = ({
    eventId,
    eventTitle,
    eventDate,
    pricing,
    onComplete,
    onCancel
}) => {
    const [state, setState] = useState<GuestPaymentState>({
        step: 'contact',
        contactInfo: null,
        sessionToken: null,
        sessionExpiry: null,
        otpAttempts: 0,
        error: null,
        transactionId: null
    });

    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'stripe' | 'zelle' | null>(null);

    // Monitor session expiry
    useEffect(() => {
        if (!state.sessionExpiry) return;

        const checkExpiry = () => {
            const now = new Date();
            if (state.sessionExpiry && now >= state.sessionExpiry) {
                setState(prev => ({
                    ...prev,
                    error: 'Your session has expired. Please verify your phone number again.',
                    step: 'otp',
                    sessionToken: null,
                    sessionExpiry: null
                }));
            }
        };

        // Check every 10 seconds
        const interval = setInterval(checkExpiry, 10000);
        return () => clearInterval(interval);
    }, [state.sessionExpiry]);

    const handleContactSubmit = (contactInfo: GuestContactInfo) => {
        setState(prev => ({
            ...prev,
            contactInfo,
            step: 'otp',
            error: null
        }));
    };

    const handleOTPVerified = (sessionToken: string, expiresAt: Date) => {
        setState(prev => ({
            ...prev,
            sessionToken,
            sessionExpiry: expiresAt,
            step: 'payment',
            error: null
        }));
    };

    const handlePaymentMethodSelect = (method: 'stripe' | 'zelle') => {
        setSelectedPaymentMethod(method);
    };

    const handlePaymentComplete = (transactionId: string) => {
        setState(prev => ({
            ...prev,
            transactionId,
            step: 'confirmation'
        }));

        // Call parent completion handler after a short delay
        setTimeout(() => {
            onComplete(transactionId);
        }, 2000);
    };

    const handleError = (error: string) => {
        setState(prev => ({
            ...prev,
            error
        }));
    };

    const handleBack = () => {
        if (state.step === 'otp') {
            setState(prev => ({ ...prev, step: 'contact', error: null }));
        } else if (state.step === 'payment') {
            setSelectedPaymentMethod(null);
        }
    };

    // Render current step
    const renderStep = () => {
        switch (state.step) {
            case 'contact':
                return (
                    <GuestContactForm
                        onSubmit={handleContactSubmit}
                        onCancel={onCancel}
                        initialData={state.contactInfo || undefined}
                    />
                );

            case 'otp':
                return (
                    <OTPVerificationForm
                        phone={state.contactInfo?.phone || ''}
                        firstName={state.contactInfo?.firstName || ''}
                        eventId={eventId}
                        onVerified={handleOTPVerified}
                        onBack={handleBack}
                        onError={handleError}
                    />
                );

            case 'payment':
                if (!selectedPaymentMethod) {
                    return (
                        <GuestPaymentMethodSelector
                            availableMethods={pricing.guestPaymentMethods || ['stripe']}
                            onSelect={handlePaymentMethodSelect}
                            pricing={pricing}
                            onBack={handleBack}
                        />
                    );
                }

                if (selectedPaymentMethod === 'stripe') {
                    return (
                        <StripeGuestPayment
                            sessionToken={state.sessionToken!}
                            eventId={eventId}
                            eventTitle={eventTitle}
                            onSuccess={handlePaymentComplete}
                            onError={handleError}
                            onBack={() => setSelectedPaymentMethod(null)}
                        />
                    );
                }

                if (selectedPaymentMethod === 'zelle') {
                    return (
                        <ZellePaymentInstructions
                            sessionToken={state.sessionToken!}
                            eventId={eventId}
                            eventTitle={eventTitle}
                            amount={pricing.adultPrice}
                            currency={pricing.currency}
                            zelleConfig={pricing.zelleConfig!}
                            onComplete={handlePaymentComplete}
                            onError={handleError}
                            onBack={() => setSelectedPaymentMethod(null)}
                        />
                    );
                }
                break;

            case 'confirmation':
                return (
                    <div className="text-center py-8">
                        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">
                            Payment Confirmed!
                        </h2>
                        <p className="text-gray-600 mb-4">
                            Thank you for your payment. You will receive a confirmation email shortly.
                        </p>
                        {state.transactionId && (
                            <p className="text-sm text-gray-500">
                                Transaction ID: {state.transactionId}
                            </p>
                        )}
                    </div>
                );
        }
    };

    return (
        <div className="max-w-2xl mx-auto">
            {/* Progress indicator */}
            <div className="mb-8">
                <div className="flex items-center justify-between">
                    <div className={`flex-1 ${state.step === 'contact' ? 'text-blue-600 font-semibold' : 'text-gray-400'}`}>
                        <div className="text-center">
                            <div className={`w-8 h-8 rounded-full mx-auto mb-2 flex items-center justify-center ${state.step === 'contact' ? 'bg-blue-600 text-white' : 'bg-gray-200'
                                }`}>
                                1
                            </div>
                            <div className="text-xs">Contact Info</div>
                        </div>
                    </div>

                    <div className="flex-1 border-t-2 border-gray-300 mx-2 mt-[-20px]"></div>

                    <div className={`flex-1 ${state.step === 'otp' ? 'text-blue-600 font-semibold' : 'text-gray-400'}`}>
                        <div className="text-center">
                            <div className={`w-8 h-8 rounded-full mx-auto mb-2 flex items-center justify-center ${state.step === 'otp' ? 'bg-blue-600 text-white' : 'bg-gray-200'
                                }`}>
                                2
                            </div>
                            <div className="text-xs">Verify Phone</div>
                        </div>
                    </div>

                    <div className="flex-1 border-t-2 border-gray-300 mx-2 mt-[-20px]"></div>

                    <div className={`flex-1 ${state.step === 'payment' ? 'text-blue-600 font-semibold' : 'text-gray-400'}`}>
                        <div className="text-center">
                            <div className={`w-8 h-8 rounded-full mx-auto mb-2 flex items-center justify-center ${state.step === 'payment' ? 'bg-blue-600 text-white' : 'bg-gray-200'
                                }`}>
                                3
                            </div>
                            <div className="text-xs">Payment</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Error message */}
            {state.error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
                    <AlertCircle className="w-5 h-5 text-red-500 mr-3 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <p className="text-sm text-red-800">{state.error}</p>
                    </div>
                </div>
            )}

            {/* Session expiry warning */}
            {state.sessionExpiry && state.step === 'payment' && (
                <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-800">
                        Your session will expire in {Math.max(0, Math.floor((state.sessionExpiry.getTime() - Date.now()) / 60000))} minutes.
                    </p>
                </div>
            )}

            {/* Current step content */}
            <div className="bg-white rounded-lg shadow-md p-6">
                {renderStep()}
            </div>
        </div>
    );
};
