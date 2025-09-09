import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Edit, Trash2, User, Baby } from 'lucide-react';
import { FamilyMember } from '../../types/family';
import { formatDisplayName, isChild, isAdult } from '../../utils/familyMemberUtils';

interface FamilyMemberItemProps {
  member: FamilyMember;
  onEdit: (member: FamilyMember) => void;
  onDelete: (memberId: string) => void;
  deleting?: boolean;
}

export const FamilyMemberItem: React.FC<FamilyMemberItemProps> = ({
  member,
  onEdit,
  onDelete,
  deleting = false
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDelete = () => {
    setShowDeleteConfirm(false);
    onDelete(member.id);
  };

  const getAgeGroupLabel = (ageGroup: string) => {
    switch (ageGroup) {
      case '0-2': return '0-2 Years';
      case '3-5': return '3-5 Years';
      case '6-10': return '6-10 Years';
      case '11+': return '11+ Years';
      case 'adult': return 'Adult';
      default: return 'Unknown';
    }
  };

  const getAgeGroupColor = (ageGroup: string) => {
    switch (ageGroup) {
      case '0-2': return 'bg-pink-100 text-pink-700 border-pink-200';
      case '3-5': return 'bg-purple-100 text-purple-700 border-purple-200';
      case '6-10': return 'bg-orange-100 text-orange-700 border-orange-200';
      case '11+': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'adult': return 'bg-green-100 text-green-700 border-green-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-all duration-200"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Icon based on age group */}
          <div className="flex-shrink-0">
            {isChild(member) ? (
              <Baby className="w-5 h-5 text-pink-500" />
            ) : (
              <User className="w-5 h-5 text-blue-500" />
            )}
          </div>

          {/* Member details */}
          <div className="flex-1">
            <h3 className="font-medium text-gray-900">{member.name}</h3>
            {member.ageGroup && (
              <span className={`inline-block px-2 py-1 text-xs font-medium rounded-full border ${getAgeGroupColor(member.ageGroup)}`}>
                {getAgeGroupLabel(member.ageGroup)}
              </span>
            )}
            {member.isDefaultMember && (
              <span className="inline-block ml-2 px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700 border border-green-200">
                Default
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onEdit(member)}
            className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Edit family member"
          >
            <Edit className="w-4 h-4" />
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowDeleteConfirm(true)}
            disabled={deleting}
            className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
            title="Delete family member"
          >
            <Trash2 className="w-4 h-4" />
          </motion.button>
        </div>
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg"
        >
          <p className="text-sm text-red-700 mb-3">
            Are you sure you want to delete <strong>{member.name}</strong>? This action cannot be undone.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              disabled={deleting}
              className="px-3 py-1.5 bg-gray-300 text-gray-700 text-sm rounded-md hover:bg-gray-400 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
};
