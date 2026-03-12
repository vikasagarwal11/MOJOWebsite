import { getFirestore } from 'firebase-admin/firestore';
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import { EmailNotificationService } from '../services/emailNotificationService';
import { GuestSessionService } from '../services/guestSessionService';
import { InvoiceGeneratorService } from '../services/invoiceGeneratorService';
import { MarkPaymentCompleteResponse, PaymentTransaction } from '../types/paymentTransaction';

/**
 * Mark Zelle Payment Complete Callable Function
 * Admin function to mark Zelle payment as completed and send confirmation
 */

interface MarkZelleCompleteRequest {
    transactionId: string;
    adminNotes?: string;
}

/**
 * Verify admin role
 */
async function verifyAdminRole(uid: string, db: any): Promise<boolean> {
    const userDoc = await db.collection('users').doc(uid).get();

    if (!userDoc.exists) {
        return false;
    }

    const userData = userDoc.data();
    return userData.role === 'admin' || userData.role === 'super_admin';
}

export const markZellePaymentComplete = onCall(
    { region: 'us-east1' },
    async (request: CallableRequest<MarkZelleCompleteRequest>): Promise<MarkPaymentCompleteResponse> => {
        try {
            // Verify authentication
            if (!request.auth) {
                throw new HttpsError('unauthenticated', 'Authentication required');
            }

            const { transactionId, adminNotes } = request.data;

            // Validate required fields
            if (!transactionId) {
                throw new HttpsError(
                    'invalid-argument',
                    'Missing required field: transactionId'
                );
            }

            // Initialize services
            const db = getFirestore();

            // Verify admin role
            const isAdmin = await verifyAdminRole(request.auth.uid, db);
            if (!isAdmin) {
                throw new HttpsError('permission-denied', 'Admin access required');
            }

            // Get transaction
            const transactionDoc = await db
                .collection('payment_transactions')
                .doc(transactionId)
                .get();

            if (!transactionDoc.exists) {
                throw new HttpsError('not-found', 'Transaction not found');
            }

            const transaction = transactionDoc.data() as PaymentTransaction;
            const transactionWithId: PaymentTransaction = {
                ...transaction,
                id: transactionDoc.id
            };

            // Validate transaction status
            if (transaction.status !== 'pending') {
                throw new HttpsError(
                    'failed-precondition',
                    `Transaction status is ${transaction.status}, expected pending`
                );
            }

            // Validate payment method
            if (transaction.method !== 'zelle') {
                throw new HttpsError(
                    'failed-precondition',
                    'Only Zelle payments can be manually verified'
                );
            }

            // Update transaction status
            await transactionDoc.ref.update({
                status: 'paid',
                paidAt: new Date(),
                verifiedBy: request.auth.uid,
                verifiedAt: new Date(),
                adminNotes: adminNotes || '',
                updatedAt: new Date()
            });

            // Update attendee payment status for all paid attendees
            if (transaction.metadata?.paidAttendees && transaction.eventId) {
                const batch = db.batch();
                for (const attendee of transaction.metadata.paidAttendees) {
                    const attendeeRef = db
                        .collection('events')
                        .doc(transaction.eventId)
                        .collection('attendees')
                        .doc(attendee.attendeeId);
                    batch.update(attendeeRef, {
                        paymentStatus: 'paid',
                        paymentTransactionId: transactionId,
                        price: attendee.amount,
                        updatedAt: new Date()
                    });
                }
                await batch.commit();
            }

            // Generate invoice for guest payments only
            const isGuestPayment = transaction.isGuestPayment === true;
            let invoice: any | undefined;
            let invoiceNumber: string | undefined;
            let invoiceUrl: string | undefined;

            if (isGuestPayment) {
                const invoiceService = new InvoiceGeneratorService(db);
                invoice = await invoiceService.generateInvoice(
                    transactionId,
                    request.auth.uid
                );
                invoiceNumber = invoice.invoiceNumber;
                invoiceUrl = invoice.pdfUrl;
            }

            // Send confirmation email
            const emailService = new EmailNotificationService(db);
            let emailSent = false;
            let emailError: string | undefined;
            let emailDebugId: string | undefined;

            try {
                emailDebugId = await emailService.sendZelleConfirmation(transactionWithId, invoice);
                emailSent = true;

                if (invoice?.id) {
                    const invoiceService = new InvoiceGeneratorService(db);
                    await invoiceService.updateEmailStatus(invoice.id, true);
                }
            } catch (error: any) {
                console.error('Error sending confirmation email:', error);
                emailError = error.message;

                if (invoice?.id) {
                    const invoiceService = new InvoiceGeneratorService(db);
                    await invoiceService.updateEmailStatus(invoice.id, false, emailError);
                }
            }

            // Invalidate guest session if exists
            if (transaction.guestSessionToken) {
                try {
                    const sessionService = new GuestSessionService(db);
                    await sessionService.invalidateSession(
                        transaction.guestSessionToken,
                        'payment_complete'
                    );
                } catch (error) {
                    console.error('Error invalidating session:', error);
                    // Don't fail the whole operation if session invalidation fails
                }
            }

            return {
                success: true,
                invoiceNumber,
                invoiceUrl,
                emailSent,
                error: emailError,
                emailDebugId
            };
        } catch (error: any) {
            console.error('Error in markZellePaymentComplete:', error);

            if (error instanceof HttpsError) {
                throw error;
            }

            throw new HttpsError('internal', 'Failed to mark payment as complete');
        }
    }
);
