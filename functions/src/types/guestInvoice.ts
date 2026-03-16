import { Timestamp } from 'firebase-admin/firestore';

/**
 * Guest Invoice
 * Custom invoice generated for manually verified payments (Zelle)
 * 
 * Collection: guest_invoices
 * 
 * Invoice Number Format: INV-YYYY-NNNNNN
 * Example: INV-2024-000001
 * 
 * Security:
 * - No direct client access (Cloud Functions only)
 * - Admin read access only
 * - Generated automatically when admin marks Zelle payment as complete
 */
export interface GuestInvoice {
    /** Firestore document ID */
    id: string;

    /** Unique invoice number (format: INV-YYYY-NNNNNN) */
    invoiceNumber: string;

    /** Reference to payment_transactions document */
    transactionId: string;

    // Customer information
    /** Customer full name */
    customerName: string;

    /** Customer email address */
    customerEmail: string;

    /** Customer phone number (E.164 format) */
    customerPhone: string;

    // Payment details
    /** Payment method (always 'zelle' for guest invoices) */
    paymentMethod: 'zelle';

    /** Payment amount in cents */
    amount: number;

    /** Currency code (e.g., 'USD') */
    currency: string;

    /** Date when payment was received and verified */
    paymentDate: Timestamp;

    // Event details
    /** Event ID reference */
    eventId: string;

    /** Event title */
    eventTitle: string;

    /** Event date */
    eventDate: Timestamp;

    // Invoice metadata
    /** Confirmation message for the customer */
    confirmationMessage: string;

    /** Timestamp when invoice was generated */
    generatedAt: Timestamp;

    /** Admin user ID who generated the invoice */
    generatedBy: string;

    // PDF storage (optional)
    /** Cloud Storage URL for PDF invoice */
    pdfUrl?: string;

    /** Cloud Storage path for PDF invoice */
    pdfPath?: string;

    // Email tracking
    /** Whether confirmation email was sent */
    emailSent: boolean;

    /** Timestamp when email was sent */
    emailSentAt?: Timestamp;

    /** Email delivery error (if any) */
    emailError?: string;
}

/**
 * Invoice counter for sequential numbering
 * 
 * Collection: invoice_counters
 * Document ID: year (e.g., "2024")
 */
export interface InvoiceCounter {
    /** Current invoice count for the year */
    count: number;

    /** Last updated timestamp */
    updatedAt: Timestamp;
}

/**
 * Invoice generation result
 */
export interface InvoiceGenerationResult {
    /** Generated invoice */
    invoice: GuestInvoice;

    /** Invoice number */
    invoiceNumber: string;

    /** PDF URL (if generated) */
    pdfUrl?: string;

    /** Whether email was sent successfully */
    emailSent: boolean;

    /** Email error (if any) */
    emailError?: string;
}

/**
 * Invoice data for PDF generation
 */
export interface InvoicePDFData {
    invoiceNumber: string;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    paymentMethod: string;
    amount: number;
    currency: string;
    paymentDate: string; // Formatted date string
    eventTitle: string;
    eventDate: string; // Formatted date string
    confirmationMessage: string;
    generatedDate: string; // Formatted date string
}
