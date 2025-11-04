import React, { useState } from 'react';
import { triggerAutomaticPromotions } from '../../services/attendeeService';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { toast } from 'react-hot-toast';

interface AutoPromotionManagerProps {
  eventId: string;
  eventTitle: string;
  isAdmin: boolean;
}

export const AutoPromotionManager: React.FC<AutoPromotionManagerProps> = ({
  eventId,
  eventTitle,
  isAdmin
}) => {
  const [isPromoting, setIsPromoting] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [lastPromotionResult, setLastPromotionResult] = useState<string | null>(null);

  // Manual trigger auto-promotion
  const handleManualPromotion = async () => {
    if (!isAdmin) {
      toast.error('Admin access required');
      return;
    }

    setIsPromoting(true);
    try {
      const result = await triggerAutomaticPromotions(eventId);
      
      if (result.success) {
        if (result.promotionsCount > 0) {
          const message = `✅ Successfully promoted ${result.promotionsCount} users: ${result.promotedUsers.map(u => u.message).join(', ')}`;
          toast.success(message);
          setLastPromotionResult(message);
        } else {
          const message = `ℹ️ No promotions needed: ${result.errors.join(', ')}`;
          toast.info(message);
          setLastPromotionResult(message);
        }
      } else {
        const errorMessage = `❌ Promotion failed: ${result.errors.join(', ')}`;
        toast.error(errorMessage);

      }
    } catch (error) {
      const errorMessage = `Failed to promote: ${error instanceof Error ? error.message : 'Unknown error'}`;
      toast.error(errorMessage);
      setLastPromotionResult(errorMessage);
    } finally {
      setIsPromoting(false);
    }
  };

  // Server-side recalculation callable
  const handleServerRecalc = async () => {
    if (!isAdmin) {
      toast.error('Admin access required');
      return;
    }
    setIsRecalculating(true);
    try {
      // Explicitly use us-east1 to match function deployment region
      const functions = getFunctions(undefined, 'us-east1');
      const recalc = httpsCallable(functions, 'recalcWaitlistPositions');
      await recalc({ eventId });
      const message = '✅ Waitlist positions recalculated on server';
      toast.success(message);
      setLastPromotionResult(message);
    } catch (error) {
      const errorMessage = `Failed to recalculate: ${error instanceof Error ? error.message : 'Unknown error'}`;
      toast.error(errorMessage);
      setLastPromotionResult(errorMessage);
    } finally {
      setIsRecalculating(false);
    }
  };

  // Manual recalculation tool
  const handleManualRecalculation = async () => {
    if (!isAdmin) {
      toast.error('Admin access required');
      return;
    }

    setIsRecalculating(true);
    try {
      await manualRecalculateWaitlistPositions(eventId);
      const message = '✅ Waitlist positions recalculated successfully';
      toast.success(message);
      setLastPromotionResult(message);
    } catch (error) {
      const errorMessage = `Failed to recalculate: ${error instanceof Error ? error.message : 'Unknown error'}`;
      toast.error(errorMessage);
      setLastPromotionResult(errorMessage);
    } finally {
      setIsRecalculating(false);
    }
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mt-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-3">
        🤖 Auto-Promotion Manager
      </h3>
      
      <div className="space-y-3">
        <div className="flex gap-2">
          <button
            onClick={handleManualPromotion}
            disabled={isPromoting}
            className={`
              px-4 py-2 rounded-md text-sm font-medium
              ${isPromoting 
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                : 'bg-green-600 text-white hover:bg-green-700'
              }
              transition-colors
            `}
          >
            {isPromoting ? '🔄 Promoting...' : '🚀 Trigger Auto-Promotion'}
          </button>
          
          <button
            onClick={handleServerRecalc}
            disabled={isRecalculating}
            className={`
              px-4 py-2 rounded-md text-sm font-medium
              ${isRecalculating 
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                : 'bg-blue-600 text-white hover:bg-blue-700'
              }
              transition-colors
            `}
          >
            {isRecalculating ? 'Recalculating...' : 'Recalculate Positions (Server)'}
          </button>
        </div>
        
        {lastPromotionResult && (
          <div className="mt-3 p-3 bg-gray-50 rounded-md">
            <h4 className="text-sm font-medium text-gray-700 mb-1">Last Action Result:</h4>
            <p className="text-sm text-gray-600">{lastPromotionResult}</p>
          </div>
        )}
        
        <div className="mt-3 text-xs text-gray-500 space-y-1">
          <p>• <strong>Auto-Promotion:</strong> Promotes waitlist users when spots become available</p>
          <p>• <strong>Recalculate:</strong> Fixes position numbers if they get out of sync</p>
          <p>• Both actions include family member promotion and position gap filling</p>
        </div>
      </div>
    </div>
  );
};

