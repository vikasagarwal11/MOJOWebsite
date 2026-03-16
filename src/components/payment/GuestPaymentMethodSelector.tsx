import React from 'react';

interface PaymentMethodOption {
    id: 'stripe' | 'zelle';
    name: string;
    description: string;
    icon: string;
    processingTime: string;
}

interface GuestPaymentMethodSelectorProps {
    availableMethods: ('stripe' | 'zelle')[];
    onSelect: (method: 'stripe' | 'zelle') => void;
    pricing: any; // EventPricing type
    onBack: () => void;
}

const PAYMENT_METHODS: Record<'stripe' | 'zelle', PaymentMethodOption> = {
    stripe: {
        id: 'stripe',
        name: 'Credit/Debit Card',
        description: 'Pay securely with your credit or debit card',
        icon: '💳',
        processingTime: 'Instant confirmation'
    },
    zelle: {
        id: 'zelle',
        name: 'Zelle',
        description: 'Pay with Zelle - requires manual verification',
        icon: '💰',
        processingTime: 'Verified within 24 hours'
    }
};

export const GuestPaymentMethodSelector: React.FC<GuestPaymentMethodSelectorProps> = ({
    availableMethods,
    onSelect,
    pricing,
    onBack
}) => {
    const amount = pricing.adultChargePrice || pricing.adultPrice || 0;
    const currency = pricing.currency || 'USD';
    const formatAmount = (amt: number, curr: string) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: curr.toUpperCase()
        }).format(amt / 100);
    };

    const handleMethodClick = (methodId: 'stripe' | 'zelle') => {
        onSelect(methodId);
    };

    return (
        <div className="payment-method-selector">
            <h2>Choose Payment Method</h2>

            <div className="payment-summary">
                <div className="amount-display">
                    <span className="label">Total Amount:</span>
                    <span className="amount">{formatAmount(amount, currency)}</span>
                </div>
            </div>

            <div className="payment-methods">
                {availableMethods.map(methodId => {
                    const method = PAYMENT_METHODS[methodId];
                    return (
                        <button
                            key={method.id}
                            className="payment-method-card"
                            onClick={() => handleMethodClick(method.id)}
                            type="button"
                        >
                            <div className="method-icon">{method.icon}</div>
                            <div className="method-details">
                                <h3 className="method-name">{method.name}</h3>
                                <p className="method-description">{method.description}</p>
                                <p className="processing-time">{method.processingTime}</p>
                            </div>
                            <div className="method-arrow">→</div>
                        </button>
                    );
                })}
            </div>

            {availableMethods.length === 0 && (
                <div className="no-methods-message">
                    <p>No payment methods are currently available.</p>
                    <p>Please contact the event organizer for assistance.</p>
                </div>
            )}

            <div className="form-actions">
                <button
                    type="button"
                    onClick={onBack}
                    className="back-button"
                >
                    Back
                </button>
            </div>

            <div className="security-notice">
                <p>
                    🔒 Your payment information is secure and encrypted.
                    {availableMethods.includes('stripe') && ' Card payments are processed by Stripe.'}
                </p>
            </div>
        </div>
    );
};
