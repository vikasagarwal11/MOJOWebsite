/**
 * Admin page to view error logs from Firestore
 * Accessible only to admins
 */

import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, limit, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { AlertCircle, Clock, FileText, User, Code } from 'lucide-react';

interface ErrorLog {
  id: string;
  message: string;
  code?: string;
  stack?: string;
  component?: string;
  userId?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'auth' | 'firestore' | 'storage' | 'network' | 'validation' | 'unknown';
  timestamp?: Date;
  url?: string;
  browser?: string;
  os?: string;
}

export default function ErrorLogs() {
  const { currentUser } = useAuth();
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [startHour, setStartHour] = useState(20); // 8 PM
  const [startMinute, setStartMinute] = useState(15); // 8:15 PM
  const [endHour, setEndHour] = useState(21); // 9 PM
  const [endMinute, setEndMinute] = useState(0); // 9:00 PM
  
  // Check if user is admin
  if (!currentUser || currentUser.role !== 'admin') {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-800">Access denied. Admin access required.</p>
      </div>
    );
  }
  
  useEffect(() => {
    loadErrors();
  }, [selectedDate, startHour, startMinute, endHour, endMinute]);
  
  const loadErrors = async () => {
    setLoading(true);
    try {
      // Convert EST time to UTC (EST is UTC-5, EDT is UTC-4)
      const estOffset = -5; // Adjust if daylight saving time
      
      const date = new Date(selectedDate);
      const startTime = new Date(date);
      startTime.setUTCHours(startHour - estOffset, startMinute, 0, 0);
      
      const endTime = new Date(date);
      endTime.setUTCHours(endHour - estOffset, endMinute, 0, 0);
      
      const q = query(
        collection(db, 'errorLogs'),
        where('timestamp', '>=', Timestamp.fromDate(startTime)),
        where('timestamp', '<=', Timestamp.fromDate(endTime)),
        orderBy('timestamp', 'desc'),
        limit(100)
      );
      
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        setErrors([]);
      } else {
        const errorLogs: ErrorLog[] = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            message: data.message,
            code: data.code,
            stack: data.stack,
            component: data.component,
            userId: data.userId,
            severity: data.severity,
            category: data.category,
            timestamp: data.timestamp?.toDate(),
            url: data.url,
            browser: data.browser,
            os: data.os,
          };
        });
        
        setErrors(errorLogs);
      }
    } catch (error: any) {
      if (error.code === 'not-found' || error.message?.includes('index')) {
        console.log('No errorLogs collection found yet. Errors will appear here once they are logged.');
      } else {
        console.error('Failed to load error logs:', error);
      }
      setErrors([]);
    } finally {
      setLoading(false);
    }
  };
  
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-600 text-white';
      case 'high': return 'bg-orange-500 text-white';
      case 'medium': return 'bg-yellow-500 text-black';
      case 'low': return 'bg-gray-400 text-white';
      default: return 'bg-gray-300 text-black';
    }
  };
  
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Error Logs</h1>
      
      {/* Time Range Selector */}
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <h2 className="text-lg font-semibold mb-4">Query Time Range</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-3 py-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Start Hour</label>
            <input
              type="number"
              min="0"
              max="23"
              value={startHour}
              onChange={(e) => setStartHour(parseInt(e.target.value))}
              className="w-full px-3 py-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Start Minute</label>
            <input
              type="number"
              min="0"
              max="59"
              value={startMinute}
              onChange={(e) => setStartMinute(parseInt(e.target.value))}
              className="w-full px-3 py-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">End Hour</label>
            <input
              type="number"
              min="0"
              max="23"
              value={endHour}
              onChange={(e) => setEndHour(parseInt(e.target.value))}
              className="w-full px-3 py-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">End Minute</label>
            <input
              type="number"
              min="0"
              max="59"
              value={endMinute}
              onChange={(e) => setEndMinute(parseInt(e.target.value))}
              className="w-full px-3 py-2 border rounded"
            />
          </div>
        </div>
        <p className="text-sm text-gray-600 mt-2">
          Time range: {startHour}:{startMinute.toString().padStart(2, '0')} - {endHour}:{endMinute.toString().padStart(2, '0')} EST on {selectedDate}
        </p>
      </div>
      
      {/* Results */}
      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto"></div>
          <p className="mt-4">Loading error logs...</p>
        </div>
      ) : errors.length === 0 ? (
        <div className="bg-gray-50 p-8 rounded-lg text-center">
          <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 text-lg mb-2">No errors found for this time period</p>
          <p className="text-gray-500 text-sm">
            This could mean:
            <br />• No errors occurred during this time
            <br />• Error logging to Firestore is not yet set up
            <br />• Errors are only logged to browser console (not persisted)
          </p>
        </div>
      ) : (
        <div>
          <div className="mb-4">
            <p className="text-lg font-semibold">
              Found {errors.length} error{errors.length !== 1 ? 's' : ''}
            </p>
          </div>
          
          <div className="space-y-4">
            {errors.map((error) => (
              <div key={error.id} className="bg-white border rounded-lg p-4 shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${getSeverityColor(error.severity)}`}>
                        {error.severity.toUpperCase()}
                      </span>
                      <span className="px-2 py-1 rounded text-xs bg-gray-200 text-gray-700">
                        {error.category}
                      </span>
                      {error.component && (
                        <span className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-700">
                          {error.component}
                        </span>
                      )}
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      {error.message}
                    </h3>
                    {error.code && (
                      <p className="text-sm text-gray-600 mb-1">
                        <Code className="w-4 h-4 inline mr-1" />
                        Code: {error.code}
                      </p>
                    )}
                  </div>
                  <div className="text-right text-sm text-gray-500">
                    {error.timestamp && (
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {error.timestamp.toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-600 mb-3">
                  {error.userId && (
                    <div className="flex items-center gap-1">
                      <User className="w-4 h-4" />
                      User ID: {error.userId}
                    </div>
                  )}
                  {error.url && (
                    <div className="flex items-center gap-1">
                      <FileText className="w-4 h-4" />
                      <span className="truncate">{error.url}</span>
                    </div>
                  )}
                  {error.browser && (
                    <div>Browser: {error.browser}</div>
                  )}
                  {error.os && (
                    <div>OS: {error.os}</div>
                  )}
                </div>
                
                {error.stack && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                      Stack Trace
                    </summary>
                    <pre className="mt-2 p-3 bg-gray-50 rounded text-xs overflow-auto max-h-48">
                      {error.stack}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

