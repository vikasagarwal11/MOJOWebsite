// src/services/chatService.ts
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  limit,
  Timestamp,
  doc,
  updateDoc,
  increment,
  getDocs
} from 'firebase/firestore';
import { db } from '../config/firebase';

export interface ChatMessage {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  senderPhoto?: string;
  timestamp: Timestamp;
  type: 'text' | 'image' | 'event' | 'voice';
  metadata?: any; // For event IDs, image URLs, etc.
  threadId?: string; // For Slack-style threading
}

export interface ChatRoom {
  id: string;
  name: string;
  description: string;
  type: 'public' | 'private' | 'group';
  lastMessage?: string;
  lastMessageTime?: Timestamp;
  memberCount: number;
  tags: string[];
}

export const chatService = {
  // 1. Create a Chat Room (e.g., "New York Moms")
  async createRoom(name: string, description: string, tags: string[] = []) {
    return await addDoc(collection(db, 'chatRooms'), {
      name,
      description,
      type: 'public',
      memberCount: 1,
      tags,
      createdAt: serverTimestamp(),
      lastMessage: 'Welcome to the room!',
      lastMessageTime: serverTimestamp()
    });
  },

  // 2. Real-time Message Streaming (The "Pulse" of the app)
  subscribeToMessages(roomId: string, callback: (messages: ChatMessage[]) => void) {
    const q = query(
      collection(db, 'chatRooms', roomId, 'messages'),
      orderBy('timestamp', 'desc'),
      limit(50)
    );

    return onSnapshot(q, (snapshot) => {
      const messages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ChatMessage[];
      callback(messages);
    });
  },

  // 3. Send Message with "Optimistic Meta" (Fast feeling)
  async sendMessage(roomId: string, userId: string, userName: string, text: string, type: ChatMessage['type'] = 'text', metadata = {}) {
    const messageData = {
      text,
      senderId: userId,
      senderName: userName,
      type,
      metadata,
      timestamp: serverTimestamp(),
    };

    // Update the room's "Last Message" for the list view
    const roomRef = doc(db, 'chatRooms', roomId);
    updateDoc(roomRef, {
      lastMessage: text.substring(0, 50),
      lastMessageTime: serverTimestamp()
    });

    return await addDoc(collection(db, 'chatRooms', roomId, 'messages'), messageData);
  },

  // 4. Get Trending Rooms (High engagement)
  async getTrendingRooms() {
    const q = query(
      collection(db, 'chatRooms'),
      orderBy('lastMessageTime', 'desc'),
      limit(5)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ChatRoom[];
  }
};
