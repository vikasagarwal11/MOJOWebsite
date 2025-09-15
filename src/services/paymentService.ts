import { 
  collection, 
  doc, 
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
      console.log('🔍 PaymentService.createPaymentTransaction - START');
      console.log('📊 Input data:', {
        eventId,
        userId,
        attendeesCount: attendees.length,
        totalAmount: paymentSummary.totalAmount,
        currency: paymentSummary.currency,
        paymentMethod
      });

      const batch = writeBatch(db);
      const transactionRef = doc(collection(db, this.TRANSACTIONS_COLLECTION));
      
      console.log('🆔 Generated transaction ID:', transactionRef.id);
      
      // Create a single transaction record for the entire payment
      const transactionData: Omit<PaymentTransaction, 'id'> = {
        eventId,
        userId,
        attendeeId: attendees.length > 0 ? attendees[0].attendeeId : 'group_payment', // Use first attendee ID or group identifier
        amount: paymentSummary.totalAmount,
        currency: paymentSummary.currency,
        status: 'pending' as PaymentStatus,
        method: paymentMethod,
        refundStatus: 'none' as RefundStatus,
        metadata: {
          attendeeName: attendees.length > 0 ? attendees[0].name : '',
          ageGroup: attendees.length > 0 ? attendees[0].ageGroup : 'adult',
          eventTitle: '', // Will be populated from event data
          eventDate: '', // Will be populated from event data
          totalAttendees: attendees.length,
          breakdown: paymentSummary.breakdown,
          // Track which attendees are included in this payment
          paidAttendees: attendees.map(attendee => ({
            attendeeId: attendee.attendeeId,
            name: attendee.name,
            ageGroup: attendee.ageGroup,
            amount: paymentSummary.breakdown.find(b => b.attendeeId === attendee.attendeeId)?.subtotal || 0
          }))
        },
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      console.log('📝 Transaction data to be saved:', transactionData);
      
      batch.set(transactionRef, transactionData);
      console.log('💾 Committing batch to Firestore...');
      
      await batch.commit();
      
      console.log('✅ Payment transaction created successfully with ID:', transactionRef.id);
      return transactionRef.id;
    } catch (error) {
      console.error('❌ Error creating payment transaction:', error);
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
      console.log('🔍 PaymentService.updatePaymentStatus - START');
      console.log('📊 Input data:', {
        transactionId,
        status,
        stripePaymentIntentId,
        stripeChargeId
      });

      const transactionRef = doc(db, this.TRANSACTIONS_COLLECTION, transactionId);
      console.log('🎯 Transaction reference path:', transactionRef.path);
      
      // Build update object with only defined values
      const updateData: any = {
        status,
        updatedAt: Timestamp.now()
      };
      
      if (stripePaymentIntentId) {
        updateData.stripePaymentIntentId = stripePaymentIntentId;
      }
      
      if (stripeChargeId) {
        updateData.stripeChargeId = stripeChargeId;
      }
      
      if (status === 'paid') {
        updateData.paidAt = Timestamp.now();
      }
      
      console.log('📝 Update data to be applied:', updateData);
      console.log('💾 Updating document in Firestore...');
      
      await updateDoc(transactionRef, updateData);
      
      // If payment is successful, update attendee payment statuses
      if (status === 'paid') {
        console.log('🔄 Updating attendee payment statuses...');
        await this.updateAttendeePaymentStatuses(transactionId);
      }
      
      console.log('✅ Payment status updated successfully');
    } catch (error) {
      console.error('❌ Error updating payment status:', error);
      console.error('❌ Error details:', {
        code: (error as any)?.code,
        message: (error as any)?.message,
        stack: (error as any)?.stack
      });
      throw new Error('Failed to update payment status');
    }
  }

  /**
   * Update attendee payment statuses after successful payment
   */
  private static async updateAttendeePaymentStatuses(transactionId: string): Promise<void> {
    try {
      console.log('🔍 PaymentService.updateAttendeePaymentStatuses - START');
      console.log('📊 Transaction ID:', transactionId);

      // Get the transaction to find which attendees were paid
      const transactionDoc = await getDocs(query(
        collection(db, this.TRANSACTIONS_COLLECTION),
        where('__name__', '==', transactionId)
      ));

      if (transactionDoc.empty) {
        console.error('❌ Transaction not found:', transactionId);
        return;
      }

      const transactionData = transactionDoc.docs[0].data() as PaymentTransaction;
      console.log('📋 Transaction data:', transactionData);

      if (!transactionData.metadata?.paidAttendees) {
        console.log('⚠️ No paid attendees found in transaction metadata');
        return;
      }

      const batch = writeBatch(db);
      const paidAttendees = transactionData.metadata.paidAttendees as any[];

      console.log('👥 Updating payment status for attendees:', paidAttendees.length);

      // Update each attendee's payment status
      for (const paidAttendee of paidAttendees) {
        const attendeeRef = doc(db, 'attendees', paidAttendee.attendeeId);
        
        batch.update(attendeeRef, {
          paymentStatus: 'paid' as PaymentStatus,
          paymentTransactionId: transactionId,
          price: paidAttendee.amount,
          updatedAt: Timestamp.now()
        });

        console.log(`✅ Updated attendee ${paidAttendee.attendeeId} (${paidAttendee.name}) - $${(paidAttendee.amount / 100).toFixed(2)}`);
      }

      await batch.commit();
      console.log('✅ All attendee payment statuses updated successfully');
    } catch (error) {
      console.error('❌ Error updating attendee payment statuses:', error);
      throw new Error('Failed to update attendee payment statuses');
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
   * Get existing payments for an event by user
   */
  static async getEventPaymentsByUser(eventId: string, userId: string): Promise<PaymentTransaction[]> {
    try {
      console.log('🔍 PaymentService.getEventPaymentsByUser - START');
      console.log('📊 Input data:', { eventId, userId });

      const transactionsQuery = query(
        collection(db, this.TRANSACTIONS_COLLECTION),
        where('eventId', '==', eventId),
        where('userId', '==', userId),
        where('status', '==', 'paid'),
        orderBy('createdAt', 'desc')
      );

      const snapshot = await getDocs(transactionsQuery);
      const transactions = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as PaymentTransaction[];

      console.log('✅ Found existing payments:', transactions.length);
      return transactions;
    } catch (error) {
      console.error('❌ Error fetching event payments by user:', error);
      throw new Error('Failed to fetch event payments by user');
    }
  }

  /**
   * Get paid attendee IDs for an event by user
   */
  static async getPaidAttendeeIds(eventId: string, userId: string): Promise<Set<string>> {
    try {
      console.log('🔍 PaymentService.getPaidAttendeeIds - START');
      console.log('📊 Input data:', { eventId, userId });

      const transactions = await this.getEventPaymentsByUser(eventId, userId);
      const paidAttendeeIds = new Set<string>();

      transactions.forEach(transaction => {
        if (transaction.metadata?.paidAttendees) {
          transaction.metadata.paidAttendees.forEach((paidAttendee: any) => {
            paidAttendeeIds.add(paidAttendee.attendeeId);
          });
        }
      });

      console.log('✅ Found paid attendee IDs:', Array.from(paidAttendeeIds));
      return paidAttendeeIds;
    } catch (error) {
      console.error('❌ Error fetching paid attendee IDs:', error);
      throw new Error('Failed to fetch paid attendee IDs');
    }
  }

  /**
   * Confirm payment and update all related records
   */
  static async confirmPayment(
    transactionId: string,
    stripePaymentIntentId?: string,
    stripeChargeId?: string
  ): Promise<void> {
    try {
      console.log('🔍 PaymentService.confirmPayment - START');
      console.log('📊 Input data:', {
        transactionId,
        stripePaymentIntentId,
        stripeChargeId
      });

      // Update payment status (this will also update attendee statuses)
      await this.updatePaymentStatus(
        transactionId,
        'paid',
        stripePaymentIntentId,
        stripeChargeId
      );

      console.log('✅ Payment confirmed successfully');
    } catch (error) {
      console.error('❌ Error confirming payment:', error);
      throw new Error('Failed to confirm payment');
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
      currency
      // refundPolicy will be set separately based on user choice
    };
  }
}
