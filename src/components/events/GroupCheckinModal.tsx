import React, { useState, useEffect } from 'react';
import { EventDoc } from '../../hooks/useEvents';
import { useFamilyMembers } from '../../hooks/useFamilyMembers';
import { GroupAttendanceService, GroupCheckinData } from '../../services/groupAttendanceService';
import { X, Users, CheckCircle, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

interface GroupCheckinModalProps {
  event: EventDoc;
  qrCodeData: string;
  onClose: () => void;
  onSuccess?: (groupId: string, memberCount: number) => void;
}

export const GroupCheckinModal: React.FC<GroupCheckinModalProps> = ({
  event,
  qrCodeData,
  onClose,
  onSuccess
}) => {
  const { familyMembers, loading: familyLoading, error: familyError } = useFamilyMembers();
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineCount, setOfflineCount] = useState(0);

  // Initialize with all family members selected
  useEffect(() => {
    if (familyMembers.length > 0) {
      setSelectedMembers(new Set(familyMembers.map(m => m.id)));
    }
  }, [familyMembers]);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncOfflineCheckins();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Check for offline check-ins on mount
  useEffect(() => {
    setOfflineCount(GroupAttendanceService.getOfflineCheckinsCount());
  }, []);

  const toggleMember = (memberId: string) => {
    const newSelected = new Set(selectedMembers);
    if (newSelected.has(memberId)) {
      newSelected.delete(memberId);
    } else {
      newSelected.add(memberId);
    }
    setSelectedMembers(newSelected);
  };

  const handleCheckin = async () => {
    if (selectedMembers.size === 0) {
      toast.error('Please select at least one family member');
      return;
    }

    setIsProcessing(true);

    try {
      const selectedMembersData = familyMembers.filter(m => selectedMembers.has(m.id));
      
      const checkinData: GroupCheckinData = {
        eventId: event.id,
        primaryUserId: 'current-user-id', // In real implementation, get from auth context
        members: selectedMembersData.map(m => ({
          id: m.id,
          name: m.name,
          role: m.role,
          userId: m.userId,
          isCheckedIn: true
        })),
        qrCodeData,
        deviceInfo: navigator.userAgent,
        location: undefined // Could be added with GPS
      };

      if (isOnline) {
        const result = await GroupAttendanceService.recordGroupAttendance(checkinData);
        
        if (result.success) {
          toast.success(result.message);
          onSuccess?.(result.groupId, selectedMembersData.length);
          onClose();
        } else {
          toast.error(result.message);
        }
      } else {
        GroupAttendanceService.saveOfflineGroupCheckin(checkinData);
        toast.success('Check-in saved offline. Will sync when you\'re back online.');
        setOfflineCount(prev => prev + 1);
        onClose();
      }
    } catch (error) {
      console.error('Check-in error:', error);
      toast.error('Failed to check in. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const syncOfflineCheckins = async () => {
    try {
      const result = await GroupAttendanceService.syncOfflineGroupCheckins();
      if (result.synced > 0) {
        toast.success(`Synced ${result.synced} offline check-ins`);
        setOfflineCount(0);
      }
    } catch (error) {
      console.error('Sync error:', error);
      toast.error('Failed to sync offline check-ins');
    }
  };

  if (familyLoading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <div className="flex items-center justify-center">
            <RefreshCw className="w-6 h-6 animate-spin text-[#F25129] mr-2" />
            <span>Loading family members...</span>
          </div>
        </div>
      </div>
    );
  }

  if (familyError) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <div className="text-center">
            <div className="text-red-500 mb-4">❌ Error</div>
            <p className="text-gray-600 mb-4">{familyError}</p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Group Check-in</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Event Info */}
        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <h3 className="font-medium text-gray-900">{event.title}</h3>
          <p className="text-sm text-gray-600">
            {new Date(event.startAt.toMillis()).toLocaleDateString()} at {new Date(event.startAt.toMillis()).toLocaleTimeString()}
          </p>
        </div>

        {/* Online/Offline Status */}
        <div className={`flex items-center gap-2 mb-4 p-2 rounded-md text-sm ${
          isOnline 
            ? 'bg-green-50 text-green-700' 
            : 'bg-yellow-50 text-yellow-700'
        }`}>
          {isOnline ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
          {isOnline ? 'Online' : 'Offline - Will sync when connected'}
        </div>

        {/* Offline Check-ins Count */}
        {offlineCount > 0 && (
          <div className="bg-blue-50 text-blue-700 p-2 rounded-md mb-4 text-sm">
            {offlineCount} offline check-in{offlineCount > 1 ? 's' : ''} pending sync
          </div>
        )}

        {/* Family Members */}
        <div className="mb-6">
          <h3 className="font-medium text-gray-900 mb-3">Who's attending?</h3>
          <div className="space-y-2">
            {familyMembers.map(member => (
              <div
                key={member.id}
                className={`flex items-center p-3 border-2 rounded-lg cursor-pointer transition-all ${
                  selectedMembers.has(member.id)
                    ? 'border-[#F25129] bg-red-50'
                    : 'border-gray-200 bg-gray-50'
                }`}
                onClick={() => toggleMember(member.id)}
              >
                <input
                  type="checkbox"
                  checked={selectedMembers.has(member.id)}
                  onChange={() => toggleMember(member.id)}
                  className="w-5 h-5 text-[#F25129] border-gray-300 rounded focus:ring-[#F25129]"
                />
                <div className="ml-3 flex-1">
                  <div className="font-medium text-gray-900">{member.name}</div>
                  <div className="text-sm text-gray-500">{member.role}</div>
                </div>
                {selectedMembers.has(member.id) && (
                  <CheckCircle className="w-5 h-5 text-[#F25129]" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
            disabled={isProcessing}
          >
            Cancel
          </button>
          <button
            onClick={handleCheckin}
            disabled={selectedMembers.size === 0 || isProcessing}
            className="flex-1 px-4 py-2 bg-[#F25129] text-white rounded-md hover:bg-[#E0451F] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                Processing...
              </>
            ) : (
              <>
                <Users className="w-4 h-4 mr-2" />
                Check In {selectedMembers.size} Member{selectedMembers.size > 1 ? 's' : ''}
              </>
            )}
          </button>
        </div>

        {/* Sync Button for Offline Check-ins */}
        {!isOnline && offlineCount > 0 && (
          <button
            onClick={syncOfflineCheckins}
            className="w-full mt-3 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 flex items-center justify-center"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Sync Now
          </button>
        )}
      </div>
    </div>
  );
};
