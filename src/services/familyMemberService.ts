import { 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  getDoc, 
  collection, 
  query, 
  getDocs, 
  where,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { 
  FamilyMember, 
  CreateFamilyMemberData, 
  UpdateFamilyMemberData 
} from '../types/family';
import { 
  generateFamilyMemberId, 
  validateFamilyMember, 
  sanitizeFamilyMemberData 
} from '../utils/familyMemberUtils';

/**
 * Family Member Service for CRUD operations
 */
export const familyMemberService = {
  /**
   * Create a new family member
   */
  create: async (userId: string, memberData: CreateFamilyMemberData): Promise<FamilyMember> => {
    try {
      // Validate input data
      const validation = validateFamilyMember(memberData);
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      // Sanitize data
      const sanitizedData = sanitizeFamilyMemberData(memberData);

      // Create family member document
      const familyMember: FamilyMember = {
        id: generateFamilyMemberId(),
        name: sanitizedData.name!,
        ageGroup: sanitizedData.ageGroup,
        isDefaultMember: sanitizedData.isDefaultMember || false,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Save to Firestore
      const userRef = doc(db, 'users', userId);
      const familyMemberRef = doc(userRef, 'familyMembers', familyMember.id);
      
      await setDoc(familyMemberRef, {
        ...familyMember,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      console.log('✅ Family member created successfully:', familyMember.id);
      return familyMember;
    } catch (error) {
      console.error('❌ Failed to create family member:', error);
      throw error;
    }
  },

  /**
   * Update an existing family member
   */
  update: async (userId: string, memberId: string, updates: UpdateFamilyMemberData): Promise<FamilyMember> => {
    try {
      // Validate update data
      const validation = validateFamilyMember(updates);
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      // Sanitize update data
      const sanitizedUpdates = sanitizeFamilyMemberData(updates);

      // Get existing member to ensure it exists
      const existingMember = await familyMemberService.getById(userId, memberId);
      if (!existingMember) {
        throw new Error('Family member not found');
      }

      // Prepare update data
      const updateData = {
        ...sanitizedUpdates,
        updatedAt: serverTimestamp()
      };

      // Update in Firestore
      const familyMemberRef = doc(db, 'users', userId, 'familyMembers', memberId);
      await updateDoc(familyMemberRef, updateData);

      // Return updated member
      const updatedMember: FamilyMember = {
        ...existingMember,
        ...sanitizedUpdates,
        updatedAt: new Date()
      };

      console.log('✅ Family member updated successfully:', memberId);
      return updatedMember;
    } catch (error) {
      console.error('❌ Failed to update family member:', error);
      throw error;
    }
  },

  /**
   * Delete a family member
   */
  delete: async (userId: string, memberId: string): Promise<void> => {
    try {
      // Check if member exists
      const existingMember = await familyMemberService.getById(userId, memberId);
      if (!existingMember) {
        throw new Error('Family member not found');
      }

      // Delete from Firestore
      const familyMemberRef = doc(db, 'users', userId, 'familyMembers', memberId);
      await deleteDoc(familyMemberRef);

      console.log('✅ Family member deleted successfully:', memberId);
    } catch (error) {
      console.error('❌ Failed to delete family member:', error);
      throw error;
    }
  },

  /**
   * Get all family members for a user
   */
  getAll: async (userId: string): Promise<FamilyMember[]> => {
    try {
      const familyMembersRef = collection(db, 'users', userId, 'familyMembers');
      const snapshot = await getDocs(familyMembersRef);
      
      const familyMembers: FamilyMember[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        familyMembers.push({
          id: doc.id,
          name: data.name,
          ageGroup: data.ageGroup,
          isDefaultMember: data.isDefaultMember || false,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date()
        });
      });

      // Sort by creation date (newest first)
      familyMembers.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      console.log('✅ Retrieved family members:', familyMembers.length);
      return familyMembers;
    } catch (error) {
      console.error('❌ Failed to get family members:', error);
      throw error;
    }
  },

  /**
   * Get a specific family member by ID
   */
  getById: async (userId: string, memberId: string): Promise<FamilyMember | null> => {
    try {
      const familyMemberRef = doc(db, 'users', userId, 'familyMembers', memberId);
      const snapshot = await getDoc(familyMemberRef);
      
      if (!snapshot.exists()) {
        return null;
      }

      const data = snapshot.data();
      const familyMember: FamilyMember = {
        id: snapshot.id,
        name: data.name,
        ageGroup: data.ageGroup,
        isDefaultMember: data.isDefaultMember || false,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date()
      };

      return familyMember;
    } catch (error) {
      console.error('❌ Failed to get family member:', error);
      throw error;
    }
  },

  /**
   * Get family members by age group
   */
  getByAgeGroup: async (userId: string, ageGroup: '0-2' | '3-5' | '6-10' | '11+'): Promise<FamilyMember[]> => {
    try {
      const familyMembersRef = collection(db, 'users', userId, 'familyMembers');
      const q = query(familyMembersRef, where('ageGroup', '==', ageGroup));
      const snapshot = await getDocs(q);
      
      const familyMembers: FamilyMember[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        familyMembers.push({
          id: doc.id,
          name: data.name,
          ageGroup: data.ageGroup,
          isDefaultMember: data.isDefaultMember || false,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date()
        });
      });

      return familyMembers;
    } catch (error) {
      console.error('❌ Failed to get family members by age group:', error);
      throw error;
    }
  },

  /**
   * Check if user has any family members
   */
  hasFamilyMembers: async (userId: string): Promise<boolean> => {
    try {
      const familyMembers = await familyMemberService.getAll(userId);
      return familyMembers.length > 0;
    } catch (error) {
      console.error('❌ Failed to check family members:', error);
      return false;
    }
  },

  /**
   * Create a family member from an attendee
   */
  createFromAttendee: async (userId: string, attendee: { name: string; ageGroup?: string; relationship?: string }): Promise<FamilyMember> => {
    try {
      // Check if a family member with the same name already exists
      const existingMembers = await familyMemberService.getAll(userId);
      const existingMember = existingMembers.find(member => 
        member.name.toLowerCase() === attendee.name.toLowerCase()
      );

      if (existingMember) {
        console.log('✅ Family member already exists:', existingMember.name);
        return existingMember;
      }

      // Create new family member data
      const familyMemberData: CreateFamilyMemberData = {
        name: attendee.name,
        ageGroup: (attendee.ageGroup as any) || 'adult',
        isDefaultMember: false
      };

      // Create the family member
      const newFamilyMember = await familyMemberService.create(userId, familyMemberData);
      
      console.log('✅ Family member created from attendee:', newFamilyMember.name);
      return newFamilyMember;
    } catch (error) {
      console.error('❌ Failed to create family member from attendee:', error);
      throw error;
    }
  }
};
