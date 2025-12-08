import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { AccountApprovalService } from '../services/accountApprovalService';
import { collection, query, where, orderBy, onSnapshot, Timestamp, doc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Clock, MessageSquare, CheckCircle, LogOut, Home, ArrowLeft } from 'lucide-react';
import type { ApprovalMessage } from '../types';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { Link, useNavigate } from 'react-router-dom';

const PendingApproval: React.FC = () => {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [approval, setApproval] = useState<any>(null);
  const [messages, setMessages] = useState<ApprovalMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastAdminReply, setLastAdminReply] = useState<Date | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const previousStatusRef = useRef<string | null>(null);
  const hasShownStatusChangeRef = useRef(false);
  const unsubscribersRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    if (!currentUser?.id) return;

    // Cleanup previous listeners
    unsubscribersRef.current.forEach(unsub => unsub());
    unsubscribersRef.current = [];
    hasShownStatusChangeRef.current = false;

    // Load approval request and set up real-time listeners
    const loadApproval = async () => {
      try {
        const approvalData = await AccountApprovalService.getApprovalByUserId(currentUser.id);
        
        if (!approvalData) {
          setLoading(false);
          return;
        }

        setApproval(approvalData);
        previousStatusRef.current = approvalData.status;
        
        // Set up real-time listener for approval document status changes
        const approvalRef = doc(db, 'accountApprovals', approvalData.id);
        const unsubscribeApproval = onSnapshot(approvalRef, (snapshot) => {
          if (!snapshot.exists()) {
            console.log('Approval document no longer exists');
            return;
          }

          const data = snapshot.data();
          const newStatus = data?.status || 'pending';
          const oldStatus = previousStatusRef.current;

          // Update approval state
          setApproval({
            id: snapshot.id,
            ...data,
            submittedAt: (data.submittedAt as Timestamp)?.toDate() || new Date(),
            reviewedAt: (data.reviewedAt as Timestamp)?.toDate(),
            lastMessageAt: (data.lastMessageAt as Timestamp)?.toDate(),
          });

          // Handle status changes (only on actual change, not initial load)
          if (oldStatus && oldStatus !== newStatus && !hasShownStatusChangeRef.current) {
            hasShownStatusChangeRef.current = true;
            previousStatusRef.current = newStatus;

            if (newStatus === 'rejected') {
              toast.error('Your account request has been rejected. Redirecting...', {
                duration: 3000,
              });
              setTimeout(() => {
                navigate('/account-rejected', { replace: true });
              }, 1500);
            } else if (newStatus === 'approved') {
              toast.success('🎉 Your account has been approved! Redirecting...', {
                duration: 3000,
              });
              setTimeout(() => {
                navigate('/', { replace: true });
              }, 1500);
            }
          } else if (!oldStatus) {
            // Initial load - set status without showing notification
            previousStatusRef.current = newStatus;
          }
        }, (error) => {
          console.error('Error listening to approval status:', error);
        });

        unsubscribersRef.current.push(unsubscribeApproval);

        // Load messages with real-time updates
        const messagesRef = collection(db, 'approvalMessages');
        const q = query(
          messagesRef,
          where('approvalId', '==', approvalData.id),
          orderBy('createdAt', 'asc')
        );
        
        const unsubscribeMessages = onSnapshot(q, (snapshot) => {
          const msgs = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              ...data,
              createdAt: (data.createdAt as Timestamp)?.toDate() || new Date(),
              readAt: (data.readAt as Timestamp)?.toDate(),
            } as ApprovalMessage;
          });
          setMessages(msgs);

          const lastAdmin = msgs.filter(m => m.senderRole === 'admin').slice(-1)[0];
          setLastAdminReply(lastAdmin ? lastAdmin.createdAt : null);
        });

        unsubscribersRef.current.push(unsubscribeMessages);
        setLoading(false);
      } catch (error) {
        console.error('Error loading approval:', error);
        toast.error('Failed to load approval status');
        setLoading(false);
      }
    };

    loadApproval();

    // Cleanup function
    return () => {
      unsubscribersRef.current.forEach(unsub => unsub());
      unsubscribersRef.current = [];
    };
  }, [currentUser?.id, navigate]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !approval || !currentUser) return;

    setIsSending(true);
    try {
      await AccountApprovalService.sendMessage({
        approvalId: approval.id,
        userId: currentUser.id,
        senderRole: 'user',
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

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      toast.success('Logged out successfully');
      navigate('/');
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('Failed to log out');
    } finally {
      setIsLoggingOut(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-10 h-10 border-4 border-[#F25129] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Please sign in</h2>
          <p className="text-gray-600 mb-6">You need to be signed in to view your approval status.</p>
          <Link
            to="/login"
            className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white font-semibold hover:from-[#E0451F] hover:to-[#E5A900] transition-colors"
          >
            Go to login
          </Link>
        </div>
      </div>
    );
  }

  if (!approval) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <Clock className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">No Approval Request Found</h2>
          <p className="text-gray-600">Please contact support if you believe this is an error.</p>
        </div>
      </div>
    );
  }

  const awaitingUserResponse = approval.awaitingResponseFrom === 'user';
  
  // Check if status has changed (redirect will be handled by Layout, but show message)
  const isRejected = approval.status === 'rejected';
  const isApproved = approval.status === 'approved';
  
  // Check if there are any admin messages
  const hasAdminMessages = messages.some(msg => msg.senderRole === 'admin');
  
  // Only show message composer if there are admin messages OR admin is awaiting response
  const shouldShowMessageComposer = hasAdminMessages || awaitingUserResponse;

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Navigation and Actions Bar */}
        <div className="flex items-center justify-between mb-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 hover:text-[#F25129] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 hover:text-[#F25129] transition-colors disabled:opacity-50"
          >
            <LogOut className="w-4 h-4" />
            {isLoggingOut ? 'Logging out...' : 'Logout'}
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 border border-[#F25129]/20">
          <div className="text-center mb-8">
            <Clock className="w-20 h-20 text-orange-500 mx-auto mb-4" />
            <h1 className="text-3xl font-bold bg-gradient-to-r from-[#F25129] to-[#FFC107] bg-clip-text text-transparent mb-2">
              Account Pending Approval
            </h1>
            <p className="text-gray-600">
              Your registration request is being reviewed by our admin team.
            </p>
          </div>

          {(isRejected || isApproved) ? (
            <div className={`border rounded-lg p-4 mb-6 ${isRejected ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
              <p className={`text-sm font-medium ${isRejected ? 'text-red-800' : 'text-green-800'}`}>
                {isRejected 
                  ? '❌ Your account request has been rejected. Redirecting to details...'
                  : '✅ Your account has been approved! Redirecting...'}
              </p>
              <p className={`text-xs mt-1 ${isRejected ? 'text-red-600' : 'text-green-600'}`}>
                Please wait while we redirect you.
              </p>
            </div>
          ) : (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-blue-800 text-sm">
                <strong>Status:</strong>{' '}
                {approval.status === 'needs_clarification' 
                  ? 'Awaiting your response' 
                  : approval.status === 'pending'
                  ? 'Under review'
                  : approval.status}
              </p>
              <p className="text-blue-600 text-sm mt-1">
                We typically review applications within 24-48 hours. You'll receive a notification once a decision has been made.
              </p>
              <p className="text-blue-500 text-xs mt-1">
                💡 Status updates in real-time - no refresh needed!
              </p>
              {lastAdminReply && (
                <p className="text-blue-500 text-xs mt-1">
                  Last admin reply: {format(lastAdminReply, 'MMM d, yyyy h:mm a')}
                </p>
              )}
            </div>
          )}

          {awaitingUserResponse && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
              <p className="text-orange-800 font-medium">
                An admin has a question about your application. Please respond below.
              </p>
            </div>
          )}

          {/* Q&A Thread */}
          {messages.length > 0 && (
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Messages
              </h2>
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`p-4 rounded-lg ${
                      msg.senderRole === 'admin'
                        ? 'bg-purple-50 border border-purple-200 ml-8'
                        : 'bg-gray-50 border border-gray-200 mr-8'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-semibold text-gray-900">
                          {msg.senderRole === 'admin' ? 'Admin' : 'You'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {format(msg.createdAt, 'MMM d, yyyy h:mm a')}
                        </p>
                      </div>
                    </div>
                    <p className="text-gray-800 whitespace-pre-wrap">{msg.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Message Composer - Only show if there are admin messages or awaiting response, and status is still pending/clarification */}
          {shouldShowMessageComposer && !isRejected && !isApproved && (
            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Reply to Admin</h3>
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type your message here..."
                rows={4}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#F25129] focus:border-transparent transition-all duration-200"
              />
              <button
                onClick={handleSendMessage}
                disabled={!newMessage.trim() || isSending}
                className="mt-3 w-full py-3 px-4 rounded-lg bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white font-medium hover:from-[#E0451F] hover:to-[#E5A900] focus:ring-2 focus:ring-[#F25129] focus:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSending ? 'Sending...' : 'Send Message'}
              </button>
              <p className="text-xs text-gray-500 mt-2">
                Tip: Please reply within 24 hours to keep your request moving. The admin is waiting on your response.
              </p>
            </div>
          )}

          <div className="mt-8 pt-6 border-t text-center">
            <p className="text-sm text-gray-600">
              Questions? Contact us at{' '}
              <a href="mailto:momsfitnessmojo@gmail.com" className="text-[#F25129] hover:underline">
                momsfitnessmojo@gmail.com
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PendingApproval;

