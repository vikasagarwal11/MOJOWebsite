import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, getDocs, onSnapshot, Timestamp, limit as limitQuery, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { AccountApprovalService } from '../../services/accountApprovalService';
import { useAuth } from '../../contexts/AuthContext';
import { CheckCircle, XCircle, MessageSquare, Search, Filter, Clock, User, Mail, MapPin, X } from 'lucide-react';
import toast from 'react-hot-toast';
import type { AccountApproval, ApprovalMessage } from '../../types';
import { format } from 'date-fns';
import GrandfatherUsersButton from './GrandfatherUsersButton';

type StatusFilter = 'all' | 'pending' | 'needs_clarification' | 'approved' | 'rejected';

const AccountApprovalsAdmin: React.FC = () => {
  const { currentUser } = useAuth();
  const [approvals, setApprovals] = useState<AccountApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedApproval, setSelectedApproval] = useState<AccountApproval | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [questionMessage, setQuestionMessage] = useState('');
  const [threadMessages, setThreadMessages] = useState<ApprovalMessage[]>([]);

  useEffect(() => {
    if (!currentUser || currentUser.role !== 'admin') return;

    let q;
    const approvalsRef = collection(db, 'accountApprovals');

    if (statusFilter === 'all') {
      q = query(approvalsRef, orderBy('submittedAt', 'desc'));
    } else {
      q = query(
        approvalsRef,
        where('status', '==', statusFilter),
        orderBy('submittedAt', 'desc')
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const docData = doc.data();
        return {
          id: doc.id,
          ...docData,
          submittedAt: (docData.submittedAt as Timestamp)?.toDate() || new Date(),
          reviewedAt: (docData.reviewedAt as Timestamp)?.toDate(),
          lastMessageAt: (docData.lastMessageAt as Timestamp)?.toDate(),
        } as AccountApproval;
      });
      setApprovals(data);
      setLoading(false);
    }, (error) => {
      console.error('Error loading approvals:', error);
      toast.error('Failed to load approval requests');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [statusFilter, currentUser]);

  const filteredApprovals = approvals.filter(approval => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      approval.firstName.toLowerCase().includes(query) ||
      approval.lastName.toLowerCase().includes(query) ||
      approval.email.toLowerCase().includes(query) ||
      approval.phoneNumber.includes(query) ||
      (approval.location?.toLowerCase().includes(query))
    );
  });

  const handleApprove = async (approvalId: string) => {
    if (!currentUser?.id) return;
    
    try {
      await AccountApprovalService.approveAccount(approvalId, currentUser.id);
      toast.success('Account approved successfully!');
      setSelectedApproval(null);
    } catch (error: any) {
      console.error('Error approving account:', error);
      toast.error(error?.message || 'Failed to approve account');
    }
  };

  const handleReject = async () => {
    if (!currentUser?.id || !selectedApproval || !rejectionReason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }

    try {
      await AccountApprovalService.rejectAccount(selectedApproval.id, currentUser.id, rejectionReason.trim());
      toast.success('Account rejected');
      setShowRejectModal(false);
      setRejectionReason('');
      setSelectedApproval(null);
    } catch (error: any) {
      console.error('Error rejecting account:', error);
      toast.error(error?.message || 'Failed to reject account');
    }
  };

  const handleAskQuestion = async () => {
    if (!currentUser?.id || !selectedApproval || !questionMessage.trim()) {
      toast.error('Please enter a question');
      return;
    }

    try {
      await AccountApprovalService.sendMessage({
        approvalId: selectedApproval.id,
        userId: currentUser.id,
        senderRole: 'admin',
        senderName: currentUser.displayName,
        message: questionMessage.trim(),
      });
      toast.success('Question sent!');
      setShowQuestionModal(false);
      setQuestionMessage('');
    } catch (error: any) {
      console.error('Error sending question:', error);
      toast.error(error?.message || 'Failed to send question');
    }
  };

  const loadThread = (approvalId: string) => {
    const qMessages = query(
      collection(db, 'approvalMessages'),
      where('approvalId', '==', approvalId),
      orderBy('createdAt', 'asc'),
      limitQuery(100)
    );
    return onSnapshot(qMessages, (snap) => {
      const msgs = snap.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          createdAt: (data.createdAt as Timestamp)?.toDate() || new Date(),
          readAt: (data.readAt as Timestamp)?.toDate(),
        } as ApprovalMessage;
      });
      setThreadMessages(msgs);
    });
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800',
      needs_clarification: 'bg-orange-100 text-orange-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
    };
    
    const labels = {
      pending: 'Pending',
      needs_clarification: 'Needs Clarification',
      approved: 'Approved',
      rejected: 'Rejected',
    };

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status as keyof typeof styles] || 'bg-gray-100 text-gray-800'}`}>
        {labels[status as keyof typeof labels] || status}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin w-8 h-8 border-4 border-[#F25129] border-t-transparent rounded-full" />
      </div>
    );
  }

  const pendingCount = approvals.filter(a => a.status === 'pending' || a.status === 'needs_clarification').length;
  const pendingAwaitingAdmin = approvals.filter(a => a.awaitingResponseFrom === 'admin').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Account Approvals</h2>
          <p className="text-gray-600 mt-1">
            Review and approve new member registration requests
            {pendingCount > 0 && (
              <span className="ml-2 px-2 py-1 bg-orange-100 text-orange-800 rounded-full text-sm font-medium">
                {pendingCount} pending
              </span>
            )}
            {pendingAwaitingAdmin > 0 && (
              <span className="ml-2 px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-sm font-medium">
                {pendingAwaitingAdmin} awaiting reply
              </span>
            )}
          </p>
        </div>
        <GrandfatherUsersButton />
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, email, phone, location..."
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Filter className="w-5 h-5 text-gray-400 mt-2" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="needs_clarification">Needs Clarification</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {/* Approvals List */}
      <div className="space-y-4">
        {filteredApprovals.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No approval requests found</p>
          </div>
        ) : (
          filteredApprovals.map((approval) => (
            <div
              key={approval.id}
              className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {approval.firstName} {approval.lastName}
                    </h3>
                    {getStatusBadge(approval.status)}
                    {approval.awaitingResponseFrom === 'admin' && (
                      <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-medium">
                        Waiting on admin
                      </span>
                    )}
                    {approval.awaitingResponseFrom === 'user' && (
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                        Waiting on user
                      </span>
                    )}
                    {approval.unreadCount && approval.unreadCount.admin > 0 && (
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                        {approval.unreadCount.admin} new message{approval.unreadCount.admin !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4" />
                      {approval.email}
                    </div>
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4" />
                      {approval.phoneNumber}
                    </div>
                    {approval.location && (
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        {approval.location}
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right text-sm text-gray-500">
                  <p>Submitted</p>
                  <p>{format(approval.submittedAt, 'MMM d, yyyy')}</p>
                </div>
              </div>

              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-700">
                  <strong>How did you hear about us:</strong> {
                    approval.howDidYouHear === 'other' 
                      ? approval.howDidYouHearOther 
                      : approval.howDidYouHear?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
                  }
                </p>
                {approval.referredBy && (
                  <p className="text-sm text-gray-700 mt-1">
                    <strong>Referred by:</strong> {approval.referredBy}
                  </p>
                )}
                {approval.referralNotes && (
                  <p className="text-sm text-gray-700 mt-1">
                    <strong>Notes:</strong> {approval.referralNotes}
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedApproval(approval)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                >
                  View Details
                </button>
                {approval.status === 'pending' || approval.status === 'needs_clarification' ? (
                  <>
                    <button
                      onClick={() => handleApprove(approval.id)}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium flex items-center gap-2"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Approve
                    </button>
                    <button
                      onClick={() => {
                        setSelectedApproval(approval);
                        setShowRejectModal(true);
                      }}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium flex items-center gap-2"
                    >
                      <XCircle className="w-4 h-4" />
                      Reject
                    </button>
                    <button
                      onClick={() => {
                        setSelectedApproval(approval);
                        setShowQuestionModal(true);
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center gap-2"
                    >
                      <MessageSquare className="w-4 h-4" />
                      Ask Question
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Reject Modal */}
      {showRejectModal && selectedApproval && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Reject Account Request</h3>
            <p className="text-sm text-gray-600 mb-4">
              Please provide a reason for rejecting this account request. The user will see this reason.
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Enter rejection reason..."
              rows={4}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-red-500 focus:border-transparent mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectionReason('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectionReason.trim()}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Reject Account
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ask Question Modal */}
      {showQuestionModal && selectedApproval && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Ask a Question</h3>
            <p className="text-sm text-gray-600 mb-4">
              Ask the user a clarifying question about their application.
            </p>
            <textarea
              value={questionMessage}
              onChange={(e) => setQuestionMessage(e.target.value)}
              placeholder="Type your question here..."
              rows={4}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowQuestionModal(false);
                  setQuestionMessage('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAskQuestion}
                disabled={!questionMessage.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Send Question
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal - Will show full details and Q&A thread */}
      {selectedApproval && !showRejectModal && !showQuestionModal && (
        <ApprovalDetailModal
          approval={selectedApproval}
          onClose={() => setSelectedApproval(null)}
          onApprove={() => handleApprove(selectedApproval.id)}
          onReject={() => {
            setShowRejectModal(true);
          }}
          onAskQuestion={() => {
            setShowQuestionModal(true);
          }}
        />
      )}
    </div>
  );
};

// Detail Modal Component
interface ApprovalDetailModalProps {
  approval: AccountApproval;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  onAskQuestion: () => void;
}

const ApprovalDetailModal: React.FC<ApprovalDetailModalProps> = ({
  approval,
  onClose,
  onApprove,
  onReject,
  onAskQuestion,
}) => {
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const { currentUser } = useAuth();
  const quickReplies = [
    'Can you share a bit more about your role?',
    'Please confirm your location.',
    'Who referred you? Any notes to share?',
    'Have you attended our events before?'
  ];

  useEffect(() => {
    if (!approval.id) return;

    const messagesRef = collection(db, 'approvalMessages');
    const q = query(
      messagesRef,
      where('approvalId', '==', approval.id),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: (data.createdAt as Timestamp)?.toDate() || new Date(),
          readAt: (data.readAt as Timestamp)?.toDate(),
        };
      });
      setMessages(msgs);
    });

    return () => unsubscribe();
  }, [approval.id]);

  // Mark admin unread as read when opening thread
  useEffect(() => {
    const markRead = async () => {
      try {
        await updateDoc(doc(db, 'accountApprovals', approval.id), {
          'unreadCount.admin': 0,
          awaitingResponseFrom: 'user'
        });
      } catch (e) {
        console.error('Failed to mark admin unread', e);
      }
    };
    markRead();
  }, [approval.id]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !currentUser) return;

    setIsSending(true);
    try {
      await AccountApprovalService.sendMessage({
        approvalId: approval.id,
        userId: currentUser.id,
        senderRole: 'admin',
        senderName: currentUser.displayName,
        message: newMessage.trim(),
      });
      setNewMessage('');
      toast.success('Message sent!');
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">
            {approval.firstName} {approval.lastName}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="space-y-6">
          {/* User Details */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="text-sm text-gray-600">Email</p>
              <p className="font-medium">{approval.email}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Phone</p>
              <p className="font-medium">{approval.phoneNumber}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Location</p>
              <p className="font-medium">{approval.location || 'Not provided'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Referral</p>
              <p className="font-medium">{approval.referredBy || 'None'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Submitted</p>
              <p className="font-medium">
                {approval.submittedAt ? format(approval.submittedAt as any, 'MMM d, yyyy h:mm a') : '—'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Status</p>
              <p className="font-medium capitalize">{approval.status}</p>
              {approval.reviewedAt && (
                <p className="text-xs text-gray-500 mt-1">
                  Reviewed: {format(approval.reviewedAt as any, 'MMM d, yyyy h:mm a')}
                </p>
              )}
              {approval.rejectionReason && (
                <p className="text-xs text-red-600 mt-1">Rejection reason: {approval.rejectionReason}</p>
              )}
            </div>
          </div>

          {/* Q&A Thread */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Conversation
            </h3>
            <div className="space-y-4 max-h-96 overflow-y-auto mb-4">
              {messages.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No messages yet</p>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`p-4 rounded-lg ${
                      msg.senderRole === 'admin'
                        ? 'bg-purple-50 border border-purple-200'
                        : 'bg-gray-50 border border-gray-200'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <p className="font-semibold text-gray-900">
                        {msg.senderRole === 'admin' ? 'Admin' : 'User'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {format(msg.createdAt, 'MMM d, h:mm a')}
                      </p>
                    </div>
                    <p className="text-gray-800 whitespace-pre-wrap">{msg.message}</p>
                  </div>
                ))
              )}
            </div>

            {/* Message Composer */}
            <div className="border-t pt-4">
              <div className="flex flex-wrap gap-2 mb-2">
                {['Can you share more about your role?', 'Please confirm your location.', 'Who referred you?', 'Have you attended our events before?'].map((qr) => (
                  <button
                    key={qr}
                    onClick={() => setNewMessage(qr)}
                    className="px-3 py-1 text-xs rounded-full border border-gray-200 hover:border-[#F25129] hover:text-[#F25129] transition-colors"
                  >
                    {qr}
                  </button>
                ))}
              </div>
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type your message here..."
                rows={3}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:border-transparent mb-2"
              />
              <button
                onClick={handleSendMessage}
                disabled={!newMessage.trim() || isSending}
                className="w-full px-4 py-2 bg-[#F25129] text-white rounded-lg hover:bg-[#E0451F] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSending ? 'Sending...' : 'Send Message'}
              </button>
            </div>
          </div>

          {/* Actions */}
          {(approval.status === 'pending' || approval.status === 'needs_clarification') && (
            <div className="flex gap-3 pt-4 border-t">
              <button
                onClick={onApprove}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
              >
                Approve
              </button>
              <button
                onClick={onReject}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
              >
                Reject
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AccountApprovalsAdmin;

