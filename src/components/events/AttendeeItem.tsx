import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  User, 
  Edit3, 
  Trash2, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Baby, 
  Users, 
  Star,
  Save,
  X
} from 'lucide-react';
import { Attendee, UpdateAttendeeData, AttendeeStatus, AgeGroup, Relationship } from '../../types/attendee';

interface AttendeeItemProps {
  attendee: Attendee;
  onUpdate: (attendeeId: string, updateData: UpdateAttendeeData) => Promise<void>;
  onDelete: (attendeeId: string) => Promise<void>;
  onStatusChange: (attendeeId: string, status: AttendeeStatus) => Promise<void>;
  isEditable: boolean;
  isDeletable: boolean;
}

// Age group display labels
const getAgeGroupLabel = (ageGroup: AgeGroup): string => {
  switch (ageGroup) {
    case '0-2': return '0-2 Years';
    case '3-5': return '3-5 Years';
    case '6-10': return '6-10 Years';
    case '11+': return '11+ Years';
    default: return ageGroup;
  }
};

// Age group colors
const getAgeGroupColor = (ageGroup: AgeGroup): string => {
  switch (ageGroup) {
    case '0-2': return 'bg-pink-100 text-pink-700 border-pink-200';
    case '3-5': return 'bg-purple-100 text-purple-700 border-purple-200';
    case '6-10': return 'bg-orange-100 text-orange-700 border-orange-200';
    case '11+': return 'bg-blue-100 text-blue-700 border-blue-200';
    default: return 'bg-gray-100 text-gray-700 border-gray-200';
  }
};

// Relationship icons
const getRelationshipIcon = (relationship: Relationship) => {
  switch (relationship) {
    case 'self': return <Star className="w-4 h-4" />;
    case 'spouse': return <User className="w-4 h-4" />;
    case 'child': return <Baby className="w-4 h-4" />;
    case 'guest': return <Users className="w-4 h-4" />;
    default: return <User className="w-4 h-4" />;
  }
};

// Status colors
const getStatusColors = (status: AttendeeStatus) => {
  switch (status) {
    case 'going':
      return 'bg-green-100 text-green-700 border-green-200';
    case 'not-going':
      return 'bg-red-100 text-red-700 border-red-200';
    case 'pending':
      return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200';
  }
};

export const AttendeeItem: React.FC<AttendeeItemProps> = ({
  attendee,
  onUpdate,
  onDelete,
  onStatusChange,
  isEditable,
  isDeletable
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<UpdateAttendeeData>({
    name: attendee.name,
    ageGroup: attendee.ageGroup,
    relationship: attendee.relationship
  });
  const [isUpdating, setIsUpdating] = useState(false);

  const handleSave = async () => {
    if (!editData.name?.trim()) return;
    
    setIsUpdating(true);
    try {
      await onUpdate(attendee.attendeeId, editData);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to update attendee:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCancel = () => {
    setEditData({
      name: attendee.name,
      ageGroup: attendee.ageGroup,
      relationship: attendee.relationship
    });
    setIsEditing(false);
  };

  const handleStatusToggle = async () => {
    const newStatus: AttendeeStatus = attendee.rsvpStatus === 'going' ? 'not-going' : 'going';
    await onStatusChange(attendee.attendeeId, newStatus);
  };

  const handleDelete = async () => {
    if (window.confirm(`Are you sure you want to remove ${attendee.name}?`)) {
      await onDelete(attendee.attendeeId);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-all duration-200"
    >
      {isEditing ? (
        // Edit Mode
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-gray-700">Edit Attendee</h4>
            <div className="flex gap-2">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleSave}
                disabled={isUpdating || !editData.name?.trim()}
                className="p-1.5 bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4" />
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleCancel}
                className="p-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              >
                <X className="w-4 h-4" />
              </motion.button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 gap-3">
            {/* Name Input */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
              <input
                type="text"
                value={editData.name || ''}
                onChange={(e) => setEditData(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="Attendee name"
              />
            </div>
            
            {/* Age Group Select */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Age Group</label>
              <select
                value={editData.ageGroup || '11+'}
                onChange={(e) => setEditData(prev => ({ ...prev, ageGroup: e.target.value as AgeGroup }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="0-2">0-2 Years</option>
                <option value="3-5">3-5 Years</option>
                <option value="6-10">6-10 Years</option>
                <option value="11+">11+ Years</option>
              </select>
            </div>
            
            {/* Relationship Select */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Relationship</label>
              <select
                value={editData.relationship || 'guest'}
                onChange={(e) => setEditData(prev => ({ ...prev, relationship: e.target.value as Relationship }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="self">Self</option>
                <option value="spouse">Spouse</option>
                <option value="child">Child</option>
                <option value="guest">Guest</option>
              </select>
            </div>
          </div>
        </div>
      ) : (
        // Display Mode
        <div className="space-y-3">
          {/* Header with Name and Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-purple-100 text-purple-700 rounded-full">
                {getRelationshipIcon(attendee.relationship)}
              </div>
              <div>
                <h4 className="font-medium text-gray-900">{attendee.name}</h4>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`px-2 py-1 text-xs rounded-full border ${getAgeGroupColor(attendee.ageGroup)}`}>
                    {getAgeGroupLabel(attendee.ageGroup)}
                  </span>
                  <span className={`px-2 py-1 text-xs rounded-full border ${getStatusColors(attendee.rsvpStatus)}`}>
                    {attendee.rsvpStatus === 'going' ? 'Going' : 
                     attendee.rsvpStatus === 'not-going' ? "Can't Go" : 'Pending'}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              {/* Status Toggle Button */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleStatusToggle}
                className={`p-2 rounded-full transition-colors ${
                  attendee.rsvpStatus === 'going'
                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                    : 'bg-red-100 text-red-700 hover:bg-red-200'
                }`}
                title={attendee.rsvpStatus === 'going' ? 'Mark as not going' : 'Mark as going'}
              >
                {attendee.rsvpStatus === 'going' ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
              </motion.button>
              
              {/* Edit Button */}
              {isEditable && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setIsEditing(true)}
                  className="p-2 bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 transition-colors"
                  title="Edit attendee"
                >
                  <Edit3 className="w-4 h-4" />
                </motion.button>
              )}
              
              {/* Delete Button */}
              {isDeletable && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleDelete}
                  className="p-2 bg-red-100 text-red-700 rounded-full hover:bg-red-200 transition-colors"
                  title="Remove attendee"
                >
                  <Trash2 className="w-4 h-4" />
                </motion.button>
              )}
            </div>
          </div>
          
          {/* Additional Info */}
          <div className="text-xs text-gray-500">
            <div className="flex items-center gap-4">
              <span>Added: {new Date(attendee.createdAt).toLocaleDateString()}</span>
              {attendee.updatedAt !== attendee.createdAt && (
                <span>Updated: {new Date(attendee.updatedAt).toLocaleDateString()}</span>
              )}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};
