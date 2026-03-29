import sgMail from '@sendgrid/mail';
import { Firestore, Timestamp } from 'firebase-admin/firestore';
import { GuestInvoice } from '../types/guestInvoice';
import { PaymentTransaction } from '../types/paymentTransaction';

let sendGridInitialized = false;

/**
 * Email Notification Service
 * Sends transactional emails for payment confirmations
 * Uses Firebase Extensions (Trigger Email) or SendGrid
 */
export class EmailNotificationService {
    private db: Firestore;
    private fromEmail: string;
    private fromName: string;
    private sendGridApiKey: string;

    constructor(db: Firestore) {
        this.db = db;
        this.fromEmail = process.env.EMAIL_FROM || 'noreply@example.com';
        this.fromName = process.env.EMAIL_FROM_NAME || 'Moms Fitness Mojo';
        this.sendGridApiKey = process.env.SENDGRID_API_KEY || '';
    }

    /**
     * Send Stripe payment confirmation
     * @param transaction - Payment transaction
     * @param stripeInvoiceUrl - Stripe invoice URL
     */
    async sendStripeConfirmation(
        transaction: PaymentTransaction,
        stripeInvoiceUrl?: string
    ): Promise<string> {
        try {
            const recipient = await this.getRecipient(transaction);
            const eventInfo = await this.getEventInfo(transaction);

            const emailData = {
                to: recipient.email,
                from: {
                    email: this.fromEmail,
                    name: this.fromName
                },
                subject: `Payment Confirmation - ${eventInfo.title}`,
                html: this.generateStripeConfirmationHTML(transaction, recipient, eventInfo, stripeInvoiceUrl),
                text: this.generateStripeConfirmationText(transaction, recipient, eventInfo, stripeInvoiceUrl)
            };

            const mailDocId = await this.sendEmailWithRetry(emailData);

            // Log email sent
            await this.logEmail(transaction.id, 'stripe_confirmation', true, undefined, mailDocId);
            return mailDocId;
        } catch (error) {
            console.error('Error sending Stripe confirmation email:', error);
            await this.logEmail(transaction.id, 'stripe_confirmation', false, error);
            throw error;
        }
    }

    /**
     * Send Zelle payment confirmation with custom invoice
     * @param transaction - Payment transaction
     * @param invoice - Generated invoice
     */
    async sendZelleConfirmation(
        transaction: PaymentTransaction,
        invoice?: GuestInvoice
    ): Promise<string> {
        try {
            const recipient = await this.getRecipient(transaction);
            const eventInfo = await this.getEventInfo(transaction);

            const emailData = {
                to: recipient.email,
                from: {
                    email: this.fromEmail,
                    name: this.fromName
                },
                subject: `Payment Verified - ${eventInfo.title}`,
                html: this.generateZelleConfirmationHTML(transaction, recipient, eventInfo, invoice),
                text: this.generateZelleConfirmationText(transaction, recipient, eventInfo, invoice)
            };

            const mailDocId = await this.sendEmailWithRetry(emailData);

            // Log email sent
            await this.logEmail(transaction.id, 'zelle_confirmation', true, undefined, mailDocId);
            return mailDocId;
        } catch (error) {
            console.error('Error sending Zelle confirmation email:', error);
            await this.logEmail(transaction.id, 'zelle_confirmation', false, error);
            throw error;
        }
    }

    /**
     * Send payment failure notification
     * @param transaction - Failed transaction
     * @param errorMessage - Error details
     */
    async sendPaymentFailure(
        transaction: PaymentTransaction,
        errorMessage: string
    ): Promise<string> {
        try {
            const recipient = await this.getRecipient(transaction);
            const eventInfo = await this.getEventInfo(transaction);

            const emailData = {
                to: recipient.email,
                from: {
                    email: this.fromEmail,
                    name: this.fromName
                },
                subject: `Payment Issue - ${eventInfo.title}`,
                html: this.generatePaymentFailureHTML(transaction, recipient, eventInfo, errorMessage),
                text: this.generatePaymentFailureText(transaction, recipient, eventInfo, errorMessage)
            };

            const mailDocId = await this.sendEmailWithRetry(emailData);

            // Log email sent
            await this.logEmail(transaction.id, 'payment_failure', true, undefined, mailDocId);
            return mailDocId;
        } catch (error) {
            console.error('Error sending payment failure email:', error);
            await this.logEmail(transaction.id, 'payment_failure', false, error);
            throw error;
        }
    }

    /**
     * Send email with retry logic (exponential backoff)
     * @param emailData - Email data
     */
    private async sendEmailWithRetry(emailData: any): Promise<string> {
        const delays = [1000, 2000, 4000]; // 1s, 2s, 4s

        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const mailDocId = await this.sendEmail(emailData);
                return mailDocId; // Success
            } catch (error) {
                console.error(`Email send attempt ${attempt + 1} failed:`, error);

                if (attempt === 2) {
                    // Last attempt failed
                    throw new Error(`Failed to send email after 3 attempts: ${error}`);
                }

                // Wait before retry
                await this.sleep(delays[attempt]);
            }
        }

        throw new Error('Failed to send email after retries');
    }

    /**
     * Send email using Firebase mail collection
     * This works with Firebase Extensions (Trigger Email)
     * @param emailData - Email data
     */
    private async sendEmail(emailData: any): Promise<string> {
        const formatAddress = (input?: { email?: string; name?: string } | string) => {
            if (!input) return undefined;
            if (typeof input === 'string') return input;
            if (!input.email) return undefined;
            return input.name ? `${input.name} <${input.email}>` : input.email;
        };

        const to = emailData.to;
        const from = formatAddress(emailData.from) || this.fromEmail;
        const replyTo = formatAddress(emailData.replyTo);

        if (!to) {
            throw new Error('Email "to" address is required');
        }

        if (this.shouldUseSendGrid()) {
            if (!sendGridInitialized) {
                sgMail.setApiKey(this.sendGridApiKey);
                sendGridInitialized = true;
            }

            const msg = {
                to,
                from,
                replyTo,
                subject: emailData.subject,
                text: emailData.text,
                html: emailData.html
            };

            const [response] = await sgMail.send(msg as any);
            const headers = (response && (response as any).headers) || {};
            const messageId =
                headers['x-message-id'] ||
                headers['X-Message-Id'] ||
                headers['x-message-id'.toLowerCase()] ||
                undefined;
            return messageId ? String(messageId) : `sendgrid:${response?.statusCode ?? 'unknown'}`;
        }

        // Firebase Trigger Email extension expects "to" and "message"
        // Keep top-level fields for compatibility with other providers
        const mailPayload = {
            to,
            from,
            replyTo,
            subject: emailData.subject,
            text: emailData.text,
            html: emailData.html,
            message: {
                subject: emailData.subject,
                text: emailData.text,
                html: emailData.html,
                ...(from ? { from } : {}),
                ...(replyTo ? { replyTo } : {})
            },
            createdAt: Timestamp.now()
        };

        const docRef = await this.db.collection('mail').add(mailPayload);
        return docRef.id;
    }

    private shouldUseSendGrid(): boolean {
        const key = (this.sendGridApiKey || '').trim();
        if (!key) return false;
        if (key.toUpperCase().includes('PLACEHOLDER')) return false;
        if (key === 'SG_PLACEHOLDER_REPLACE_WITH_ACTUAL_KEY') return false;
        return true;
    }

    private async getRecipient(transaction: PaymentTransaction): Promise<{ email: string; name: string }> {
        if (transaction.guestContactInfo) {
            const name = `${transaction.guestContactInfo.firstName} ${transaction.guestContactInfo.lastName}`.trim();
            return { email: transaction.guestContactInfo.email, name: name || 'Member' };
        }

        if (!transaction.userId) {
            throw new Error('User ID not found for transaction');
        }

        const userDoc = await this.db.collection('users').doc(transaction.userId).get();
        if (!userDoc.exists) {
            throw new Error('User not found for transaction');
        }

        const userData = userDoc.data() || {};
        const email = userData.email || userData.primaryEmail;
        if (!email) {
            throw new Error('User email not found');
        }

        const name = userData.displayName || `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || 'Member';
        return { email, name };
    }

    private async getEventInfo(transaction: PaymentTransaction): Promise<{ title: string; date: string }> {
        const title = transaction.metadata?.eventTitle?.trim();
        const dateRaw = transaction.metadata?.eventDate;

        if (title && dateRaw) {
            return { title, date: dateRaw };
        }

        if (!transaction.eventId) {
            return { title: title || 'Event', date: dateRaw || '' };
        }

        const eventDoc = await this.db.collection('events').doc(transaction.eventId).get();
        if (!eventDoc.exists) {
            return { title: title || 'Event', date: dateRaw || '' };
        }

        const eventData = eventDoc.data() || {};
        const eventTitle = eventData.title || title || 'Event';
        const eventDate = eventData.startAt?.toDate?.()?.toLocaleDateString('en-US') ||
            eventData.date?.toDate?.()?.toLocaleDateString('en-US') ||
            dateRaw ||
            '';

        return { title: eventTitle, date: eventDate };
    }

    /**
     * Generate Stripe confirmation HTML
     */
    private generateStripeConfirmationHTML(
        transaction: PaymentTransaction,
        recipient: { email: string; name: string },
        eventInfo: { title: string; date: string },
        stripeInvoiceUrl?: string
    ): string {
        const amount = (transaction.amount / 100).toFixed(2);
        const breakdown = transaction.metadata?.breakdown || [];
        const chargedBreakdown = this.allocateChargeBreakdown(breakdown, transaction.amount);
        const breakdownHtml = chargedBreakdown.length
            ? `<ul>${chargedBreakdown.map(item => `<li>${item.attendeeName} (${item.ageGroup}): $${(item.chargeAmount / 100).toFixed(2)}</li>`).join('')}</ul>`
            : '<p>No itemized breakdown available.</p>';

        return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Payment Confirmation</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .details { background-color: white; padding: 15px; margin: 15px 0; border-radius: 5px; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          .button { display: inline-block; padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Payment Confirmed!</h1>
          </div>
          <div class="content">
            <p>Dear ${recipient.name},</p>
            
            <p>Thank you for your payment! Your registration for <strong>${eventInfo.title}</strong> has been confirmed.</p>
            
            <div class="details">
              <h2>Payment Details</h2>
              <ul>
                <li><strong>Transaction ID:</strong> ${transaction.id}</li>
                <li><strong>Amount:</strong> $${amount} ${transaction.currency.toUpperCase()}</li>
                <li><strong>Payment Method:</strong> Credit/Debit Card</li>
                <li><strong>Date:</strong> ${new Date().toLocaleDateString()}</li>
              </ul>
              <h3>Itemized Receipt (Amount Paid)</h3>
              ${breakdownHtml}
            </div>
            
            <div class="details">
              <h2>Event Details</h2>
              <ul>
                <li><strong>Event:</strong> ${eventInfo.title}</li>
                <li><strong>Date:</strong> ${eventInfo.date}</li>
              </ul>
            </div>
            
            ${stripeInvoiceUrl ? `<p><a href="${stripeInvoiceUrl}" class="button">View Stripe Invoice</a></p>` : ''}
            
            <p>If you have any questions, please contact us at momsfitnessmojo@gmail.com</p>
            
            <p>Best regards,<br>The Moms Fitness Mojo Team</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Moms Fitness Mojo. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
    }

    /**
     * Generate Stripe confirmation plain text
     */
    private generateStripeConfirmationText(
        transaction: PaymentTransaction,
        recipient: { email: string; name: string },
        eventInfo: { title: string; date: string },
        stripeInvoiceUrl?: string
    ): string {
        const amount = (transaction.amount / 100).toFixed(2);
        const breakdown = transaction.metadata?.breakdown || [];
        const chargedBreakdown = this.allocateChargeBreakdown(breakdown, transaction.amount);
        const breakdownText = chargedBreakdown.length
            ? chargedBreakdown.map(item => `- ${item.attendeeName} (${item.ageGroup}): $${(item.chargeAmount / 100).toFixed(2)}`).join('\n')
            : '- No itemized breakdown available.';

        return `
Payment Confirmed!

Dear ${recipient.name},

Thank you for your payment! Your registration for ${eventInfo.title} has been confirmed.

Payment Details:
- Transaction ID: ${transaction.id}
- Amount: $${amount} ${transaction.currency.toUpperCase()}
- Payment Method: Credit/Debit Card
- Date: ${new Date().toLocaleDateString()}

Itemized Receipt (Amount Paid):
${breakdownText}

Event Details:
- Event: ${eventInfo.title}
- Date: ${eventInfo.date}

${stripeInvoiceUrl ? `View your Stripe invoice: ${stripeInvoiceUrl}` : ''}

If you have any questions, please contact us at momsfitnessmojo@gmail.com

Best regards,
The Moms Fitness Mojo Team
    `.trim();
    }

    /**
     * Generate Zelle confirmation HTML
     */
    private generateZelleConfirmationHTML(
        transaction: PaymentTransaction,
        recipient: { email: string; name: string },
        eventInfo: { title: string; date: string },
        invoice?: GuestInvoice
    ): string {
        const amount = (transaction.amount / 100).toFixed(2);
        const breakdown = transaction.metadata?.breakdown || [];
        const chargedBreakdown = this.allocateChargeBreakdown(breakdown, transaction.amount);
        const breakdownHtml = chargedBreakdown.length
            ? `<ul>${chargedBreakdown.map(item => `<li>${item.attendeeName} (${item.ageGroup}): $${(item.chargeAmount / 100).toFixed(2)}</li>`).join('')}</ul>`
            : '<p>No itemized breakdown available.</p>';

        return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Payment Verified</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #2196F3; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .details { background-color: white; padding: 15px; margin: 15px 0; border-radius: 5px; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Payment Verified!</h1>
          </div>
          <div class="content">
            <p>Dear ${recipient.name},</p>
            
            <p>We have received and verified your Zelle payment. Your registration for <strong>${eventInfo.title}</strong> is now confirmed!</p>
            
            <div class="details">
              <h2>Payment Details</h2>
              <ul>
                ${invoice ? `<li><strong>Invoice Number:</strong> ${invoice.invoiceNumber}</li>` : ''}
                <li><strong>Transaction ID:</strong> ${transaction.id}</li>
                <li><strong>Amount:</strong> $${amount} ${transaction.currency.toUpperCase()}</li>
                <li><strong>Payment Method:</strong> Zelle</li>
                <li><strong>Verified Date:</strong> ${new Date().toLocaleDateString()}</li>
              </ul>
              <h3>Itemized Receipt (Amount Paid)</h3>
              ${breakdownHtml}
            </div>
            
            <div class="details">
              <h2>Event Details</h2>
              <ul>
                <li><strong>Event:</strong> ${eventInfo.title}</li>
                <li><strong>Date:</strong> ${eventInfo.date}</li>
              </ul>
            </div>
            
            ${invoice ? '<p>Your invoice is attached to this email for your records.</p>' : ''}
            
            <p>If you have any questions, please contact us at momsfitnessmojo@gmail.com</p>
            
            <p>Best regards,<br>The Moms Fitness Mojo Team</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Moms Fitness Mojo. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
    }

    /**
     * Generate Zelle confirmation plain text
     */
    private generateZelleConfirmationText(
        transaction: PaymentTransaction,
        recipient: { email: string; name: string },
        eventInfo: { title: string; date: string },
        invoice?: GuestInvoice
    ): string {
        const amount = (transaction.amount / 100).toFixed(2);
        const breakdown = transaction.metadata?.breakdown || [];
        const chargedBreakdown = this.allocateChargeBreakdown(breakdown, transaction.amount);
        const breakdownText = chargedBreakdown.length
            ? chargedBreakdown.map(item => `- ${item.attendeeName} (${item.ageGroup}): $${(item.chargeAmount / 100).toFixed(2)}`).join('\n')
            : '- No itemized breakdown available.';

        return `
Payment Verified!

Dear ${recipient.name},

We have received and verified your Zelle payment. Your registration for ${eventInfo.title} is now confirmed!

Payment Details:
- Invoice Number: ${invoice?.invoiceNumber || 'N/A'}
- Transaction ID: ${transaction.id}
- Amount: $${amount} ${transaction.currency.toUpperCase()}
- Payment Method: Zelle
- Verified Date: ${new Date().toLocaleDateString()}

Itemized Receipt (Amount Paid):
${breakdownText}

Event Details:
- Event: ${eventInfo.title}
- Date: ${eventInfo.date}

${invoice ? 'Your invoice is attached to this email for your records.' : ''}

If you have any questions, please contact us at momsfitnessmojo@gmail.com

Best regards,
The Moms Fitness Mojo Team
    `.trim();
    }

    /**
     * Generate payment failure HTML
     */
    private generatePaymentFailureHTML(
        transaction: PaymentTransaction,
        recipient: { email: string; name: string },
        eventInfo: { title: string; date: string },
        errorMessage: string
    ): string {
        return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Payment Issue</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #f44336; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .details { background-color: white; padding: 15px; margin: 15px 0; border-radius: 5px; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Payment Issue</h1>
          </div>
          <div class="content">
            <p>Dear ${recipient.name},</p>
            
            <p>We encountered an issue processing your payment for <strong>${eventInfo.title}</strong>.</p>
            
            <div class="details">
              <h2>Error Details</h2>
              <p>${errorMessage}</p>
            </div>
            
            <p>Please try again or contact us at momsfitnessmojo@gmail.com for assistance.</p>
            
            <p>Best regards,<br>The Moms Fitness Mojo Team</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Moms Fitness Mojo. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
    }

    /**
     * Generate payment failure plain text
     */
    private generatePaymentFailureText(
        transaction: PaymentTransaction,
        recipient: { email: string; name: string },
        eventInfo: { title: string; date: string },
        errorMessage: string
    ): string {
        return `
Payment Issue

Dear ${recipient.name},

We encountered an issue processing your payment for ${eventInfo.title}.

Error Details:
${errorMessage}

Please try again or contact us at momsfitnessmojo@gmail.com for assistance.

Best regards,
The Moms Fitness Mojo Team
    `.trim();
    }

    /**
     * Log email sent/failed
     */
    private async logEmail(
        transactionId: string,
        type: string,
        success: boolean,
        error?: any,
        mailDocId?: string
    ): Promise<void> {
        await this.db.collection('email_logs').add({
            transactionId,
            type,
            success,
            error: error ? error.message : null,
            mailDocId: mailDocId || null,
            timestamp: Timestamp.now()
        });

        try {
            const notification = {
                success,
                error: error ? error.message : null,
                mailDocId: mailDocId || null,
                timestamp: Timestamp.now()
            };

            await this.db
                .collection('payment_transactions')
                .doc(transactionId)
                .set({
                    emailNotifications: {
                        [type]: notification
                    }
                }, { merge: true });
        } catch (err) {
            console.error('Error updating transaction email status:', err);
        }
    }

    /**
     * Sleep utility for retry delays
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private allocateChargeBreakdown(
        breakdown: Array<{ attendeeName: string; ageGroup: string; subtotal: number }>,
        chargeTotal: number
    ): Array<{ attendeeName: string; ageGroup: string; chargeAmount: number }> {
        if (!breakdown.length || chargeTotal <= 0) return [];

        const netTotal = breakdown.reduce((sum, item) => sum + (item.subtotal || 0), 0);
        if (netTotal <= 0) {
            return breakdown.map(item => ({
                attendeeName: item.attendeeName,
                ageGroup: item.ageGroup,
                chargeAmount: 0
            }));
        }

        let running = 0;
        return breakdown.map((item, index) => {
            if (index === breakdown.length - 1) {
                const remainder = chargeTotal - running;
                return {
                    attendeeName: item.attendeeName,
                    ageGroup: item.ageGroup,
                    chargeAmount: remainder
                };
            }
            const share = item.subtotal / netTotal;
            const allocated = Math.round(chargeTotal * share);
            running += allocated;
            return {
                attendeeName: item.attendeeName,
                ageGroup: item.ageGroup,
                chargeAmount: allocated
            };
        });
    }
}
