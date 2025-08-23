import React, { useState } from 'react';
import { X, Shield, AlertTriangle, Clock, Ban, UserX, MessageSquare, Calendar, FileText } from 'lucide-react';
import { BlockReason, BlockCategory } from '../../types/blocking';
import toast from 'react-hot-toast';

interface UserBlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUser: {
    id: string;
    displayName: string;
    email?: string;
    photoURL?: string;
  };
  onBlock: (
    targetUserId: string,
    reason: BlockReason,
    category: BlockCategory,
    description?: string,
    expiresAt?: Date
  ) => Promise<void>;
}

const BLOCK_REASONS: { value: BlockReason; label: string; icon: React.ReactNode; description: string }[] = [
  { value: 'harassment', label: 'Harassment', icon: <AlertTriangle className="w-4 h-4" />, description: 'Bullying, threats, or unwanted contact' },
  { value: 'spam', label: 'Spam', icon: <MessageSquare className="w-4 h-4" />, description: 'Repeated unwanted messages or content' },
  { value: 'inappropriate_content', label: 'Inappropriate Content', icon: <FileText className="w-4 h-4" />, description: 'Content that violates community guidelines' },
  { value: 'fake_account', label: 'Fake Account', icon: <UserX className="w-4 h-4" />, description: 'Impersonation or false identity' },
  { value: 'security_violation', label: 'Security Violation', icon: <Shield className="w-4 h-4" />, description: 'Attempts to compromise account security' },
  { value: 'terms_violation', label: 'Terms Violation', icon: <Ban className="w-4 h-4" />, description: 'Violation of platform terms of service' },
  { value: 'other', label: 'Other', icon: <AlertTriangle className="w-4 h-4" />, description: 'Other reasons not listed above' }
];

const BLOCK_CATEGORIES: { value: BlockCategory; label: string; icon: React.ReactNode; description: string }[] = [
  { value: 'platform_wide', label: 'Platform Wide', icon: <Ban className="w-4 h-4" />, description: 'Block all interactions across the platform' },
  { value: 'content_only', label: 'Content Only', icon: <FileText className="w-4 h-4" />, description: 'Block content creation but allow viewing' },
  { value: 'interaction_only', label: 'Interaction Only', icon: <MessageSquare className="w-4 h-4" />, description: 'Block likes and comments only' },
  { value: 'rsvp_only', label: 'RSVP Only', icon: <Calendar className="w-4 h-4" />, description: 'Block RSVP functionality only' },
  { value: 'temporary', label: 'Temporary', icon: <Clock className="w-4 h-4" />, description: 'Time-limited block with expiration' },
  { value: 'permanent', label: 'Permanent', icon: <Ban className="w-4 h-4" />, description: 'Permanent block with no expiration' }
];

export const UserBlockModal: React.FC<UserBlockModalProps> = ({
  isOpen,
  onClose,
  targetUser,
  onBlock
}) => {
  const [selectedReason, setSelectedReason] = useState<BlockReason>('harassment');
  const [selectedCategory, setSelectedCategory] = useState<BlockCategory>('interaction_only');
  const [description, setDescription] = useState('');
  const [isTemporary, setIsTemporary] = useState(false);
  const [expirationDays, setExpirationDays] = useState(7);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!description.trim()) {
      toast.error('Please provide a description for the block');
      return;
    }

    setIsSubmitting(true);
    try {
      let expiresAt: Date | undefined;
      
      if (isTemporary && selectedCategory === 'temporary') {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expirationDays);
      }

      await onBlock(
        targetUser.id,
        selectedReason,
        selectedCategory,
        description.trim(),
        expiresAt
      );
      
      onClose();
      toast.success(`User ${targetUser.displayName} blocked successfully`);
    } catch (error) {
      console.error('Failed to block user:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
              <Shield className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Block User</h2>
              <p className="text-sm text-gray-600">Restrict user interactions and content</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Target User Info */}
        <div className="p-6 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-3">
            {targetUser.photoURL ? (
              <img 
                src={targetUser.photoURL} 
                alt={targetUser.displayName}
                className="w-12 h-12 rounded-full object-cover"
              />
            ) : (
              <div className="w-12 h-12 bg-gray-300 rounded-full flex items-center justify-center">
                <span className="text-gray-600 font-medium text-lg">
                  {targetUser.displayName.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div>
              <h3 className="font-medium text-gray-900">{targetUser.displayName}</h3>
              {targetUser.email && (
                <p className="text-sm text-gray-600">{targetUser.email}</p>
              )}
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Block Reason */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Reason for Block
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {BLOCK_REASONS.map((reason) => (
                <label
                  key={reason.value}
                  className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                    selectedReason === reason.value
                      ? 'border-red-500 bg-red-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="reason"
                    value={reason.value}
                    checked={selectedReason === reason.value}
                    onChange={(e) => setSelectedReason(e.target.value as BlockReason)}
                    className="mt-1 text-red-600 focus:ring-red-500"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {reason.icon}
                      <span className="font-medium text-gray-900">{reason.label}</span>
                    </div>
                    <p className="text-xs text-gray-600">{reason.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Block Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Block Category
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {BLOCK_CATEGORIES.map((category) => (
                <label
                  key={category.value}
                  className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                    selectedCategory === category.value
                      ? 'border-red-500 bg-red-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="category"
                    value={category.value}
                    checked={selectedCategory === category.value}
                    onChange={(e) => setSelectedCategory(e.target.value as BlockCategory)}
                    className="mt-1 text-red-600 focus:ring-red-500"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {category.icon}
                      <span className="font-medium text-gray-900">{category.label}</span>
                    </div>
                    <p className="text-xs text-gray-600">{category.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Temporary Block Options */}
          {selectedCategory === 'temporary' && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-blue-600" />
                <span className="font-medium text-blue-900">Temporary Block</span>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isTemporary}
                    onChange={(e) => setIsTemporary(e.target.checked)}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-blue-900">Set expiration date</span>
                </label>
                {isTemporary && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-blue-900">Expires in:</span>
                    <select
                      value={expirationDays}
                      onChange={(e) => setExpirationDays(Number(e.target.value))}
                      className="text-sm border border-blue-300 rounded px-2 py-1 bg-white"
                    >
                      <option value={1}>1 day</option>
                      <option value={3}>3 days</option>
                      <option value={7}>1 week</option>
                      <option value={14}>2 weeks</option>
                      <option value={30}>1 month</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
              Description (Required)
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Please provide details about why you're blocking this user..."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none"
              required
            />
          </div>

          {/* Warning */}
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-yellow-800">
                <p className="font-medium mb-1">Important:</p>
                <ul className="space-y-1 text-xs">
                  <li>• Blocking is a serious action that affects user experience</li>
                  <li>• Users can appeal blocks through the platform</li>
                  <li>• False or malicious blocks may result in account restrictions</li>
                  <li>• Consider using temporary blocks for minor issues</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !description.trim()}
              className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Blocking...
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4" />
                  Block User
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
