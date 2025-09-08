import React, { useState, useEffect } from 'react';
import { QRCodeService } from '../../services/qrCodeService';
import { EventDoc } from '../../hooks/useEvents';
import { QrCode, Download, Copy, RefreshCw, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';

interface QRCodeGeneratorProps {
  event: EventDoc;
  onQRGenerated?: (qrCode: string) => void;
  className?: string;
}

export const QRCodeGenerator: React.FC<QRCodeGeneratorProps> = ({
  event,
  onQRGenerated,
  className = ''
}) => {
  const [qrCodeData, setQrCodeData] = useState<string>('');
  const [qrCodeImage, setQrCodeImage] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    generateQRCode();
  }, [event.id]);

  const generateQRCode = async () => {
    if (!event.id || !event.title) return;

    setIsGenerating(true);
    try {
      // Generate QR data
      const qrData = QRCodeService.generateQRData(event.id, event.title);
      const qrDataString = JSON.stringify(qrData);
      setQrCodeData(qrDataString);

      // Generate QR image
      const qrImage = await QRCodeService.generateQRCodeImage(qrData);
      setQrCodeImage(qrImage);

      // Notify parent component
      onQRGenerated?.(qrDataString);

      toast.success('QR code generated successfully!');
    } catch (error) {
      console.error('Error generating QR code:', error);
      toast.error('Failed to generate QR code');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyQRData = async () => {
    try {
      await navigator.clipboard.writeText(qrCodeData);
      setIsCopied(true);
      toast.success('QR code data copied to clipboard!');
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error('Error copying QR data:', error);
      toast.error('Failed to copy QR code data');
    }
  };

  const downloadQRCode = () => {
    if (!qrCodeImage) return;

    const link = document.createElement('a');
    link.href = qrCodeImage;
    link.download = `qr-code-${event.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success('QR code downloaded!');
  };

  const isQRCodeValid = () => {
    if (!event.startAt) return false;
    const now = Date.now();
    const eventStart = event.startAt.toMillis ? event.startAt.toMillis() : new Date(event.startAt).getTime();
    
    // QR code is valid from 1 hour before event to 4 hours after start
    const validFrom = eventStart - (60 * 60 * 1000);
    const validTo = eventStart + (4 * 60 * 60 * 1000);
    
    return now >= validFrom && now <= validTo;
  };

  if (!event.attendanceEnabled) {
    return (
      <div className={`bg-gray-100 rounded-lg p-6 text-center ${className}`}>
        <QrCode className="w-12 h-12 text-gray-400 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-gray-700 mb-2">QR Code Attendance</h3>
        <p className="text-gray-500 mb-4">QR code attendance tracking is not enabled for this event.</p>
        <button
          onClick={() => {
            // This would need to be implemented to update the event's attendanceEnabled field
            toast.info('Contact an admin to enable QR attendance for this event');
          }}
          className="px-4 py-2 bg-[#F25129] text-white rounded-lg hover:bg-[#E0451F] transition-colors"
        >
          Enable QR Attendance
        </button>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-6 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <QrCode className="w-5 h-5" />
          Event QR Code
        </h3>
        <div className="flex gap-2">
          <button
            onClick={generateQRCode}
            disabled={isGenerating}
            className="p-2 text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
            title="Regenerate QR Code"
          >
            <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {isGenerating ? (
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="w-8 h-8 text-[#F25129] animate-spin" />
          <span className="ml-2 text-gray-600">Generating QR code...</span>
        </div>
      ) : qrCodeImage ? (
        <div className="space-y-4">
          {/* QR Code Status */}
          <div className={`flex items-center gap-2 p-3 rounded-lg ${
            isQRCodeValid() 
              ? 'bg-green-50 text-green-700 border border-green-200' 
              : 'bg-yellow-50 text-yellow-700 border border-yellow-200'
          }`}>
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm font-medium">
              {isQRCodeValid() 
                ? 'QR Code is active and ready for scanning' 
                : 'QR Code is not currently valid for this event time'
              }
            </span>
          </div>

          {/* QR Code Image */}
          <div className="flex justify-center">
            <div className="bg-white p-4 rounded-lg border-2 border-gray-200">
              <img 
                src={qrCodeImage} 
                alt="Event QR Code" 
                className="w-48 h-48"
              />
            </div>
          </div>

          {/* Event Info */}
          <div className="text-center space-y-1">
            <h4 className="font-semibold text-gray-900">{event.title}</h4>
            <p className="text-sm text-gray-500">
              {event.startAt && new Date(event.startAt.toMillis ? event.startAt.toMillis() : event.startAt).toLocaleDateString()}
            </p>
            {event.venueName && (
              <p className="text-sm text-gray-500">{event.venueName}</p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 justify-center">
            <button
              onClick={copyQRData}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              {isCopied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {isCopied ? 'Copied!' : 'Copy Data'}
            </button>
            <button
              onClick={downloadQRCode}
              className="flex items-center gap-2 px-4 py-2 bg-[#F25129] text-white rounded-lg hover:bg-[#E0451F] transition-colors"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
          </div>

          {/* Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <h5 className="font-medium text-blue-900 mb-1">How to use:</h5>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Display this QR code at the event entrance</li>
              <li>• Attendees scan with their phone camera</li>
              <li>• Attendance is automatically recorded</li>
              <li>• Real-time updates in admin dashboard</li>
            </ul>
          </div>
        </div>
      ) : (
        <div className="text-center py-8">
          <QrCode className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-500">No QR code generated yet</p>
        </div>
      )}
    </div>
  );
};
