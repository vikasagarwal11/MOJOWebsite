/**
 * PayPal Payment Service
 * 
 * Handles PayPal and Venmo payments (Venmo is integrated through PayPal)
 * 
 * Setup:
 * 1. Create PayPal Business account: https://www.paypal.com/business
 * 2. Get credentials from: https://developer.paypal.com/dashboard
 * 3. Add to .env:
 *    VITE_PAYPAL_CLIENT_ID=your_client_id
 *    PAYPAL_CLIENT_SECRET=your_secret (server-side only)
 */

import { PaymentTransaction } from '../types/payment';

interface PayPalOrderResponse {
  id: string;
  status: string;
  payer?: {
    payer_id?: string;
    email_address?: string;
  };
}

export class PayPalService {
  private static readonly PAYPAL_CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID;
  private static readonly PAYPAL_API_BASE = import.meta.env.VITE_PAYPAL_MODE === 'production'
    ? 'https://api.paypal.com'
    : 'https://api.sandbox.paypal.com';

  /**
   * Initialize PayPal SDK
   */
  static async loadPayPalSDK(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.paypal) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = `https://www.paypal.com/sdk/js?client-id=${this.PAYPAL_CLIENT_ID}&currency=USD&intent=capture&enable-funding=venmo`;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load PayPal SDK'));
      document.body.appendChild(script);
    });
  }

  /**
   * Create PayPal order
   * This should be called from a Cloud Function for security
   */
  static async createOrder(
    amount: number,
    currency: string = 'USD',
    description: string
  ): Promise<string> {
    // NOTE: This should be done server-side via Cloud Function
    // For now, this is a placeholder that shows the structure
    
    const response = await fetch('/api/paypal/create-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount,
        currency,
        description,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to create PayPal order');
    }

    const data = await response.json();
    return data.orderId;
  }

  /**
   * Capture PayPal payment
   * This should be called from a Cloud Function
   */
  static async captureOrder(orderId: string): Promise<PayPalOrderResponse> {
    const response = await fetch(`/api/paypal/capture-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ orderId }),
    });

    if (!response.ok) {
      throw new Error('Failed to capture PayPal order');
    }

    return response.json();
  }

  /**
   * Process PayPal payment and update transaction
   */
  static async processPayment(
    transactionId: string,
    orderId: string
  ): Promise<void> {
    try {
      // Capture the order
      const captureResult = await this.captureOrder(orderId);

      if (captureResult.status === 'COMPLETED') {
        // Update payment transaction status
        // This should call PaymentService.updatePaymentStatus
        console.log('✅ PayPal payment completed:', captureResult);
        return;
      }

      throw new Error(`PayPal payment failed with status: ${captureResult.status}`);
    } catch (error) {
      console.error('❌ PayPal payment error:', error);
      throw error;
    }
  }
}

// Extend Window interface for PayPal
declare global {
  interface Window {
    paypal?: any;
  }
}

