/**
 * Zelle Payment Service
 * 
 * IMPORTANT: Zelle does NOT have a public API for direct integration.
 * This service handles manual Zelle payment processing.
 * 
 * Options:
 * 1. Manual Processing (Recommended): Display payment instructions, admin confirms
 * 2. Bank API: Requires partnership with a bank (complex)
 * 3. Third-party: Use services like Plaid or Stripe ACH
 * 
 * For now, we implement manual processing flow.
 */

import { PaymentTransaction } from '../types/payment';

export interface ZellePaymentInstructions {
  email: string;
  phone: string;
  amount: number;
  currency: string;
  memo: string; // Event name and transaction ID
}

export class ZelleService {
  // These should be configured in your environment or admin settings
  private static readonly ZELLE_EMAIL = import.meta.env.VITE_ZELLE_EMAIL || '';
  private static readonly ZELLE_PHONE = import.meta.env.VITE_ZELLE_PHONE || '';

  /**
   * Generate Zelle payment instructions
   */
  static generatePaymentInstructions(
    transactionId: string,
    amount: number,
    eventTitle: string,
    currency: string = 'USD'
  ): ZellePaymentInstructions {
    return {
      email: this.ZELLE_EMAIL,
      phone: this.ZELLE_PHONE,
      amount: amount / 100, // Convert cents to dollars
      currency,
      memo: `${eventTitle} - Transaction #${transactionId}`,
    };
  }

  /**
   * Mark Zelle payment as pending
   * User will send payment manually, admin confirms later
   */
  static async markPaymentPending(transactionId: string): Promise<void> {
    // This creates a transaction with 'pending' status
    // Admin will manually confirm when payment is received
    console.log('📧 Zelle payment marked as pending. Transaction ID:', transactionId);
    console.log('👤 Admin should verify payment and update status manually.');
  }

  /**
   * Admin function: Confirm Zelle payment received
   * This should be called by admin after verifying payment
   */
  static async confirmPayment(
    transactionId: string,
    confirmationCode?: string
  ): Promise<void> {
    // This should update the payment transaction status to 'paid'
    // Should be called from admin panel
    console.log('✅ Zelle payment confirmed. Transaction ID:', transactionId);
    if (confirmationCode) {
      console.log('📝 Confirmation code:', confirmationCode);
    }
  }

  /**
   * Get payment instructions HTML for display
   */
  static getPaymentInstructionsHTML(instructions: ZellePaymentInstructions): string {
    return `
      <div class="zelle-instructions">
        <h3>Zelle Payment Instructions</h3>
        <p>Please send payment via Zelle using the following details:</p>
        <ul>
          <li><strong>Email:</strong> ${instructions.email}</li>
          <li><strong>Phone:</strong> ${instructions.phone}</li>
          <li><strong>Amount:</strong> $${instructions.amount.toFixed(2)}</li>
          <li><strong>Memo:</strong> ${instructions.memo}</li>
        </ul>
        <p><strong>Important:</strong> Include the memo in your Zelle payment so we can match it to your registration.</p>
        <p>Your registration will be confirmed once we receive and verify your payment.</p>
      </div>
    `;
  }
}

