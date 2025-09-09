import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  Timestamp,
  writeBatch
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { 
  PaymentTransaction, 
  PaymentSummary, 
  EventPricing, 
  AgeGroupPricing,
  PaymentStatus,
  RefundStatus,
  PaymentMethod
} from '../types/payment';
import { Attendee, AgeGroup } from '../types/attendee';

export class PaymentService {
  private static readonly TRANSACTIONS_COLLECTION = 'payment_transactions';
  private static readonly PAYMENT_CONFIG_COLLECTION = 'payment_config';

  /**
   * Calculate payment summary for attendees
   */
  static calculatePaymentSummary(
    attendees: Attendee[], 
    eventPricing: EventPricing
  ): PaymentSummary {
    if (!eventPricing.requiresPayment || eventPricing.isFree) {
      return {
        totalAmount: 0,
        currency: eventPricing.currency,
        breakdown: [],
        status: 'paid' as PaymentStatus,
        canRefund: false
      };
    }

    const breakdown = attendees
      .filter(attendee => attendee.rsvpStatus === 'going')
      .map(attendee => {
        const price = this.getPriceForAgeGroup(attendee.ageGroup, eventPricing);
        return {
          attendeeId: attendee.attendeeId,
          attendeeName: attendee.name,
          ageGroup: attendee.ageGroup,
          price,
          quantity: 1,
          subtotal: price
        };
      });

    const totalAmount = breakdown.reduce((sum, item) => sum + item.subtotal, 0);

    return {
      totalAmount,
      currency: eventPricing.currency,
      breakdown,
      status: 'unpaid' as PaymentStatus,
      canRefund: eventPricing.refundPolicy?.allowed || false,
      refundDeadline: eventPricing.refundPolicy?.deadline
    };
  }

  /**
   * Get price for specific age group
   */
  private static getPriceForAgeGroup(ageGroup: AgeGroup, pricing: EventPricing): number {
    if (pricing.isFree || !pricing.requiresPayment) return 0;

    // Find specific age group pricing
    const ageGroupPricing = pricing.ageGroupPricing.find(
      p => p.ageGroup === ageGroup
    );

    if (ageGroupPricing) {
      return ageGroupPricing.price;
    }

    // Fallback to adult price
    return pricing.adultPrice;
  }

  /**
   * Create payment transaction record
   */
  static async createPaymentTransaction(
    eventId: string,
    userId: string,
    attendees: Attendee[],
    paymentSummary: PaymentSummary,
    paymentMethod: PaymentMethod = 'card'
  ): Promise<string> {
    try {
      const batch = writeBatch(db);
      const transactionRef = doc(collection(db, this.TRANSACTIONS_COLLECTION));
      
      // Create transaction for each attendee
      for (const breakdownItem of paymentSummary.breakdown) {
        const attendee = attendees.find(a => a.attendeeId === breakdownItem.attendeeId);
        if (!attendee) continue;

        const transactionData: Omit<PaymentTransaction, 'id'> = {
          eventId,
          userId,
          attendeeId: attendee.attendeeId,
          amount: breakdownItem.subtotal,
          currency: paymentSummary.currency,
          status: 'pending' as PaymentStatus,
          method: paymentMethod,
          refundStatus: 'none' as RefundStatus,
          metadata: {
            attendeeName: attendee.name,
            ageGroup: attendee.ageGroup,
            eventTitle: '', // Will be populated from event data
            eventDate: '' // Will be populated from event data
          },
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now()
        };

        const attendeeTransactionRef = doc(collection(db, this.TRANSACTIONS_COLLECTION));
        batch.set(attendeeTransactionRef, transactionData);

        // Update attendee with transaction reference
        const attendeeRef = doc(db, 'attendees', attendee.attendeeId);
        batch.update(attendeeRef, {
          paymentTransactionId: attendeeTransactionRef.id,
          paymentStatus: 'pending' as PaymentStatus,
          price: breakdownItem.subtotal,
          updatedAt: Timestamp.now()
        });
      }

      await batch.commit();
      return transactionRef.id;
    } catch (error) {
      console.error('Error creating payment transaction:', error);
      throw new Error('Failed to create payment transaction');
    }
  }

  /**
   * Update payment status
   */
  static async updatePaymentStatus(
    transactionId: string,
    status: PaymentStatus,
    stripePaymentIntentId?: string,
    stripeChargeId?: string
  ): Promise<void> {
    try {
      const transactionRef = doc(db, this.TRANSACTIONS_COLLECTION, transactionId);
      await updateDoc(transactionRef, {
        status,
        stripePaymentIntentId,
        stripeChargeId,
        paidAt: status === 'paid' ? Timestamp.now() : undefined,
        updatedAt: Timestamp.now()
      });

      // Update attendee payment status
      const transactionDoc = await getDocs(query(
        collection(db, this.TRANSACTIONS_COLLECTION),
        where('__name__', '==', transactionId)
      ));

      if (!transactionDoc.empty) {
        const transactionData = transactionDoc.docs[0].data() as PaymentTransaction;
        const attendeeRef = doc(db, 'attendees', transactionData.attendeeId);
        await updateDoc(attendeeRef, {
          paymentStatus: status,
          updatedAt: Timestamp.now()
        });
      }
    } catch (error) {
      console.error('Error updating payment status:', error);
      throw new Error('Failed to update payment status');
    }
  }

  /**
   * Get payment transactions for an event
   */
  static async getEventPaymentTransactions(eventId: string): Promise<PaymentTransaction[]> {
    try {
      const transactionsQuery = query(
        collection(db, this.TRANSACTIONS_COLLECTION),
        where('eventId', '==', eventId),
        orderBy('createdAt', 'desc')
      );

      const snapshot = await getDocs(transactionsQuery);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as PaymentTransaction[];
    } catch (error) {
      console.error('Error fetching payment transactions:', error);
      throw new Error('Failed to fetch payment transactions');
    }
  }

  /**
   * Get payment transactions for a user
   */
  static async getUserPaymentTransactions(userId: string): Promise<PaymentTransaction[]> {
    try {
      const transactionsQuery = query(
        collection(db, this.TRANSACTIONS_COLLECTION),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc')
      );

      const snapshot = await getDocs(transactionsQuery);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as PaymentTransaction[];
    } catch (error) {
      console.error('Error fetching user payment transactions:', error);
      throw new Error('Failed to fetch user payment transactions');
    }
  }

  /**
   * Process refund
   */
  static async processRefund(
    transactionId: string,
    refundAmount: number,
    reason: string
  ): Promise<void> {
    try {
      const transactionRef = doc(db, this.TRANSACTIONS_COLLECTION, transactionId);
      const transactionDoc = await getDocs(query(
        collection(db, this.TRANSACTIONS_COLLECTION),
        where('__name__', '==', transactionId)
      ));

      if (transactionDoc.empty) {
        throw new Error('Transaction not found');
      }

      const transactionData = transactionDoc.docs[0].data() as PaymentTransaction;
      const isFullRefund = refundAmount >= transactionData.amount;

      await updateDoc(transactionRef, {
        refundStatus: isFullRefund ? 'full' : 'partial',
        refundedAmount: refundAmount,
        refundReason: reason,
        refundedAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });

      // Update attendee payment status
      const attendeeRef = doc(db, 'attendees', transactionData.attendeeId);
      await updateDoc(attendeeRef, {
        paymentStatus: isFullRefund ? 'refunded' : 'paid',
        updatedAt: Timestamp.now()
      });
    } catch (error) {
      console.error('Error processing refund:', error);
      throw new Error('Failed to process refund');
    }
  }

  /**
   * Get payment analytics for an event
   */
  static async getEventPaymentAnalytics(eventId: string): Promise<{
    totalRevenue: number;
    totalTransactions: number;
    paidTransactions: number;
    refundedTransactions: number;
    averageTransactionValue: number;
  }> {
    try {
      const transactions = await this.getEventPaymentTransactions(eventId);
      
      const paidTransactions = transactions.filter(t => t.status === 'paid');
      const refundedTransactions = transactions.filter(t => t.status === 'refunded');
      
      const totalRevenue = paidTransactions.reduce((sum, t) => sum + t.amount, 0);
      const totalTransactions = transactions.length;
      const averageTransactionValue = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

      return {
        totalRevenue,
        totalTransactions,
        paidTransactions: paidTransactions.length,
        refundedTransactions: refundedTransactions.length,
        averageTransactionValue
      };
    } catch (error) {
      console.error('Error calculating payment analytics:', error);
      throw new Error('Failed to calculate payment analytics');
    }
  }

  /**
   * Create default pricing configuration
   */
  static createDefaultPricing(): EventPricing {
    return {
      isFree: true,
      requiresPayment: false,
      adultPrice: 0,
      ageGroupPricing: [
        { ageGroup: '0-2', price: 0, label: 'Infants (0-2)' },
        { ageGroup: '3-5', price: 0, label: 'Children (3-5)' },
        { ageGroup: '6-10', price: 0, label: 'Children (6-10)' },
        { ageGroup: '11+', price: 0, label: 'Teens (11+)' },
        { ageGroup: 'adult', price: 0, label: 'Adults' }
      ],
      currency: 'USD',
      refundPolicy: {
        allowed: false
      }
    };
  }

  /**
   * Create paid event pricing
   */
  static createPaidEventPricing(
    adultPrice: number,
    ageGroupPricing: Partial<Record<AgeGroup, number>> = {},
    currency: string = 'USD'
  ): EventPricing {
    const defaultPricing: AgeGroupPricing[] = [
      { ageGroup: '0-2', price: 0, label: 'Infants (0-2)' },
      { ageGroup: '3-5', price: Math.round(adultPrice * 0.5), label: 'Children (3-5)' },
      { ageGroup: '6-10', price: Math.round(adultPrice * 0.7), label: 'Children (6-10)' },
      { ageGroup: '11+', price: Math.round(adultPrice * 0.8), label: 'Teens (11+)' },
      { ageGroup: 'adult', price: adultPrice, label: 'Adults' }
    ];

    // Override with custom pricing
    const finalPricing = defaultPricing.map(pricing => ({
      ...pricing,
      price: ageGroupPricing[pricing.ageGroup] ?? pricing.price
    }));

    return {
      isFree: false,
      requiresPayment: true,
      adultPrice,
      ageGroupPricing: finalPricing,
      currency,
      refundPolicy: {
        allowed: true,
        feePercentage: 5 // 5% refund fee
      }
    };
  }
}
