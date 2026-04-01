import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where,
  writeBatch
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { AgeGroup, Attendee } from '../types/attendee';
import {
  AgeGroupPricing,
  EventPricing,
  PaymentMethod,
  PaymentStatus,
  PaymentSummary,
  PaymentTransaction,
  RefundStatus
} from '../types/payment';
import { calculateChargeAmount } from '../utils/stripePricing';

export class PaymentService {
  private static readonly TRANSACTIONS_COLLECTION = 'payment_transactions';

  /**
   * Calculate payment summary for attendees with Stripe fees applied proportionally
   * For Zelle payments, uses manual amounts without Stripe fee calculations
   */
  static calculatePaymentSummary(
    attendees: Attendee[], 
    eventPricing: EventPricing
  ): PaymentSummary {
    // Check if event has event support amount even without requiring payment
    const hasEventSupportAmount = eventPricing.eventSupportAmount && eventPricing.eventSupportAmount > 0;
    
    // If no payment required and no event support amount, return free event summary
    if (!eventPricing.requiresPayment && !hasEventSupportAmount) {
      return {
        totalAmount: 0,
        currency: eventPricing.currency,
        breakdown: [],
        status: 'paid' as PaymentStatus,
        canRefund: false
      };
    }

    // Check if this is a Zelle payment (no Stripe fees)
    const isZellePayment = eventPricing.paymentMethod === 'zelle';

    // Build price components for Stripe fee distribution
    // CRITICAL: Calculate Stripe fees ONCE on the total, then distribute proportionally
    // This matches how Stripe actually charges and prevents rounding discrepancies
    const goingAttendees = attendees.filter(attendee => attendee.rsvpStatus === 'going');
    
    // First pass: Calculate NET amounts for all attendees
    const attendeeNetPrices = goingAttendees.map((attendee) => {
      const netTicketPrice = eventPricing.requiresPayment && !eventPricing.isFree 
        ? this.getPriceForAgeGroup(attendee.ageGroup, eventPricing)
        : 0;
      
      const netEventSupport = hasEventSupportAmount ? eventPricing.eventSupportAmount : 0;
      
      return {
        attendeeId: attendee.attendeeId,
        attendeeName: attendee.name,
        ageGroup: attendee.ageGroup,
        netTicketPrice,
        netEventSupport,
        netTotal: netTicketPrice + netEventSupport
      };
    });
    
    // For Zelle payments, use NET prices directly (no Stripe fees)
    if (isZellePayment) {
      const breakdown = attendeeNetPrices.map(({ attendeeId, attendeeName, ageGroup, netTicketPrice, netEventSupport, netTotal }) => ({
        attendeeId,
        attendeeName,
        ageGroup,
        price: netTotal,
        quantity: 1,
        subtotal: netTotal,
        ticketPrice: netTicketPrice,
        eventSupport: netEventSupport
      }));
      
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
    
    // For Stripe payments: Calculate total NET, then calculate total CHARGE, then distribute proportionally
    const totalNet = attendeeNetPrices.reduce((sum, a) => sum + a.netTotal, 0);
    const totalCharge = calculateChargeAmount(totalNet);
    
    // Distribute the total charge amount proportionally across attendees
    const breakdown = attendeeNetPrices.map((attendee) => {
      // Calculate this attendee's proportion of the total NET amount
      const proportion = attendee.netTotal / totalNet;
      const attendeeCharge = Math.round(totalCharge * proportion);
      
      // Now distribute this attendee's charge between ticket and support proportionally
      const ticketProportion = attendee.netTicketPrice / attendee.netTotal;
      const supportProportion = attendee.netEventSupport / attendee.netTotal;
      
      let ticketCharge = Math.round(attendeeCharge * ticketProportion);
      let supportCharge = Math.round(attendeeCharge * supportProportion);
      
      // Handle rounding: ensure ticket + support = attendeeCharge
      const roundingDiff = attendeeCharge - (ticketCharge + supportCharge);
      if (roundingDiff !== 0) {
        // Add rounding difference to the larger component
        if (ticketCharge > supportCharge) {
          ticketCharge += roundingDiff;
        } else {
          supportCharge += roundingDiff;
        }
      }
      
      return {
        attendeeId: attendee.attendeeId,
        attendeeName: attendee.attendeeName,
        ageGroup: attendee.ageGroup,
        price: attendeeCharge,
        quantity: 1,
        subtotal: attendeeCharge,
        ticketPrice: ticketCharge,
        eventSupport: supportCharge
      };
    });
    
    // Handle final rounding: ensure sum of attendee charges equals total charge
    const calculatedSum = breakdown.reduce((sum, item) => sum + item.subtotal, 0);
    const roundingDiff = totalCharge - calculatedSum;
    
    if (roundingDiff !== 0) {
      // Add rounding difference to the largest attendee charge
      const largestIndex = breakdown.reduce((maxIdx, current, idx, arr) => 
        current.subtotal > arr[maxIdx].subtotal ? idx : maxIdx
      , 0);
      
      breakdown[largestIndex].subtotal += roundingDiff;
      breakdown[largestIndex].price += roundingDiff;
      
      // Adjust the larger component (ticket or support)
      if (breakdown[largestIndex].ticketPrice > breakdown[largestIndex].eventSupport) {
        breakdown[largestIndex].ticketPrice += roundingDiff;
      } else {
        breakdown[largestIndex].eventSupport += roundingDiff;
      }
    }

    // Calculate total charge amount (sum of all attendee charges)
    const totalAmount = breakdown.reduce((sum, item) => sum + item.subtotal, 0);

    return {
      totalAmount, // Total CHARGE amount (including Stripe fees for Stripe, or NET for Zelle)
      currency: eventPricing.currency,
      breakdown,
      status: 'unpaid' as PaymentStatus,
      canRefund: eventPricing.refundPolicy?.allowed || false,
      refundDeadline: eventPricing.refundPolicy?.deadline
    };
  }

  /**
   * Get NET price for specific age group (what admin receives after Stripe fees)
   * This returns the NET amount stored in the event pricing configuration
   */
  private static getPriceForAgeGroup(ageGroup: AgeGroup, pricing: EventPricing): number {
    if (pricing.isFree || !pricing.requiresPayment) return 0;

    // Find specific age group pricing (NET amount)
    const ageGroupPricing = pricing.ageGroupPricing.find(
      p => p.ageGroup === ageGroup
    );

    if (ageGroupPricing) {
      return ageGroupPricing.price; // NET price
    }

    // Fallback to adult price (NET)
    return pricing.adultPrice; // NET price
  }

  /**
   * Get CHARGE price for specific age group (what user pays including Stripe fees)
   * This calculates the charge amount from the NET amount
   */
  static getChargePriceForAgeGroup(ageGroup: AgeGroup, pricing: EventPricing): number {
    const netPrice = this.getPriceForAgeGroup(ageGroup, pricing);
    if (netPrice === 0) return 0;
    
    // Calculate charge amount including Stripe fees
    return calculateChargeAmount(netPrice);
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
      const transactionRef = doc(db, this.TRANSACTIONS_COLLECTION, transactionId);
      const transactionDoc = await getDoc(transactionRef);

      if (!transactionDoc.exists()) {
        console.error('❌ Transaction not found:', transactionId);
        throw new Error(`Transaction ${transactionId} not found`);
      }

      const transactionData = transactionDoc.data() as PaymentTransaction;
      console.log('📋 Transaction data:', {
        eventId: transactionData.eventId,
        userId: transactionData.userId,
        amount: transactionData.amount,
        paidAttendeesCount: transactionData.metadata?.paidAttendees?.length || 0
      });

      if (!transactionData.metadata?.paidAttendees) {
        console.log('⚠️ No paid attendees found in transaction metadata');
        return;
      }

      if (!transactionData.eventId) {
        console.error('❌ No eventId in transaction data');
        throw new Error('Transaction missing eventId');
      }

      const batch = writeBatch(db);
      const paidAttendees = transactionData.metadata.paidAttendees as any[];

      console.log('👥 Updating payment status for', paidAttendees.length, 'attendee(s)');

      // Update each attendee's payment status in the correct subcollection
      for (const paidAttendee of paidAttendees) {
        // CRITICAL: Use events/{eventId}/attendees subcollection, not top-level attendees
        const attendeeRef = doc(
          db, 
          'events', 
          transactionData.eventId, 
          'attendees', 
          paidAttendee.attendeeId
        );
        
        batch.update(attendeeRef, {
          paymentStatus: 'paid' as PaymentStatus,
          paymentTransactionId: transactionId,
          price: paidAttendee.amount,
          updatedAt: Timestamp.now()
        });

        console.log(`✅ Queued update for attendee ${paidAttendee.attendeeId} (${paidAttendee.name}) - $${(paidAttendee.amount / 100).toFixed(2)}`);
      }

      await batch.commit();
      console.log('✅ All attendee payment statuses updated successfully in Firestore');
    } catch (error) {
      console.error('❌ Error updating attendee payment statuses:', error);
      throw new Error('Failed to update attendee payment statuses: ' + (error as Error).message);
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
      const transactionDoc = await getDoc(transactionRef);

      if (!transactionDoc.exists()) {
        throw new Error('Transaction not found');
      }

      const transactionData = transactionDoc.data() as PaymentTransaction;
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
        { ageGroup: '0-2', price: 0, label: 'Infant (0-2)' },
        { ageGroup: '3-5', price: 0, label: 'Toddler (3-5)' },
        { ageGroup: '6-10', price: 0, label: 'Children (6-10)' },
        { ageGroup: '11+', price: 0, label: 'Teen (11+)' },
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
   * 
   * @param adultPrice - Adult ticket price in CENTS (e.g., 10000 cents = $100.00)
   * @param ageGroupPricing - Custom pricing for specific age groups in CENTS
   * @param currency - Currency code (default: USD)
   * @returns EventPricing configuration with all age group prices calculated
   * 
   * PRICING CALCULATION LOGIC:
   * - All prices are stored in CENTS to avoid floating-point errors
   * - Input: adultPrice is already converted to cents (e.g., $100 -> 10000 cents)
   * - Default percentages: Infant 0%, Toddler 50%, Child 70%, Teen 80%, Adult 100%
   * - Example: Adult $100 (10000¢) -> Toddler $50 (5000¢), Child $70 (7000¢), Teen $80 (8000¢)
   * - Custom prices override defaults if provided
   */
  static createPaidEventPricing(
    adultPrice: number,
    ageGroupPricing: Partial<Record<AgeGroup, number>> = {},
    currency: string = 'USD'
  ): EventPricing {
    // Calculate default pricing based on adult price (already in cents)
    // Using percentages: Toddler 50%, Child 70%, Teen 80%
    const defaultPricing: AgeGroupPricing[] = [
      { ageGroup: '0-2', price: 0, label: 'Infant (0-2)' },
      { ageGroup: '3-5', price: Math.round(adultPrice * 0.5), label: 'Toddler (3-5)' },
      { ageGroup: '6-10', price: Math.round(adultPrice * 0.7), label: 'Children (6-10)' },
      { ageGroup: '11+', price: Math.round(adultPrice * 0.8), label: 'Teen (11+)' },
      { ageGroup: 'adult', price: adultPrice, label: 'Adults' }
    ];

    // Override with custom pricing if provided (custom prices are already in cents)
    const finalPricing = defaultPricing.map(pricing => ({
      ...pricing,
      price: ageGroupPricing[pricing.ageGroup] !== undefined ? ageGroupPricing[pricing.ageGroup]! : pricing.price
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

  /**
   * Admin manual payment status update
   * Updates attendee payment status and creates/updates transaction record
   * Used when admin manually marks payment as paid or unpaid
   */
  static async adminUpdatePaymentStatus(
    eventId: string,
    attendeeId: string,
    newStatus: 'paid' | 'unpaid',
    adminUserId: string,
    eventPricing: EventPricing
  ): Promise<void> {
    try {
      console.log('🔧 Admin updating payment status:', {
        eventId,
        attendeeId,
        newStatus,
        adminUserId
      });

      // Get attendee data
      const attendeeRef = doc(db, 'events', eventId, 'attendees', attendeeId);
      const attendeeSnap = await getDoc(attendeeRef);

      if (!attendeeSnap.exists()) {
        throw new Error('Attendee not found');
      }

      const attendeeData = attendeeSnap.data() as Attendee;
      
      const batch = writeBatch(db);

      // If marking as paid, create a transaction record for audit trail
      if (newStatus === 'paid') {
        const transactionRef = doc(collection(db, this.TRANSACTIONS_COLLECTION));
        const amount = this.getPriceForAgeGroup(attendeeData.ageGroup, eventPricing);
        const derivedMethod: PaymentMethod =
          eventPricing.paymentMethod === 'zelle'
            ? 'zelle'
            : eventPricing.paymentMethod === 'stripe'
              ? 'card'
              : 'other';
        
        batch.update(attendeeRef, {
          paymentStatus: newStatus,
          paymentTransactionId: transactionRef.id,
          updatedAt: Timestamp.now()
        });

        batch.set(transactionRef, {
          eventId,
          userId: attendeeData.userId,
          attendeeId,
          amount,
          currency: eventPricing.currency,
          status: 'paid' as PaymentStatus,
          method: derivedMethod,
          refundStatus: 'none' as RefundStatus,
          metadata: {
            attendeeName: attendeeData.name,
            ageGroup: attendeeData.ageGroup,
            eventTitle: '',
            eventDate: '',
            totalAttendees: 1,
            breakdown: [{
              attendeeId,
              attendeeName: attendeeData.name,
              ageGroup: attendeeData.ageGroup,
              price: amount,
              quantity: 1,
              subtotal: amount
            }],
            paidAttendees: [{
              attendeeId,
              name: attendeeData.name,
              ageGroup: attendeeData.ageGroup,
              amount
            }],
            adminManualUpdate: true,
            adminUserId
          },
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          paidAt: Timestamp.now()
        });

        console.log('✅ Created transaction record for manual payment');
      } else {
        // If marking as unpaid, remove admin-manual transactions for this attendee/event
        // so Finance Console reflects active paid state only.
        const manualTxQuery = query(
          collection(db, this.TRANSACTIONS_COLLECTION),
          where('attendeeId', '==', attendeeId)
        );
        const manualTxSnap = await getDocs(manualTxQuery);

        manualTxSnap.docs.forEach((txDoc) => {
          const txData = txDoc.data() as any;
          const sameEvent = String(txData?.eventId || '') === eventId;
          const isManual = Boolean(txData?.metadata?.adminManualUpdate);
          if (sameEvent && isManual) {
            batch.delete(txDoc.ref);
          }
        });

        batch.update(attendeeRef, {
          paymentStatus: newStatus,
          paymentTransactionId: deleteField(),
          updatedAt: Timestamp.now()
        });
      }

      await batch.commit();
      console.log(`✅ Admin updated payment status to ${newStatus}`);
    } catch (error) {
      console.error('❌ Error in admin payment status update:', error);
      throw new Error('Failed to update payment status: ' + (error as Error).message);
    }
  }
}
