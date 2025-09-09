import React, { useState } from 'react';
import { QRCodeGenerator } from './QRCodeGenerator';
import { QRCodeScanner } from './QRCodeScanner';
import { AttendanceAnalytics } from './AttendanceAnalytics';
import { EventDoc } from '../../hooks/useEvents';
import { useAuth } from '../../contexts/AuthContext';
import { QrCode, Camera, BarChart3, Users } from 'lucide-react';

interface QRCodeTabProps {
  event: EventDoc;
  onEventUpdate?: () => void;
  className?: string;
}

export const QRCodeTab: React.FC<QRCodeTabProps> = ({
  event,
  onEventUpdate,
  className = ''
}) => {
  const { currentUser } = useAuth();
  const [activeView, setActiveView] = useState<'generator' | 'scanner' | 'analytics'>('generator');
  const [showScanner, setShowScanner] = useState(false);

  const isAdmin = currentUser?.role === 'admin' || currentUser?.id === event.createdBy;

  const handleAttendanceRecorded = (success: boolean, message: string) => {
    if (success) {
      // Switch to analytics view to show updated data
      setActiveView('analytics');
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Tab Navigation */}
      <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
        {isAdmin && (
          <button
            onClick={() => setActiveView('generator')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeView === 'generator'
                ? 'bg-white text-[#F25129] shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <QrCode className="w-4 h-4" />
            Generate QR
          </button>
        )}
        
        <button
          onClick={() => setShowScanner(true)}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            showScanner
              ? 'bg-white text-[#F25129] shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Camera className="w-4 h-4" />
          Scan QR
        </button>

        {isAdmin && (
          <button
            onClick={() => setActiveView('analytics')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeView === 'analytics'
                ? 'bg-white text-[#F25129] shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Analytics
          </button>
        )}
      </div>

      {/* Content */}
      {activeView === 'generator' && isAdmin && (
        <QRCodeGenerator 
          event={event}
          onQRGenerated={(qrCode) => {
            console.log('QR Code generated:', qrCode);
          }}
          onAttendanceToggled={(enabled) => {
            console.log('QR Attendance toggled:', enabled);
            onEventUpdate?.();
          }}
        />
      )}

      {activeView === 'analytics' && isAdmin && (
        <AttendanceAnalytics event={event} />
      )}

      {/* QR Scanner Modal */}
      {showScanner && (
        <QRCodeScanner
          event={event}
          onClose={() => setShowScanner(false)}
          onAttendanceRecorded={handleAttendanceRecorded}
        />
      )}

      {/* Instructions for non-admin users */}
      {!isAdmin && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <div className="flex items-start gap-3">
            <Users className="w-6 h-6 text-blue-600 mt-1" />
            <div>
              <h3 className="font-semibold text-blue-900 mb-2">QR Code Check-in</h3>
              <p className="text-blue-800 text-sm mb-4">
                Use the "Scan QR" button above to check in to this event. Simply point your camera at the event QR code and your attendance will be automatically recorded.
              </p>
              <div className="text-xs text-blue-700 space-y-1">
                <p>• Make sure you're logged in to your account</p>
                <p>• Allow camera access when prompted</p>
                <p>• Hold your phone steady over the QR code</p>
                <p>• You'll receive a confirmation when checked in</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
