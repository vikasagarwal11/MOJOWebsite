import { PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { getFunctions, httpsCallable } from 'firebase/functions';
import React, { useEffect, useState } from 'react';
import type { PaymentIntentResponse } from '../../types/guestPayment';
import { StripeProvider } from './StripeProvider';

interface StripeGuestPaymentProps {
    sessionToken: string;
    eventId: string;
    eventTitle: string;
    onSuccess: (transactionId: string) => void;
    onError: (error: string) => void;
    onBack: () => void;
}

// Inner form component that uses Stripe hooks
const StripePaymentForm: React.FC<{
    transactionId: string;
    amount: number;
    currency: string;
    eventTitle: string;
    onSuccess: (transactionId: string) => void;
    onError: (error: string) => void;
    onBack: () => void;
}> = ({ transactionId, amount, currency, eventTitle, onSuccess, onError, onBack }) => {
    const stripe = useStripe();
    const elements = useElements();
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!stripe || !elements) {
            return;
        }

        setIsProcessing(true);
        setError(null);

        try {
            const { error: submitError } = await elements.submit();
            if (submitError) {
                throw new Error(submitError.message);
            }

            const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
                elements,
                confirmParams: {
                    return_url: `${window.location.origin}/payment/success`
                },
                redirect: 'if_required'
            });

            if (confirmError) {
                throw new Error(confirmError.message);
            }

            if (paymentIntent && paymentIntent.status === 'succeeded') {
                onSuccess(transactionId);
            } else {
                throw new Error('Payment was not completed successfully');
            }
        } catch (err: any) {
            console.error('Payment error:', err);
            const errorMessage = err.message || 'Payment failed. Please try again.';
            setError(errorMessage);
            onError(errorMessage);
        } finally {
            setIsProcessing(false);
        }
    };

    const formatAmount = (amt: number, curr: string) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: curr.toUpperCase()
        }).format(amt / 100);
    };

    return (
        <div className="stripe-guest-payment">
            <h2>Complete Your Payment</h2>

            <div className="payment-details">
                <div className="detail-row">
                    <span className="label">Event:</span>
                    <span className="value">{eventTitle}</span>
                </div>
                <div className="detail-row">
                    <span className="label">Amount:</span>
                    <span className="value amount">{formatAmount(amount, currency)}</span>
                </div>
            </div>

            {error && (
                <div className="error-message" role="alert">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="payment-form">
                <PaymentElement
                    options={{
                        layout: 'tabs'
                    }}
                />

                <div className="form-actions">
                    <button
                        type="button"
                        onClick={onBack}
                        disabled={isProcessing}
                        className="back-button"
                    >
                        Back
                    </button>
                    <button
                        type="submit"
                        disabled={!stripe || !elements || isProcessing}
                        className="pay-button"
                    >
                        {isProcessing ? 'Processing...' : `Pay ${formatAmount(amount, currency)}`}
                    </button>
                </div>
            </form>

            <div className="security-notice">
                <p>🔒 Your payment is secure and encrypted. Powered by Stripe.</p>
            </div>
        </div>
    );
};

// Outer wrapper component that creates payment intent and provides Stripe context
export const StripeGuestPayment: React.FC<StripeGuestPaymentProps> = ({
    sessionToken,
    eventId,
    eventTitle,
    onSuccess,
    onError,
    onBack
}) => {
    const functions = getFunctions();
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [clientSecret, setClientSecret] = useState<string | null>(null);
    const [transactionId, setTransactionId] = useState<string | null>(null);
    const [amount, setAmount] = useState<number>(0);
    const [currency, setCurrency] = useState<string>('usd');

    useEffect(() => {
        createPaymentIntent();
    }, []);

    const createPaymentIntent = async () => {
        setIsLoading(true);
        setError(null);

        try {
            const createIntent = httpsCallable<
                {
                    sessionToken: string;
                    eventId: string;
                    paymentMethod: 'stripe';
                },
                PaymentIntentResponse
            >(functions, 'createGuestPaymentIntent');

            const result = await createIntent({
                sessionToken,
                eventId,
                paymentMethod: 'stripe'
            });

            if (result.data.clientSecret && result.data.amount && result.data.currency) {
                setClientSecret(result.data.clientSecret);
                setTransactionId(result.data.transactionId);
                setAmount(result.data.amount);
                setCurrency(result.data.currency);
            } else {
                throw new Error('Failed to create payment intent');
            }
        } catch (err: any) {
            console.error('Create payment intent error:', err);
            const errorMessage = err.message || 'Failed to initialize payment. Please try again.';
            setError(errorMessage);
            onError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading) {
        return (
            <div className="stripe-payment-loading">
                <div className="spinner" />
                <p>Initializing payment...</p>
            </div>
        );
    }

    if (error || !clientSecret || !transactionId) {
        return (
            <div className="stripe-payment-error">
                <div className="error-message" role="alert">
                    {error || 'Failed to initialize payment'}
                </div>
                <div className="form-actions">
                    <button onClick={onBack} className="back-button">
                        Back
                    </button>
                    <button onClick={createPaymentIntent} className="retry-button">
                        Try Again
                    </button>
                </div>
            </div>
        );
    }

    return (
        <StripeProvider clientSecret={clientSecret}>
            <StripePaymentForm
                transactionId={transactionId}
                amount={amount}
                currency={currency}
                eventTitle={eventTitle}
                onSuccess={onSuccess}
                onError={onError}
                onBack={onBack}
            />
        </StripeProvider>
    );
};
