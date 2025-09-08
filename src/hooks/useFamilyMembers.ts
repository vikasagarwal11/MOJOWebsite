import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { familyMemberService } from '../services/familyMemberService';
import { FamilyMember, CreateFamilyMemberData, UpdateFamilyMemberData } from '../types/family';

export interface FamilyMembersResult {
  familyMembers: FamilyMember[];
  loading: boolean;
  error: string | null;
  createFamilyMember: (member: Omit<FamilyMember, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateFamilyMember: (id: string, member: Partial<FamilyMember>) => Promise<void>;
  deleteFamilyMember: (id: string) => Promise<void>;
  refreshFamilyMembers: () => Promise<void>;
}

export function useFamilyMembers(): FamilyMembersResult {
  const { currentUser } = useAuth();
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFamilyMembers = async () => {
    if (!currentUser) {
      setFamilyMembers([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Use real Firebase service
      const familyMembers = await familyMemberService.getAll(currentUser.id);
      setFamilyMembers(familyMembers);
    } catch (err) {
      console.error('Error loading family members:', err);
      setError('Failed to load family members');
    } finally {
      setLoading(false);
    }
  };

  const createFamilyMember = async (member: Omit<FamilyMember, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!currentUser) throw new Error('User not authenticated');
    
    try {
      setLoading(true);
      // Convert to CreateFamilyMemberData format
      const createData: CreateFamilyMemberData = {
        name: member.name,
        ageGroup: member.ageGroup,
        isDefaultMember: member.isDefaultMember
      };
      const newMember = await familyMemberService.create(currentUser.id, createData);
      setFamilyMembers(prev => [...prev, newMember]);
    } catch (err) {
      console.error('Error creating family member:', err);
      throw new Error('Failed to create family member');
    } finally {
      setLoading(false);
    }
  };

  const updateFamilyMember = async (id: string, updates: Partial<FamilyMember>) => {
    if (!currentUser) throw new Error('User not authenticated');
    
    try {
      setLoading(true);
      // Convert to UpdateFamilyMemberData format
      const updateData: UpdateFamilyMemberData = {
        name: updates.name,
        ageGroup: updates.ageGroup,
        isDefaultMember: updates.isDefaultMember
      };
      const updatedMember = await familyMemberService.update(currentUser.id, id, updateData);
      setFamilyMembers(prev => 
        prev.map(member => 
          member.id === id ? updatedMember : member
        )
      );
    } catch (err) {
      console.error('Error updating family member:', err);
      throw new Error('Failed to update family member');
    } finally {
      setLoading(false);
    }
  };

  const deleteFamilyMember = async (id: string) => {
    if (!currentUser) throw new Error('User not authenticated');
    
    try {
      setLoading(true);
      await familyMemberService.delete(currentUser.id, id);
      setFamilyMembers(prev => prev.filter(member => member.id !== id));
    } catch (err) {
      console.error('Error deleting family member:', err);
      throw new Error('Failed to delete family member');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFamilyMembers();
  }, [currentUser]);

  return {
    familyMembers,
    loading,
    error,
    createFamilyMember,
    updateFamilyMember,
    deleteFamilyMember,
    refreshFamilyMembers: loadFamilyMembers
  };
}