export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  phone?: string;
  inquiryType: string;
  message: string;
  status: 'new' | 'read' | 'replied' | 'closed';
  createdAt: Date;
  updatedAt: Date;
  adminNotes?: string;
  repliedAt?: Date;
  repliedBy?: string;
}

export interface ContactMessageFormData {
  name: string;
  email: string;
  phone?: string;
  inquiryType: string;
  message: string;
}
