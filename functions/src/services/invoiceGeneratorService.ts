import { Firestore, Timestamp } from 'firebase-admin/firestore';
import {
    GuestInvoice,
    InvoiceCounter,
    InvoicePDFData
} from '../types/guestInvoice';
import { PaymentTransaction } from '../types/paymentTransaction';

/**
 * Invoice Generator Service
 * Generates custom invoices for manually verified payments (Zelle)
 */
export class InvoiceGeneratorService {
    private db: Firestore;

    constructor(db: Firestore) {
        this.db = db;
    }

    /**
     * Generate invoice for completed payment
     * @param transactionId - Payment transaction ID
     * @param adminUserId - Admin user ID who verified the payment
     * @returns Invoice document
     */
    async generateInvoice(
        transactionId: string,
        adminUserId: string
    ): Promise<GuestInvoice> {
        try {
            // Get transaction
            const transactionDoc = await this.db
                .collection('payment_transactions')
                .doc(transactionId)
                .get();

            if (!transactionDoc.exists) {
                throw new Error('Transaction not found');
            }

            const transaction = transactionDoc.data() as PaymentTransaction;

            // Validate transaction is guest payment
            if (!transaction.isGuestPayment || !transaction.guestContactInfo) {
                throw new Error('Transaction is not a guest payment');
            }

            // Validate payment method is Zelle
            if (transaction.method !== 'zelle') {
                throw new Error('Invoice generation only supported for Zelle payments');
            }

            // Generate invoice number
            const invoiceNumber = await this.getNextInvoiceNumber();

            // Create invoice document
            const invoiceId = this.db.collection('guest_invoices').doc().id;

            const invoice: GuestInvoice = {
                id: invoiceId,
                invoiceNumber,
                transactionId,
                customerName: `${transaction.guestContactInfo.firstName} ${transaction.guestContactInfo.lastName}`,
                customerEmail: transaction.guestContactInfo.email,
                customerPhone: transaction.guestContactInfo.phone,
                paymentMethod: 'zelle',
                amount: transaction.amount,
                currency: transaction.currency,
                paymentDate: transaction.paidAt || Timestamp.now(),
                eventId: transaction.eventId,
                eventTitle: transaction.metadata.eventTitle,
                eventDate: Timestamp.fromDate(new Date(transaction.metadata.eventDate)),
                confirmationMessage: `Thank you for your payment! Your registration for ${transaction.metadata.eventTitle} has been confirmed.`,
                generatedAt: Timestamp.now(),
                generatedBy: adminUserId,
                emailSent: false
            };

            // Store invoice
            await this.db
                .collection('guest_invoices')
                .doc(invoiceId)
                .set(invoice);

            // Update transaction with invoice reference
            await this.db
                .collection('payment_transactions')
                .doc(transactionId)
                .update({
                    invoiceId,
                    invoiceNumber,
                    updatedAt: Timestamp.now()
                });

            return invoice;
        } catch (error) {
            console.error('Error generating invoice:', error);
            throw new Error('Failed to generate invoice');
        }
    }

    /**
     * Get next invoice number
     * Format: INV-YYYY-NNNNNN
     * @returns Sequential invoice number
     */
    async getNextInvoiceNumber(): Promise<string> {
        const year = new Date().getFullYear().toString();
        const counterRef = this.db.collection('invoice_counters').doc(year);

        try {
            // Use transaction to ensure atomic increment
            const invoiceNumber = await this.db.runTransaction(async (transaction) => {
                const counterDoc = await transaction.get(counterRef);

                let currentCount = 0;

                if (counterDoc.exists) {
                    const counterData = counterDoc.data() as InvoiceCounter;
                    currentCount = counterData.count;
                }

                const nextCount = currentCount + 1;

                // Update counter
                transaction.set(counterRef, {
                    count: nextCount,
                    updatedAt: Timestamp.now()
                });

                // Format invoice number: INV-YYYY-NNNNNN
                return `INV-${year}-${nextCount.toString().padStart(6, '0')}`;
            });

            return invoiceNumber;
        } catch (error) {
            console.error('Error getting next invoice number:', error);
            throw new Error('Failed to generate invoice number');
        }
    }

    /**
     * Store invoice document
     * @param invoice - Invoice to store
     * @returns Stored invoice ID
     */
    async storeInvoice(invoice: GuestInvoice): Promise<string> {
        try {
            const invoiceRef = await this.db
                .collection('guest_invoices')
                .add(invoice);

            return invoiceRef.id;
        } catch (error) {
            console.error('Error storing invoice:', error);
            throw new Error('Failed to store invoice');
        }
    }

    /**
     * Get invoice by ID
     * @param invoiceId - Invoice ID
     * @returns Invoice data or null
     */
    async getInvoice(invoiceId: string): Promise<GuestInvoice | null> {
        const invoiceDoc = await this.db
            .collection('guest_invoices')
            .doc(invoiceId)
            .get();

        if (!invoiceDoc.exists) {
            return null;
        }

        return invoiceDoc.data() as GuestInvoice;
    }

    /**
     * Get invoice by invoice number
     * @param invoiceNumber - Invoice number
     * @returns Invoice data or null
     */
    async getInvoiceByNumber(invoiceNumber: string): Promise<GuestInvoice | null> {
        const invoiceQuery = await this.db
            .collection('guest_invoices')
            .where('invoiceNumber', '==', invoiceNumber)
            .limit(1)
            .get();

        if (invoiceQuery.empty) {
            return null;
        }

        return invoiceQuery.docs[0].data() as GuestInvoice;
    }

    /**
     * Get invoice by transaction ID
     * @param transactionId - Transaction ID
     * @returns Invoice data or null
     */
    async getInvoiceByTransactionId(transactionId: string): Promise<GuestInvoice | null> {
        const invoiceQuery = await this.db
            .collection('guest_invoices')
            .where('transactionId', '==', transactionId)
            .limit(1)
            .get();

        if (invoiceQuery.empty) {
            return null;
        }

        return invoiceQuery.docs[0].data() as GuestInvoice;
    }

    /**
     * Update invoice email status
     * @param invoiceId - Invoice ID
     * @param sent - Whether email was sent
     * @param error - Email error if any
     */
    async updateEmailStatus(
        invoiceId: string,
        sent: boolean,
        error?: string
    ): Promise<void> {
        await this.db
            .collection('guest_invoices')
            .doc(invoiceId)
            .update({
                emailSent: sent,
                emailSentAt: sent ? Timestamp.now() : null,
                emailError: error || null
            });
    }

    /**
     * Generate invoice PDF data
     * @param invoice - Invoice data
     * @returns PDF data for rendering
     */
    generateInvoicePDFData(invoice: GuestInvoice): InvoicePDFData {
        return {
            invoiceNumber: invoice.invoiceNumber,
            customerName: invoice.customerName,
            customerEmail: invoice.customerEmail,
            customerPhone: invoice.customerPhone,
            paymentMethod: 'Zelle',
            amount: invoice.amount / 100, // Convert cents to dollars
            currency: invoice.currency.toUpperCase(),
            paymentDate: invoice.paymentDate.toDate().toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }),
            eventTitle: invoice.eventTitle,
            eventDate: invoice.eventDate.toDate().toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }),
            confirmationMessage: invoice.confirmationMessage,
            generatedDate: invoice.generatedAt.toDate().toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            })
        };
    }
}
