import React, { useState, useEffect } from 'react';
import { AttendanceService } from '../../services/attendanceService';
import { EventDoc } from '../../hooks/useEvents';
import { AttendanceAnalytics as AttendanceAnalyticsType, AttendanceRecord } from '../../types/attendance';
import { 
  Users, 
  QrCode, 
  TrendingUp, 
  Clock, 
  Smartphone, 
  Monitor,
  Download,
  RefreshCw,
  BarChart3,
  PieChart
} from 'lucide-react';
import toast from 'react-hot-toast';

interface AttendanceAnalyticsProps {
  event: EventDoc;
  className?: string;
}

export const AttendanceAnalytics: React.FC<AttendanceAnalyticsProps> = ({
  event,
  className = ''
}) => {
  const [analytics, setAnalytics] = useState<AttendanceAnalyticsType | null>(null);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadAnalytics();
  }, [event.id]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      
      // Load analytics and attendance records in parallel
      const [analyticsData, records] = await Promise.all([
        AttendanceService.getEventAttendanceAnalytics(event.id, event),
        AttendanceService.getEventAttendance(event.id)
      ]);
      
      setAnalytics(analyticsData);
      setAttendanceRecords(records);
    } catch (error) {
      console.error('Error loading attendance analytics:', error);
      toast.error('Failed to load attendance data');
    } finally {
      setLoading(false);
    }
  };

  const refreshData = async () => {
    setRefreshing(true);
    await loadAnalytics();
    setRefreshing(false);
    toast.success('Data refreshed');
  };

  const exportAttendanceData = () => {
    if (!attendanceRecords.length) {
      toast.error('No attendance data to export');
      return;
    }

    const csvData = [
      ['Name', 'Email', 'Check-in Time', 'Device'],
      ...attendanceRecords.map(record => [
        record.userName,
        record.userEmail,
        record.scannedAt instanceof Date 
          ? record.scannedAt.toLocaleString()
          : record.scannedAt?.toDate?.()?.toLocaleString() || 'Unknown time',
        record.deviceInfo || 'Unknown'
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `attendance-${event.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    
    toast.success('Attendance data exported');
  };

  if (loading) {
    return (
      <div className={`bg-white rounded-lg border border-gray-200 p-6 ${className}`}>
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="w-6 h-6 text-[#F25129] animate-spin" />
          <span className="ml-2 text-gray-600">Loading attendance data...</span>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className={`bg-white rounded-lg border border-gray-200 p-6 ${className}`}>
        <div className="text-center py-8">
          <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">No Attendance Data</h3>
          <p className="text-gray-500">No QR code scans recorded for this event yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <BarChart3 className="w-5 h-5" />
          Attendance Analytics
        </h3>
        <div className="flex gap-2">
          <button
            onClick={refreshData}
            disabled={refreshing}
            className="p-2 text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={exportAttendanceData}
            className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
            title="Export Data"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-medium text-blue-900">Total RSVPs</span>
            </div>
            <div className="text-2xl font-bold text-blue-900">{analytics.totalRSVPs}</div>
          </div>

          <div className="bg-green-50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <QrCode className="w-5 h-5 text-green-600" />
              <span className="text-sm font-medium text-green-900">Attended</span>
            </div>
            <div className="text-2xl font-bold text-green-900">{analytics.totalAttendance}</div>
          </div>

          <div className="bg-purple-50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-purple-600" />
              <span className="text-sm font-medium text-purple-900">Attendance Rate</span>
            </div>
            <div className="text-2xl font-bold text-purple-900">
              {analytics.attendanceRate.toFixed(1)}%
            </div>
          </div>

          <div className="bg-orange-50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-5 h-5 text-orange-600" />
              <span className="text-sm font-medium text-orange-900">Peak Time</span>
            </div>
            <div className="text-sm font-bold text-orange-900">
              {analytics.peakScanTime 
                ? analytics.peakScanTime instanceof Date 
                  ? analytics.peakScanTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : analytics.peakScanTime?.toDate?.()?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || 'Unknown'
                : 'N/A'
              }
            </div>
          </div>
        </div>

        {/* Hourly Breakdown */}
        {analytics.hourlyBreakdown.length > 0 && (
          <div>
            <h4 className="text-lg font-semibold text-gray-900 mb-4">Check-ins by Hour</h4>
            <div className="space-y-2">
              {analytics.hourlyBreakdown.map(({ hour, count }) => (
                <div key={hour} className="flex items-center gap-4">
                  <div className="w-16 text-sm text-gray-600">
                    {hour}:00
                  </div>
                  <div className="flex-1 bg-gray-200 rounded-full h-4 relative">
                    <div 
                      className="bg-[#F25129] h-4 rounded-full transition-all duration-300"
                      style={{ 
                        width: `${(count / Math.max(...analytics.hourlyBreakdown.map(h => h.count))) * 100}%` 
                      }}
                    />
                  </div>
                  <div className="w-8 text-sm font-medium text-gray-900">
                    {count}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Device Breakdown */}
        {analytics.deviceBreakdown.length > 0 && (
          <div>
            <h4 className="text-lg font-semibold text-gray-900 mb-4">Device Usage</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {analytics.deviceBreakdown.map(({ device, count }) => (
                <div key={device} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  {device.toLowerCase().includes('mobile') || device.toLowerCase().includes('android') || device.toLowerCase().includes('iphone') ? (
                    <Smartphone className="w-5 h-5 text-gray-600" />
                  ) : (
                    <Monitor className="w-5 h-5 text-gray-600" />
                  )}
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{device}</div>
                    <div className="text-sm text-gray-500">{count} scans</div>
                  </div>
                  <div className="text-lg font-bold text-[#F25129]">{count}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Check-ins */}
        {attendanceRecords.length > 0 && (
          <div>
            <h4 className="text-lg font-semibold text-gray-900 mb-4">Recent Check-ins</h4>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {attendanceRecords.slice(0, 10).map((record) => (
                <div key={record.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className="w-8 h-8 bg-[#F25129] rounded-full flex items-center justify-center text-white font-semibold text-sm">
                    {record.userName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{record.userName}</div>
                    <div className="text-sm text-gray-500">
                      {record.scannedAt instanceof Date 
                        ? record.scannedAt.toLocaleString()
                        : record.scannedAt?.toDate?.()?.toLocaleString() || 'Unknown time'}
                    </div>
                  </div>
                  {record.isDuplicate && (
                    <div className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">
                      Duplicate
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
