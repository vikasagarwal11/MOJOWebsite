import { getFunctions, httpsCallable } from 'firebase/functions';
import React, { useEffect, useState } from 'react';
import type { PaymentIntentResponse, ZelleInstructions } from '../../types/guestPayment';

interface ZellePaymentInstructionsProps {
    sessionToken: string;
    eventId: string;
    eventTitle: string;
    amount: number;
    currency: string;
    zelleConfig: any; // ZelleConfig type
    onComplete: (transactionId: string) => void;
    onError: (error: string) => void;
    onBack: () => void;
}

export const ZellePaymentInstructions: React.FC<ZellePaymentInstructionsProps> = ({
    sessionToken,
    eventId,
    eventTitle,
    amount,
    currency,
    zelleConfig,
    onComplete,
    onError,
    onBack
}) => {
    const functions = getFunctions();
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [instructions, setInstructions] = useState<ZelleInstructions | null>(null);
    const [transactionId, setTransactionId] = useState<string | null>(null);
    const [copied, setCopied] = useState<{ [key: string]: boolean }>({});

    useEffect(() => {
        createZelleTransaction();
    }, []);

    const createZelleTransaction = async () => {
        setIsLoading(true);
        setError(null);

        try {
            const createIntent = httpsCallable<
                {
                    sessionToken: string;
                    eventId: string;
                    paymentMethod: 'zelle';
                    amount: number;
                    currency: string;
                },
                PaymentIntentResponse
            >(functions, 'createGuestPaymentIntent');

            const result = await createIntent({
                sessionToken,
                eventId,
                paymentMethod: 'zelle',
                amount,
                currency
            });

            if (result.data.instructions) {
                setInstructions(result.data.instructions);
                setTransactionId(result.data.transactionId);
            } else {
                throw new Error('Failed to get Zelle payment instructions');
            }
        } catch (err: any) {
            console.error('Create Zelle transaction error:', err);
            const errorMessage = err.message || 'Failed to initialize Zelle payment. Please try again.';
            setError(errorMessage);
            onError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCopy = async (text: string, key: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied({ ...copied, [key]: true });
            setTimeout(() => {
                setCopied({ ...copied, [key]: false });
            }, 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    const handleConfirm = () => {
        if (transactionId) {
            onComplete(transactionId);
        }
    };

    const formatAmount = (amt: number, curr: string) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: curr.toUpperCase()
        }).format(amt / 100);
    };

    if (isLoading) {
        return (
            <div className="zelle-instructions-loading">
                <div className="spinner" />
                <p>Preparing payment instructions...</p>
            </div>
        );
    }

    if (error || !instructions) {
        return (
            <div className="zelle-instructions-error">
                <div className="error-message" role="alert">
                    {error || 'Failed to load payment instructions'}
                </div>
                <div className="form-actions">
                    <button onClick={onBack} className="back-button">
                        Back
                    </button>
                    <button onClick={createZelleTransaction} className="retry-button">
                        Try Again
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="zelle-payment-instructions">
            <h2>Pay with Zelle</h2>

            <div className="payment-summary">
                <div className="summary-row">
                    <span className="label">Event:</span>
                    <span className="value">{eventTitle}</span>
                </div>
                <div className="summary-row amount-row">
                    <span className="label">Amount to Send:</span>
                    <span className="value amount">{formatAmount(amount, currency)}</span>
                </div>
            </div>

            <div className="recipient-info">
                <h3>Send Payment To:</h3>

                <div className="info-card">
                    <div className="info-row">
                        <span className="label">Email:</span>
                        <div className="value-with-copy">
                            <span className="value">{instructions.recipientEmail}</span>
                            <button
                                onClick={() => handleCopy(instructions.recipientEmail, 'email')}
                                className="copy-button"
                                title="Copy email"
                            >
                                {copied.email ? '✓' : '📋'}
                            </button>
                        </div>
                    </div>

                    <div className="info-row">
                        <span className="label">Phone:</span>
                        <div className="value-with-copy">
                            <span className="value">{instructions.recipientPhone}</span>
                            <button
                                onClick={() => handleCopy(instructions.recipientPhone, 'phone')}
                                className="copy-button"
                                title="Copy phone"
                            >
                                {copied.phone ? '✓' : '📋'}
                            </button>
                        </div>
                    </div>

                    <div className="info-row">
                        <span className="label">Memo/Note:</span>
                        <div className="value-with-copy">
                            <span className="value memo">{instructions.memo}</span>
                            <button
                                onClick={() => handleCopy(instructions.memo, 'memo')}
                                className="copy-button"
                                title="Copy memo"
                            >
                                {copied.memo ? '✓' : '📋'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="instructions-section">
                <h3>How to Pay:</h3>
                <ol className="instruction-steps">
                    {instructions.instructions.map((instruction, index) => (
                        <li key={index}>{instruction}</li>
                    ))}
                </ol>
            </div>

            <div className="verification-notice">
                <div className="notice-icon">⏱️</div>
                <div className="notice-content">
                    <h4>Payment Verification</h4>
                    <p>
                        Your payment will be manually verified by our team within 24 hours.
                        You'll receive a confirmation email once your payment is verified.
                    </p>
                    <p className="transaction-ref">
                        Transaction Reference: <strong>{transactionId}</strong>
                    </p>
                </div>
            </div>

            <div className="important-notes">
                <h4>Important:</h4>
                <ul>
                    <li>Make sure to include the memo/note exactly as shown above</li>
                    <li>Send the exact amount: {formatAmount(amount, currency)}</li>
                    <li>Keep your Zelle confirmation for your records</li>
                    <li>You'll receive a confirmation email once payment is verified</li>
                </ul>
            </div>

            <div className="form-actions">
                <button
                    type="button"
                    onClick={onBack}
                    className="back-button"
                >
                    Back
                </button>
                <button
                    type="button"
                    onClick={handleConfirm}
                    className="confirm-button"
                >
                    I've Sent the Payment
                </button>
            </div>

            <div className="help-text">
                <p>
                    Need help? Contact us with your transaction reference.
                </p>
            </div>
        </div>
    );
};
