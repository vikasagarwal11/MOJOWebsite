import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, User, Save } from 'lucide-react';
import { FamilyMember, FamilyMemberFormData } from '../../types/family';
import { validateFamilyMember } from '../../utils/familyMemberUtils';

interface FamilyMemberFormProps {
  member?: FamilyMember | null;
  onSubmit: (memberData: FamilyMemberFormData) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export const FamilyMemberForm: React.FC<FamilyMemberFormProps> = ({
  member,
  onSubmit,
  onCancel,
  loading = false
}) => {
  const [formData, setFormData] = useState<FamilyMemberFormData>({
    name: '',
    ageGroup: '',
    isDefaultMember: true
  });
  
  const [errors, setErrors] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize form with existing member data
  useEffect(() => {
    if (member) {
      setFormData({
        name: member.name,
        ageGroup: member.ageGroup || '',
        isDefaultMember: member.isDefaultMember
      });
    }
  }, [member]);

  const handleInputChange = (field: keyof FamilyMemberFormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear errors when user starts typing
    if (errors.length > 0) {
      setErrors([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form data - convert empty string to undefined for validation
    const validationData = {
      ...formData,
      ageGroup: formData.ageGroup === '' ? undefined : formData.ageGroup
    };
    const validation = validateFamilyMember(validationData);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    setIsSubmitting(true);
    try {
      // Convert empty string to 'adult' for ageGroup (default for family members)
      const submitData = {
        ...formData,
        ageGroup: formData.ageGroup === '' ? 'adult' : formData.ageGroup
      };
      await onSubmit(submitData);
    } catch (error) {
      console.error('Error submitting family member:', error);
      setErrors(['Failed to save family member. Please try again.']);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isEditMode = !!member;
  const submitDisabled = loading || isSubmitting || !formData.name.trim();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm"
    >
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">
          {isEditMode ? 'Edit Family Member' : 'Add Family Member'}
        </h3>
        <button
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name Field */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Name *
          </label>
          <div className="relative">
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="Enter family member name"
              disabled={loading || isSubmitting}
            />
            <User className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
          </div>
        </div>

        {/* Age Group Field */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Age Group
          </label>
          <select
            value={formData.ageGroup}
            onChange={(e) => handleInputChange('ageGroup', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            disabled={loading || isSubmitting}
          >
            <option value="">Select age group (optional)</option>
            <option value="0-2">0-2 years (Baby/Toddler)</option>
            <option value="3-5">3-5 years (Preschool)</option>
            <option value="6-10">6-10 years (Child)</option>
            <option value="11+">11+ Years (Teen)</option>
            <option value="adult">Adult</option>
          </select>
        </div>

        {/* Default Member Toggle */}
        <div className="flex items-center">
          <input
            type="checkbox"
            id="isDefaultMember"
            checked={formData.isDefaultMember}
            onChange={(e) => handleInputChange('isDefaultMember', e.target.checked)}
            className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
            disabled={loading || isSubmitting}
          />
          <label htmlFor="isDefaultMember" className="ml-2 text-sm text-gray-700">
            Include this member by default in future RSVPs
          </label>
        </div>

        {/* Error Display */}
        {errors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3">
            <ul className="text-sm text-red-600 space-y-1">
              {errors.map((error, index) => (
                <li key={index}>• {error}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Form Actions */}
        <div className="flex justify-end space-x-3 pt-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading || isSubmitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitDisabled}
            className="px-4 py-2 text-sm font-medium text-white bg-purple-600 border border-transparent rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                {isEditMode ? 'Update' : 'Add'} Member
              </>
            )}
          </button>
        </div>
      </form>
    </motion.div>
  );
};
