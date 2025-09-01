import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Users, AlertCircle } from 'lucide-react';
import { FamilyMember } from '../../types/family';
import { FamilyMemberItem } from './FamilyMemberItem';
import { FamilyMemberForm } from './FamilyMemberForm';
import { useFamilyMembers } from '../../hooks/useFamilyMembers';

export const FamilyMemberList: React.FC = () => {
  const {
    familyMembers,
    loading,
    error,
    createFamilyMember,
    updateFamilyMember,
    deleteFamilyMember,
    refreshFamilyMembers
  } = useFamilyMembers();

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingMember, setEditingMember] = useState<FamilyMember | null>(null);
  const [deletingMemberId, setDeletingMemberId] = useState<string | null>(null);

  const handleCreateMember = async (memberData: any) => {
    try {
      await createFamilyMember(memberData);
      setShowAddForm(false);
    } catch (error) {
      console.error('Failed to create family member:', error);
      throw error; // Re-throw to let form handle the error
    }
  };

  const handleUpdateMember = async (memberData: any) => {
    if (!editingMember) return;
    
    try {
      await updateFamilyMember(editingMember.id, memberData);
      setEditingMember(null);
    } catch (error) {
      console.error('Failed to update family member:', error);
      throw error; // Re-throw to let form handle the error
    }
  };

  const handleDeleteMember = async (memberId: string) => {
    try {
      setDeletingMemberId(memberId);
      await deleteFamilyMember(memberId);
    } catch (error) {
      console.error('Failed to delete family member:', error);
    } finally {
      setDeletingMemberId(null);
    }
  };

  const handleEditMember = (member: FamilyMember) => {
    setEditingMember(member);
    setShowAddForm(false);
  };

  const handleCancelEdit = () => {
    setEditingMember(null);
  };

  const handleCancelAdd = () => {
    setShowAddForm(false);
  };

  const defaultMembers = familyMembers.filter(m => m.isDefaultMember);
  const otherMembers = familyMembers.filter(m => !m.isDefaultMember);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading family members...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-red-800 mb-2">Error Loading Family Members</h3>
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={refreshFamilyMembers}
          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-purple-600" />
          <h2 className="text-xl font-semibold text-gray-900">Family Members</h2>
          <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
            {familyMembers.length} member{familyMembers.length !== 1 ? 's' : ''}
          </span>
        </div>
        
        {!showAddForm && !editingMember && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Member
          </motion.button>
        )}
      </div>

      {/* Add/Edit Form */}
      <AnimatePresence mode="wait">
        {showAddForm && (
          <FamilyMemberForm
            onSubmit={handleCreateMember}
            onCancel={handleCancelAdd}
            loading={loading}
          />
        )}
        
        {editingMember && (
          <FamilyMemberForm
            member={editingMember}
            onSubmit={handleUpdateMember}
            onCancel={handleCancelEdit}
            loading={loading}
          />
        )}
      </AnimatePresence>

      {/* Default Members Section */}
      {defaultMembers.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wide">
            Default Members ({defaultMembers.length})
          </h3>
          <div className="space-y-2">
            {defaultMembers.map((member) => (
              <FamilyMemberItem
                key={member.id}
                member={member}
                onEdit={handleEditMember}
                onDelete={handleDeleteMember}
                deleting={deletingMemberId === member.id}
              />
            ))}
          </div>
        </div>
      )}

      {/* Other Members Section */}
      {otherMembers.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wide">
            Other Members ({otherMembers.length})
          </h3>
          <div className="space-y-2">
            {otherMembers.map((member) => (
              <FamilyMemberItem
                key={member.id}
                member={member}
                onEdit={handleEditMember}
                onDelete={handleDeleteMember}
                deleting={deletingMemberId === member.id}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {familyMembers.length === 0 && !showAddForm && (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
          <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Family Members Yet</h3>
          <p className="text-gray-600 mb-4">
            Add your family members to make RSVP management easier.
          </p>
          <button
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors font-medium"
          >
            Add Your First Member
          </button>
        </div>
      )}

      {/* Help Text */}
      {familyMembers.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-blue-600 text-xs font-bold">i</span>
            </div>
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">Family Member Management</p>
              <ul className="space-y-1 text-blue-700">
                <li>• <strong>Default members</strong> will be automatically included in future RSVPs</li>
                <li>• <strong>Other members</strong> can be added manually when needed</li>
                <li>• Family members are saved to your profile and can be reused</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
