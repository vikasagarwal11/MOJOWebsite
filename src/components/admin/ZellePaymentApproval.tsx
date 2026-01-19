/**
 * Zelle Payment Approval Component
 * 
 * Admin interface to view, approve, and reject Zelle payments that are
 * waiting for approval. Shows all attendees with status 'waiting_for_approval'
 * across all events.
 */

import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { CheckCircle, Clock, Mail, XCircle } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { db } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Attendee } from '../../types/attendee';
import { LoadingSpinner } from '../ui/LoadingSpinner';

interface PendingPayment {
  attendee: Attendee;
  eventId: string;
  eventTitle: string;
  amount: number;
}

export const ZellePaymentApproval: React.FC = () => {
  const { isAdmin } = useAuth();
  const [pendingPayments, setPendingPayments] = useState<PendingPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadPendingPayments = async () => {
    setLoading(true);
    try {
      // Get all events
      const eventsSnapshot = await getDocs(collection(db, 'events'));
      const allPendingPayments: PendingPayment[] = [];

      // For each event, check for attendees with waiting_for_approval status
      for (const eventDoc of eventsSnapshot.docs) {
        const eventData = eventDoc.data();
        const eventId = eventDoc.id;
        const eventTitle = eventData.title;
        const eventPricing = eventData.pricing;

        // Skip if not a Zelle payment event
        if (eventPricing?.paymentMethod !== 'zelle') continue;

        // Get attendees with waiting_for_approval status
        const attendeesQuery = query(
          collection(db, 'events', eventId, 'attendees'),
          where('paymentStatus', '==', 'waiting_for_approval')
        );
        const attendeesSnapshot = await getDocs(attendeesQuery);

        attendeesSnapshot.forEach((attendeeDoc) => {
          const attendee = { ...attendeeDoc.data(), attendeeId: attendeeDoc.id } as Attendee;
          
          // Calculate amount for this attendee
          const ageGroupPricing = eventPricing.ageGroupPricing?.find(
            (p: any) => p.ageGroup === attendee.ageGroup
          );
          const ticketPrice = ageGroupPricing?.price || eventPricing.adultPrice || 0;
          const supportPrice = eventPricing.eventSupportAmount || 0;
          const totalAmount = ticketPrice + supportPrice;

          allPendingPayments.push({
            attendee,
            eventId,
            eventTitle,
            amount: totalAmount,
          });
        });
      }

      setPendingPayments(allPendingPayments);
    } catch (error) {
      console.error('Error loading pending payments:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      loadPendingPayments();
    }
  }, [isAdmin]);

  const handleApprove = async (eventId: string, attendeeId: string) => {
    setProcessingId(attendeeId);
    try {
      const attendeeRef = doc(db, 'events', eventId, 'attendees', attendeeId);
      await updateDoc(attendeeRef, {
        paymentStatus: 'paid',
        updatedAt: new Date(),
      });

      // Remove from pending list
      setPendingPayments((prev) => prev.filter((p) => p.attendee.attendeeId !== attendeeId));
    } catch (error) {
      console.error('Error approving payment:', error);
      alert('Failed to approve payment. Please try again.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (eventId: string, attendeeId: string) => {
    const reason = prompt('Reason for rejection (optional):');
    
    setProcessingId(attendeeId);
    try {
      const attendeeRef = doc(db, 'events', eventId, 'attendees', attendeeId);
      await updateDoc(attendeeRef, {
        paymentStatus: 'rejected',
        rejectionReason: reason || 'No reason provided',
        updatedAt: new Date(),
      });

      // Remove from pending list
      setPendingPayments((prev) => prev.filter((p) => p.attendee.attendeeId !== attendeeId));
    } catch (error) {
      console.error('Error rejecting payment:', error);
      alert('Failed to reject payment. Please try again.');
    } finally {
      setProcessingId(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-800 font-medium">Access Denied</p>
        <p className="text-red-600 text-sm">You must be an admin to view this page.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Zelle Payment Approvals</h2>
          <p className="text-sm text-gray-600 mt-1">
            Review and approve Zelle payments waiting for verification
          </p>
        </div>
        <button
          onClick={loadPendingPayments}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Pending Count */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-amber-600" />
          <p className="text-sm font-medium text-amber-900">
            {pendingPayments.length} payment{pendingPayments.length !== 1 ? 's' : ''} waiting for approval
          </p>
        </div>
      </div>

      {/* Pending Payments List */}
      {pendingPayments.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">All Caught Up!</h3>
          <p className="text-gray-600">No Zelle payments are waiting for approval.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pendingPayments.map((payment) => (
            <div
              key={`${payment.eventId}-${payment.attendee.attendeeId}`}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-4">
                {/* Payment Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900 truncate">
                      {payment.attendee.name}
                    </h3>
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-xs font-medium rounded">
                      Pending
                    </span>
                  </div>
                  
                  <div className="space-y-1 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Event:</span>
                      <span>{payment.eventTitle}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Age Group:</span>
                      <span className="capitalize">
                        {payment.attendee.ageGroup === 'adult' ? 'Adult' :
                         payment.attendee.ageGroup === '11+' ? '11+ Years' :
                         payment.attendee.ageGroup === '0-2' ? '0-2 Years' :
                         payment.attendee.ageGroup === '3-5' ? '3-5 Years' :
                         payment.attendee.ageGroup === '6-10' ? '6-10 Years' :
                         payment.attendee.ageGroup}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Amount:</span>
                      <span className="text-lg font-bold text-purple-600">
                        ${(payment.amount / 100).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Email Reminder */}
                  <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded flex items-start gap-2">
                    <Mail className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-900">
                      User should have sent payment screenshot to{' '}
                      <span className="font-semibold">momsfitnessmojo@gmail.com</span>
                    </p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleApprove(payment.eventId, payment.attendee.attendeeId)}
                    disabled={processingId === payment.attendee.attendeeId}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Approve
                  </button>
                  
                  <button
                    onClick={() => handleReject(payment.eventId, payment.attendee.attendeeId)}
                    disabled={processingId === payment.attendee.attendeeId}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <XCircle className="w-4 h-4" />
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
