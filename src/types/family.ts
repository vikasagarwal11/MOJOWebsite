// Family member types and interfaces
export interface FamilyMember {
  id: string;
  name: string;
  ageGroup?: '0-2' | '3-5' | '6-10' | 'teen' | 'adult';
  isDefaultMember: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateFamilyMemberData {
  name: string;
  ageGroup?: '0-2' | '3-5' | '6-10' | 'teen' | 'adult';
  isDefaultMember?: boolean;
}

export interface UpdateFamilyMemberData {
  name?: string;
  ageGroup?: '0-2' | '3-5' | '6-10' | 'teen' | 'adult';
  isDefaultMember?: boolean;
}

export interface FamilyMemberValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface FamilyMemberFormData {
  name: string;
  ageGroup: '0-2' | '3-5' | '6-10' | 'teen' | 'adult' | '' | undefined;
  isDefaultMember: boolean;
}
