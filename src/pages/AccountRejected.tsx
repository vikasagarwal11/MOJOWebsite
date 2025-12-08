import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { AccountApprovalService } from '../services/accountApprovalService';
import { XCircle, Calendar, Mail } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';

const AccountRejected: React.FC = () => {
  const { currentUser } = useAuth();
  const [approval, setApproval] = useState<any>(null);
  const [canReapply, setCanReapply] = useState<{ canReapply: boolean; reapplyDate?: Date } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser?.id) return;

    const loadData = async () => {
      try {
        const approvalData = await AccountApprovalService.getApprovalByUserId(currentUser.id);
        setApproval(approvalData);

        const reapplyInfo = await AccountApprovalService.canReapply(currentUser.id);
        setCanReapply(reapplyInfo);
      } catch (error) {
        console.error('Error loading rejection info:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [currentUser?.id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-10 h-10 border-4 border-[#F25129] border-t-transparent rounded-full" />
      </div>
    );
  }

  const rejectionReason = approval?.rejectionReason || currentUser?.rejectionReason || 'No reason provided.';

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-red-200">
          <div className="text-center mb-8">
            <XCircle className="w-20 h-20 text-red-500 mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Account Request Not Approved
            </h1>
            <p className="text-gray-600">
              We're sorry, but your account request was not approved at this time.
            </p>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
            <h2 className="text-lg font-semibold text-red-900 mb-2">Reason for Rejection</h2>
            <p className="text-red-800 whitespace-pre-wrap">{rejectionReason}</p>
            {approval?.reviewedAt && (
              <p className="text-sm text-red-600 mt-3 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Reviewed on {format((approval.reviewedAt as Date), 'MMM d, yyyy')}
              </p>
            )}
          </div>

          {canReapply && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
              {canReapply.canReapply ? (
                <>
                  <h3 className="text-lg font-semibold text-blue-900 mb-2">
                    You Can Reapply Now
                  </h3>
                  <p className="text-blue-800 mb-4">
                    Your cooldown period has ended. You can submit a new registration request.
                  </p>
                  <Link
                    to="/register"
                    className="inline-block py-2 px-6 rounded-lg bg-[#F25129] text-white font-medium hover:bg-[#E0451F] transition-colors"
                  >
                    Submit New Registration
                  </Link>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-semibold text-blue-900 mb-2">
                    Reapplication Available Soon
                  </h3>
                  <p className="text-blue-800 mb-2">
                    You can reapply after the 30-day cooldown period.
                  </p>
                  {canReapply.reapplyDate && (
                    <p className="text-blue-600 flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      You can reapply on {format(canReapply.reapplyDate, 'MMM d, yyyy')}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          <div className="border-t pt-6 text-center">
            <p className="text-sm text-gray-600 mb-4">
              Have questions about this decision? Contact us at{' '}
              <a href="mailto:momsfitnessmojo@gmail.com" className="text-[#F25129] hover:underline">
                momsfitnessmojo@gmail.com
              </a>
            </p>
            <Link
              to="/"
              className="inline-block text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountRejected;

