import React, { useState, useEffect, useRef } from 'react';
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library';
import { QRCodeService } from '../../services/qrCodeService';
import { AttendanceService } from '../../services/attendanceService';
import { GroupCheckinModal } from './GroupCheckinModal';
import { EventDoc } from '../../hooks/useEvents';
import { useAuth } from '../../contexts/AuthContext';
import { QrCode, Camera, CheckCircle, X, AlertCircle, Loader2, Users } from 'lucide-react';
import toast from 'react-hot-toast';

interface QRCodeScannerProps {
  event: EventDoc;
  onClose: () => void;
  onAttendanceRecorded?: (success: boolean, message: string) => void;
}

export const QRCodeScanner: React.FC<QRCodeScannerProps> = ({
  event,
  onClose,
  onAttendanceRecorded
}) => {
  const { currentUser } = useAuth();
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraPermission, setCameraPermission] = useState<boolean | null>(null);
  const [showGroupCheckin, setShowGroupCheckin] = useState(false);
  const [scannedQRData, setScannedQRData] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const codeReader = useRef<BrowserMultiFormatReader | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    initializeScanner();
    return () => {
      stopScanning();
    };
  }, []);

  const initializeScanner = async () => {
    try {
      // Check camera permission
      const permission = await navigator.permissions.query({ name: 'camera' as PermissionName });
      setCameraPermission(permission.state === 'granted');
      
      if (permission.state === 'granted') {
        startScanning();
      } else {
        setError('Camera permission is required to scan QR codes');
      }
    } catch (error) {
      console.error('Error checking camera permission:', error);
      // Try to start scanning anyway
      startScanning();
    }
  };

  const startScanning = async () => {
    if (!videoRef.current) return;

    try {
      setIsScanning(true);
      setError(null);

      // Initialize ZXing reader
      codeReader.current = new BrowserMultiFormatReader();
      
      // Get available video input devices
      const videoInputDevices = await codeReader.current.listVideoInputDevices();
      
      if (videoInputDevices.length === 0) {
        throw new Error('No camera devices found');
      }

      // Use the first available camera (usually the back camera on mobile)
      const selectedDeviceId = videoInputDevices[0].deviceId;

      // Start decoding from video stream
      await codeReader.current.decodeFromVideoDevice(
        selectedDeviceId,
        videoRef.current,
        (result, error) => {
          if (result) {
            handleQRCodeDetected(result.getText());
          }
          
          if (error && !(error instanceof NotFoundException)) {
            console.error('QR Code scanning error:', error);
          }
        }
      );

      setCameraPermission(true);
    } catch (error) {
      console.error('Error starting QR scanner:', error);
      setError('Failed to start camera. Please check permissions and try again.');
      setIsScanning(false);
    }
  };

  const stopScanning = () => {
    if (codeReader.current) {
      codeReader.current.reset();
      codeReader.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    setIsScanning(false);
  };

  const handleQRCodeDetected = async (qrText: string) => {
    if (isProcessing) return; // Prevent multiple simultaneous processing
    
    setIsProcessing(true);
    stopScanning(); // Stop scanning while processing

    try {
      // Parse QR code data
      const qrData = QRCodeService.parseQRData(qrText);
      
      if (!qrData) {
        throw new Error('Invalid QR code format');
      }

      // Validate QR code
      if (!QRCodeService.validateQRData(qrData, event.id)) {
        throw new Error('Invalid QR code for this event');
      }

      // Check if QR code is valid for current time
      if (!QRCodeService.isQRCodeValid(qrData, event.startAt)) {
        throw new Error('QR code is not valid at this time');
      }

      // Show group check-in modal instead of directly recording attendance
      setScannedQRData(qrText);
      setShowGroupCheckin(true);
    } catch (error) {
      console.error('Error processing QR code:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to process QR code';
      toast.error(errorMessage);
      onAttendanceRecorded?.(false, errorMessage);
      
      // Resume scanning after error
      setTimeout(() => {
        startScanning();
      }, 2000);
    } finally {
      setIsProcessing(false);
    }
  };

  const requestCameraPermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(track => track.stop()); // Stop immediately after getting permission
      setCameraPermission(true);
      startScanning();
    } catch (error) {
      console.error('Error requesting camera permission:', error);
      setError('Camera permission denied. Please enable camera access and try again.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <QrCode className="w-6 h-6" />
            Scan QR Code
          </h3>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Event Info */}
          <div className="text-center mb-6">
            <h4 className="font-semibold text-gray-900 mb-1">{event.title}</h4>
            <p className="text-sm text-gray-500">
              {event.startAt && new Date(event.startAt.toMillis ? event.startAt.toMillis() : event.startAt).toLocaleDateString()}
            </p>
            {event.venueName && (
              <p className="text-sm text-gray-500">{event.venueName}</p>
            )}
          </div>

          {/* Camera Permission Request */}
          {cameraPermission === false && (
            <div className="text-center space-y-4">
              <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto" />
              <div>
                <h4 className="font-semibold text-gray-900 mb-2">Camera Permission Required</h4>
                <p className="text-gray-600 mb-4">
                  We need access to your camera to scan the QR code for event check-in.
                </p>
                <button
                  onClick={requestCameraPermission}
                  className="px-6 py-3 bg-[#F25129] text-white rounded-lg hover:bg-[#E0451F] transition-colors flex items-center gap-2 mx-auto"
                >
                  <Camera className="w-4 h-4" />
                  Allow Camera Access
                </button>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="text-center space-y-4">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
              <div>
                <h4 className="font-semibold text-gray-900 mb-2">Scanning Error</h4>
                <p className="text-gray-600 mb-4">{error}</p>
                <button
                  onClick={() => {
                    setError(null);
                    startScanning();
                  }}
                  className="px-6 py-3 bg-[#F25129] text-white rounded-lg hover:bg-[#E0451F] transition-colors"
                >
                  Try Again
                </button>
              </div>
            </div>
          )}

          {/* Processing State */}
          {isProcessing && (
            <div className="text-center space-y-4">
              <Loader2 className="w-12 h-12 text-[#F25129] mx-auto animate-spin" />
              <div>
                <h4 className="font-semibold text-gray-900 mb-2">Processing Check-in</h4>
                <p className="text-gray-600">Please wait while we record your attendance...</p>
              </div>
            </div>
          )}

          {/* Camera View */}
          {isScanning && !isProcessing && !error && cameraPermission !== false && (
            <div className="space-y-4">
              <div className="relative bg-black rounded-lg overflow-hidden">
                <video
                  ref={videoRef}
                  className="w-full h-64 object-cover"
                  playsInline
                  muted
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="border-2 border-white border-dashed w-48 h-48 rounded-lg flex items-center justify-center">
                    <QrCode className="w-16 h-16 text-white opacity-50" />
                  </div>
                </div>
              </div>
              
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-2">
                  Position the QR code within the frame
                </p>
                <button
                  onClick={stopScanning}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Stop Scanning
                </button>
              </div>
            </div>
          )}

          {/* Instructions */}
          {!isScanning && !isProcessing && !error && cameraPermission !== false && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h5 className="font-medium text-blue-900 mb-2">How to check in:</h5>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Point your camera at the event QR code</li>
                <li>• Hold steady until the code is recognized</li>
                <li>• Your attendance will be automatically recorded</li>
                <li>• You'll receive a confirmation message</li>
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Group Check-in Modal */}
      {showGroupCheckin && scannedQRData && (
        <GroupCheckinModal
          event={event}
          qrCodeData={scannedQRData}
          onClose={() => {
            setShowGroupCheckin(false);
            setScannedQRData(null);
            startScanning(); // Resume scanning
          }}
          onSuccess={(groupId, memberCount) => {
            toast.success(`Successfully checked in ${memberCount} family members!`);
            onAttendanceRecorded?.(true, `Group check-in successful: ${memberCount} members`);
            onClose(); // Close the scanner
          }}
        />
      )}
    </div>
  );
};
