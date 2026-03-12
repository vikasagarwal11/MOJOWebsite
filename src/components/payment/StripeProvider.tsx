import { Elements } from '@stripe/react-stripe-js';
import { loadStripe, Stripe, StripeElementsOptions } from '@stripe/stripe-js';
import React from 'react';

// Initialize Stripe with publishable key
const stripePromise: Promise<Stripe | null> = loadStripe(
    import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || ''
);

interface StripeProviderProps {
    clientSecret: string;
    children: React.ReactNode;
}

export const StripeProvider: React.FC<StripeProviderProps> = ({
    clientSecret,
    children
}) => {
    const options: StripeElementsOptions = {
        clientSecret,
        appearance: {
            theme: 'stripe',
            variables: {
                colorPrimary: '#16a34a', // green-600
                colorBackground: '#ffffff',
                colorText: '#1f2937', // gray-800
                colorDanger: '#dc2626', // red-600
                fontFamily: 'system-ui, -apple-system, sans-serif',
                spacingUnit: '4px',
                borderRadius: '8px',
            },
            rules: {
                '.Input': {
                    border: '1px solid #d1d5db', // gray-300
                    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                },
                '.Input:focus': {
                    border: '1px solid #16a34a', // green-600
                    boxShadow: '0 0 0 3px rgba(22, 163, 74, 0.1)',
                },
                '.Label': {
                    fontWeight: '500',
                    marginBottom: '8px',
                },
            },
        },
    };

    return (
        <Elements stripe={stripePromise} options={options}>
            {children}
        </Elements>
    );
};
