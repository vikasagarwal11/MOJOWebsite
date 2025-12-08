import React from 'react';
import { Link } from 'react-router-dom';
import { Clock, XCircle, AlertCircle } from 'lucide-react';
import { User } from '../../types';
import { isUserPending } from '../../utils/userUtils';

interface StatusBannerProps {
  currentUser: User | null;
}

export const StatusBanner: React.FC<StatusBannerProps> = ({ currentUser }) => {
  if (!currentUser || !isUserPending(currentUser)) {
    return null;
  }

  const status = currentUser.status || 'pending';
  const isRejected = status === 'rejected';
  const isNeedsClarification = status === 'needs_clarification';

  if (isRejected) {
    return (
      <div className="bg-red-50 border-b border-red-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-800">
                Your account request was rejected
              </p>
              <p className="text-xs text-red-600">
                You can browse public content, but cannot interact or create content. 
                <Link to="/account-rejected" className="underline ml-1 font-medium">
                  View details
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-orange-50 border-b border-orange-200 px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isNeedsClarification ? (
            <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0" />
          ) : (
            <Clock className="w-5 h-5 text-orange-600 flex-shrink-0" />
          )}
          <div>
            <p className="text-sm font-medium text-orange-800">
              {isNeedsClarification 
                ? 'Response needed from you' 
                : 'Your account is pending approval'}
            </p>
            <p className="text-xs text-orange-600">
              You can browse public events and posts while you wait. 
              <Link to="/pending-approval" className="underline ml-1 font-medium">
                {isNeedsClarification ? 'Respond to admin' : 'Check status'}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

