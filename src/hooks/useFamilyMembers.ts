import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { familyMemberService } from '../services/familyMemberService';
import { 
  FamilyMember, 
  CreateFamilyMemberData, 
  UpdateFamilyMemberData 
} from '../types/family';

interface UseFamilyMembersReturn {
  // State
  familyMembers: FamilyMember[];
  loading: boolean;
  error: string | null;
  
  // CRUD operations
  createFamilyMember: (memberData: CreateFamilyMemberData) => Promise<void>;
  updateFamilyMember: (memberId: string, updates: UpdateFamilyMemberData) => Promise<void>;
  deleteFamilyMember: (memberId: string) => Promise<void>;
  
  // Utility functions
  refreshFamilyMembers: () => Promise<void>;
  getFamilyMemberById: (memberId: string) => FamilyMember | undefined;
  hasFamilyMembers: boolean;
  
  // Loading states for individual operations
  creating: boolean;
  updating: boolean;
  deleting: boolean;
}

/**
 * Custom hook for managing family members
 */
export const useFamilyMembers = (): UseFamilyMembersReturn => {
  const { currentUser } = useAuth();
  
  // State
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Individual operation loading states
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  /**
   * Load family members from database
   */
  const loadFamilyMembers = useCallback(async () => {
    if (!currentUser?.id) {
      setFamilyMembers([]);
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const members = await familyMemberService.getAll(currentUser.id);
      setFamilyMembers(members);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load family members';
      setError(errorMessage);
      console.error('❌ Error loading family members:', err);
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id]);

  /**
   * Refresh family members
   */
  const refreshFamilyMembers = useCallback(async () => {
    await loadFamilyMembers();
  }, [loadFamilyMembers]);

  /**
   * Create a new family member
   */
  const createFamilyMember = useCallback(async (memberData: CreateFamilyMemberData) => {
    if (!currentUser?.id) {
      throw new Error('User not authenticated');
    }

    setCreating(true);
    setError(null);
    
    try {
      const newMember = await familyMemberService.create(currentUser.id, memberData);
      setFamilyMembers(prev => [newMember, ...prev]);
      console.log('✅ Family member created successfully');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create family member';
      setError(errorMessage);
      console.error('❌ Error creating family member:', err);
      throw err;
    } finally {
      setCreating(false);
    }
  }, [currentUser?.id]);

  /**
   * Update an existing family member
   */
  const updateFamilyMember = useCallback(async (memberId: string, updates: UpdateFamilyMemberData) => {
    if (!currentUser?.id) {
      throw new Error('User not authenticated');
    }

    setUpdating(true);
    setError(null);
    
    try {
      const updatedMember = await familyMemberService.update(currentUser.id, memberId, updates);
      setFamilyMembers(prev => 
        prev.map(member => 
          member.id === memberId ? updatedMember : member
        )
      );
      console.log('✅ Family member updated successfully');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update family member';
      setError(errorMessage);
      console.error('❌ Error updating family member:', err);
      throw err;
    } finally {
      setUpdating(false);
    }
  }, [currentUser?.id]);

  /**
   * Delete a family member
   */
  const deleteFamilyMember = useCallback(async (memberId: string) => {
    if (!currentUser?.id) {
      throw new Error('User not authenticated');
    }

    setDeleting(true);
    setError(null);
    
    try {
      await familyMemberService.delete(currentUser.id, memberId);
      setFamilyMembers(prev => prev.filter(member => member.id !== memberId));
      console.log('✅ Family member deleted successfully');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete family member';
      setError(errorMessage);
      console.error('❌ Error deleting family member:', err);
      throw err;
    } finally {
      setDeleting(false);
    }
  }, [currentUser?.id]);

  /**
   * Get family member by ID
   */
  const getFamilyMemberById = useCallback((memberId: string): FamilyMember | undefined => {
    return familyMembers.find(member => member.id === memberId);
  }, [familyMembers]);

  /**
   * Check if user has family members
   */
  const hasFamilyMembers = familyMembers.length > 0;

  // Load family members when user changes
  useEffect(() => {
    loadFamilyMembers();
  }, [loadFamilyMembers]);

  return {
    // State
    familyMembers,
    loading,
    error,
    
    // CRUD operations
    createFamilyMember,
    updateFamilyMember,
    deleteFamilyMember,
    
    // Utility functions
    refreshFamilyMembers,
    getFamilyMemberById,
    hasFamilyMembers,
    
    // Loading states
    creating,
    updating,
    deleting
  };
};
