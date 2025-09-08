import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  where, 
  getDocs, 
  doc, 
  updateDoc, 
  serverTimestamp,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { EmailService } from './emailService';
import { ContactMessage } from '../types/contact';

export class ContactService {
  private static readonly COLLECTION_NAME = 'contactMessages';

  // Submit a new contact message
  static async submitMessage(messageData: Omit<ContactMessage, 'id' | 'createdAt' | 'updatedAt' | 'status'>): Promise<string> {
    try {
      const docRef = await addDoc(collection(db, this.COLLECTION_NAME), {
        ...messageData,
        status: 'new',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      
      console.log('Contact message submitted with ID:', docRef.id);
      
      // Send email notification to admin (in background, don't wait for it)
      EmailService.notifyAdminOfNewMessage(messageData).catch(error => {
        console.warn('Email notification failed (non-critical):', error);
      });
      
      return docRef.id;
    } catch (error) {
      console.error('Error submitting contact message:', error);
      throw new Error('Failed to submit message. Please try again.');
    }
  }

  // Get all contact messages (admin only)
  static async getAllMessages(): Promise<ContactMessage[]> {
    try {
      const q = query(
        collection(db, this.COLLECTION_NAME),
        orderBy('createdAt', 'desc')
      );
      
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date(),
        repliedAt: doc.data().repliedAt?.toDate(),
      })) as ContactMessage[];
    } catch (error) {
      console.error('Error fetching contact messages:', error);
      throw new Error('Failed to fetch messages');
    }
  }

  // Get messages by status
  static async getMessagesByStatus(status: ContactMessage['status']): Promise<ContactMessage[]> {
    try {
      const q = query(
        collection(db, this.COLLECTION_NAME),
        where('status', '==', status),
        orderBy('createdAt', 'desc')
      );
      
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date(),
        repliedAt: doc.data().repliedAt?.toDate(),
      })) as ContactMessage[];
    } catch (error) {
      console.error('Error fetching messages by status:', error);
      throw new Error('Failed to fetch messages');
    }
  }

  // Update message status
  static async updateMessageStatus(
    messageId: string, 
    status: ContactMessage['status'],
    adminNotes?: string,
    repliedBy?: string
  ): Promise<void> {
    try {
      const messageRef = doc(db, this.COLLECTION_NAME, messageId);
      const updateData: any = {
        status,
        updatedAt: serverTimestamp(),
      };

      if (adminNotes) {
        updateData.adminNotes = adminNotes;
      }

      if (status === 'replied' && repliedBy) {
        updateData.repliedAt = serverTimestamp();
        updateData.repliedBy = repliedBy;
      }

      await updateDoc(messageRef, updateData);
    } catch (error) {
      console.error('Error updating message status:', error);
      throw new Error('Failed to update message status');
    }
  }

  // Real-time subscription to messages
  static subscribeToMessages(
    callback: (messages: ContactMessage[]) => void,
    status?: ContactMessage['status']
  ): () => void {
    let q;
    
    if (status) {
      q = query(
        collection(db, this.COLLECTION_NAME),
        where('status', '==', status),
        orderBy('createdAt', 'desc')
      );
    } else {
      q = query(
        collection(db, this.COLLECTION_NAME),
        orderBy('createdAt', 'desc')
      );
    }

    return onSnapshot(q, (querySnapshot) => {
      const messages = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date(),
        repliedAt: doc.data().repliedAt?.toDate(),
      })) as ContactMessage[];
      
      callback(messages);
    });
  }

  // Get message statistics
  static async getMessageStats(): Promise<{
    total: number;
    new: number;
    read: number;
    replied: number;
    closed: number;
  }> {
    try {
      const messages = await this.getAllMessages();
      
      return {
        total: messages.length,
        new: messages.filter(m => m.status === 'new').length,
        read: messages.filter(m => m.status === 'read').length,
        replied: messages.filter(m => m.status === 'replied').length,
        closed: messages.filter(m => m.status === 'closed').length,
      };
    } catch (error) {
      console.error('Error getting message stats:', error);
      throw new Error('Failed to get message statistics');
    }
  }
}
