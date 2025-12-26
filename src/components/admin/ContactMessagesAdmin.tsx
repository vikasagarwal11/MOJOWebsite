import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  MessageSquare, 
  Clock, 
  Eye,
  Reply,
  Archive,
  Search
} from 'lucide-react';
import { ContactService } from '../../services/contactService';
import { ContactMessage } from '../../types/contact';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

interface ContactMessagesAdminProps {
  className?: string;
}

const ContactMessagesAdmin: React.FC<ContactMessagesAdminProps> = ({ className = '' }) => {
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState<ContactMessage | null>(null);
  const [statusFilter, setStatusFilter] = useState<ContactMessage['status'] | 'all'>('all');
  const [inquiryTypeFilter, setInquiryTypeFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [stats, setStats] = useState({
    total: 0,
    new: 0,
    read: 0,
    replied: 0,
    closed: 0
  });

  useEffect(() => {
    const unsubscribe = ContactService.subscribeToMessages((newMessages) => {
      setMessages(newMessages);
      setLoading(false);
      
      // Calculate stats
      const newStats = {
        total: newMessages.length,
        new: newMessages.filter(m => m.status === 'new').length,
        read: newMessages.filter(m => m.status === 'read').length,
        replied: newMessages.filter(m => m.status === 'replied').length,
        closed: newMessages.filter(m => m.status === 'closed').length,
      };
      setStats(newStats);
    });

    return () => unsubscribe();
  }, []);

  const filteredMessages = messages.filter(message => {
    const matchesStatus = statusFilter === 'all' || message.status === statusFilter;
    const matchesInquiryType = inquiryTypeFilter === 'all' || message.inquiryType === inquiryTypeFilter;
    const matchesSearch = searchTerm === '' || 
      message.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      message.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      message.message.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesStatus && matchesInquiryType && matchesSearch;
  });

  const handleStatusUpdate = async (messageId: string, newStatus: ContactMessage['status']) => {
    try {
      await ContactService.updateMessageStatus(
        messageId, 
        newStatus, 
        adminNotes || undefined,
        'admin' // In a real app, this would be the current admin's ID
      );
      
      toast.success(`Message marked as ${newStatus}`);
      setAdminNotes('');
      
      if (newStatus === 'read' || newStatus === 'replied') {
        setSelectedMessage(null);
      }
    } catch (error) {
      console.error('Error updating message status:', error);
      toast.error('Failed to update message status');
    }
  };

  const getStatusIcon = (status: ContactMessage['status']) => {
    switch (status) {
      case 'new':
        return <Clock className="w-4 h-4 text-blue-500" />;
      case 'read':
        return <Eye className="w-4 h-4 text-yellow-500" />;
      case 'replied':
        return <Reply className="w-4 h-4 text-green-500" />;
      case 'closed':
        return <Archive className="w-4 h-4 text-gray-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: ContactMessage['status']) => {
    switch (status) {
      case 'new':
        return 'bg-blue-100 text-blue-800';
      case 'read':
        return 'bg-yellow-100 text-yellow-800';
      case 'replied':
        return 'bg-green-100 text-green-800';
      case 'closed':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#F25129]"></div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Contact Messages</h2>
          <p className="text-gray-600">Manage and respond to customer inquiries</p>
        </div>
        
        {/* Stats */}
        <div className="flex gap-4 text-sm">
          <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full">
            New: {stats.new}
          </div>
          <div className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full">
            Read: {stats.read}
          </div>
          <div className="bg-green-100 text-green-800 px-3 py-1 rounded-full">
            Replied: {stats.replied}
          </div>
          <div className="bg-gray-100 text-gray-800 px-3 py-1 rounded-full">
            Total: {stats.total}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-4">
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search messages..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
          />
        </div>
        
        {/* Filter Buttons */}
        <div className="space-y-3">
          {/* Status Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Status Filter:</label>
            <div className="flex flex-wrap gap-2">
              {(['all', 'new', 'read', 'replied', 'closed'] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    statusFilter === status
                      ? 'bg-[#F25129] text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>
          </div>
          
          {/* Inquiry Type Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Message Type:</label>
            <div className="flex flex-wrap gap-2">
              {(['all', 'general', 'events', 'membership', 'technical', 'partnership', 'start-a-chapter', 'founder_message', 'other'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setInquiryTypeFilter(type)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    inquiryTypeFilter === type
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {type === 'all' ? 'All Types' : 
                   type === 'founder_message' ? '👑 Founder Messages' :
                   type === 'start-a-chapter' ? 'Start A Chapter' :
                   type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Messages List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Messages List */}
        <div className="space-y-4">
          {filteredMessages.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <MessageSquare className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>No messages found</p>
            </div>
          ) : (
            filteredMessages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-4 rounded-lg border cursor-pointer transition-all duration-200 ${
                  selectedMessage?.id === message.id
                    ? 'border-[#F25129] bg-[#F25129]/5'
                    : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
                }`}
                onClick={() => setSelectedMessage(message)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{message.name}</h3>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(message.status)}`}>
                      {getStatusIcon(message.status)}
                      <span className="ml-1">{message.status}</span>
                    </span>
                    {message.inquiryType === 'founder_message' && (
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                        👑 Founder Message
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500">
                    {format(message.createdAt, 'MMM d, yyyy')}
                  </span>
                </div>
                
                <p className="text-sm text-gray-600 mb-2">{message.email}</p>
                <p className="text-sm text-gray-700 line-clamp-2">{message.message}</p>
                
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-gray-500 capitalize">{message.inquiryType}</span>
                  {message.phone && (
                    <span className="text-xs text-gray-500">• {message.phone}</span>
                  )}
                </div>
              </motion.div>
            ))
          )}
        </div>

        {/* Message Detail */}
        <div className="lg:sticky lg:top-4">
          {selectedMessage ? (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white rounded-lg border border-gray-200 p-6"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{selectedMessage.name}</h3>
                  <p className="text-sm text-gray-600">{selectedMessage.email}</p>
                  {selectedMessage.phone && (
                    <p className="text-sm text-gray-600">{selectedMessage.phone}</p>
                  )}
                </div>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(selectedMessage.status)}`}>
                  {getStatusIcon(selectedMessage.status)}
                  <span className="ml-1">{selectedMessage.status}</span>
                </span>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Inquiry Type
                  </label>
                  <p className="text-sm text-gray-900 capitalize">{selectedMessage.inquiryType}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Message
                  </label>
                  <p className="text-sm text-gray-900 whitespace-pre-wrap">{selectedMessage.message}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Admin Notes
                  </label>
                  <textarea
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="Add notes about this message..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent text-sm"
                    rows={3}
                  />
                </div>

                <div className="flex gap-2 pt-4">
                  {selectedMessage.status === 'new' && (
                    <button
                      onClick={() => handleStatusUpdate(selectedMessage.id, 'read')}
                      className="flex items-center gap-2 px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors text-sm"
                    >
                      <Eye className="w-4 h-4" />
                      Mark as Read
                    </button>
                  )}
                  
                  {selectedMessage.status !== 'replied' && (
                    <button
                      onClick={() => handleStatusUpdate(selectedMessage.id, 'replied')}
                      className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm"
                    >
                      <Reply className="w-4 h-4" />
                      Mark as Replied
                    </button>
                  )}
                  
                  {selectedMessage.status !== 'closed' && (
                    <button
                      onClick={() => handleStatusUpdate(selectedMessage.id, 'closed')}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm"
                    >
                      <Archive className="w-4 h-4" />
                      Close
                    </button>
                  )}
                </div>

                <div className="text-xs text-gray-500 pt-2 border-t">
                  <p>Received: {format(selectedMessage.createdAt, 'MMM d, yyyy h:mm a')}</p>
                  {selectedMessage.repliedAt && (
                    <p>Replied: {format(selectedMessage.repliedAt, 'MMM d, yyyy h:mm a')}</p>
                  )}
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <MessageSquare className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>Select a message to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ContactMessagesAdmin;
