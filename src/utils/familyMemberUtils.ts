import { FamilyMember, CreateFamilyMemberData, FamilyMemberValidationResult } from '../types/family';

/**
 * Generate a unique ID for family members
 */
export const generateFamilyMemberId = (): string => {
  return `fm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Validate family member data
 */
export const validateFamilyMember = (data: Partial<FamilyMember>): FamilyMemberValidationResult => {
  const errors: string[] = [];

  // Name validation
  if (!data.name || data.name.trim().length === 0) {
    errors.push('Name is required');
  } else if (data.name.trim().length < 2) {
    errors.push('Name must be at least 2 characters long');
  } else if (data.name.trim().length > 50) {
    errors.push('Name must be less than 50 characters');
  }

  // Age group validation (optional but if provided, must be valid)
  if (data.ageGroup && !['0-2', '3-5', '6-10', 'teen', 'adult'].includes(data.ageGroup)) {
    errors.push('Invalid age group');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Sanitize family member data
 */
export const sanitizeFamilyMemberData = (data: any): Partial<FamilyMember> => {
  return {
    name: data.name ? data.name.trim() : '',
    ageGroup: data.ageGroup || undefined,
    isDefaultMember: Boolean(data.isDefaultMember)
  };
};

/**
 * Calculate age group from birth date
 */
export const calculateAgeGroup = (birthDate: Date): '0-2' | '3-5' | '6-10' | '11+' => {
  const today = new Date();
  // Calculate age in years
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  if (age <= 2) return '0-2';
  if (age <= 5) return '3-5';
  if (age <= 10) return '6-10';
  return '11+';
};

/**
 * Format display name for family member
 */
export const formatDisplayName = (member: FamilyMember): string => {
  if (member.ageGroup && member.ageGroup !== '11+') {
    return `${member.name} (${member.ageGroup})`;
  }
  return member.name;
};

/**
 * Check if family member is a child
 */
export const isChild = (member: FamilyMember): boolean => {
  return member.ageGroup !== undefined && member.ageGroup !== '11+';
};

/**
 * Check if family member is an adult
 */
export const isAdult = (member: FamilyMember): boolean => {
  return member.ageGroup === '11+' || member.ageGroup === undefined;
};

/**
 * Get default family member template
 */
export const getDefaultFamilyMemberTemplate = (): CreateFamilyMemberData => ({
  name: '',
  ageGroup: undefined,
  isDefaultMember: true
});

/**
 * Clone family member data
 */
export const cloneFamilyMember = (member: FamilyMember): Omit<FamilyMember, 'id' | 'createdAt' | 'updatedAt'> => ({
  name: member.name,
  ageGroup: member.ageGroup,
  isDefaultMember: member.isDefaultMember
});
