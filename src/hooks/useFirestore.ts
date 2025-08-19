import { useState, useEffect } from 'react';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import toast from 'react-hot-toast';

export const useFirestore = () => {
  // Generic function to get all documents from a collection
  const getCollection = async (collectionName: string) => {
    try {
      const querySnapshot = await getDocs(collection(db, collectionName));
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        // Convert Firestore timestamps to Date objects
        createdAt: doc.data().createdAt?.toDate?.() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate?.() || new Date(),
        date: doc.data().date?.toDate?.() || doc.data().date,
        validUntil: doc.data().validUntil?.toDate?.() || doc.data().validUntil,
      }));
    } catch (error) {
      console.error(`Error getting ${collectionName}:`, error);
      toast.error(`Failed to load ${collectionName}`);
      return [];
    }
  };

  // Generic function to add a document
  const addDocument = async (collectionName: string, data: any) => {
    try {
      const docRef = await addDoc(collection(db, collectionName), {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast.success('Document created successfully');
      return docRef.id;
    } catch (error) {
      console.error(`Error adding to ${collectionName}:`, error);
      toast.error('Failed to create document');
      throw error;
    }
  };

  // Generic function to update a document
  const updateDocument = async (collectionName: string, docId: string, data: any) => {
    try {
      await updateDoc(doc(db, collectionName, docId), {
        ...data,
        updatedAt: serverTimestamp(),
      });
      toast.success('Document updated successfully');
    } catch (error) {
      console.error(`Error updating ${collectionName}:`, error);
      toast.error('Failed to update document');
      throw error;
    }
  };

  // Generic function to delete a document
  const deleteDocument = async (collectionName: string, docId: string) => {
    try {
      await deleteDoc(doc(db, collectionName, docId));
      toast.success('Document deleted successfully');
    } catch (error) {
      console.error(`Error deleting from ${collectionName}:`, error);
      toast.error('Failed to delete document');
      throw error;
    }
  };

  // Real-time listener for a collection
  const useRealtimeCollection = (collectionName: string, queryConstraints: any[] = []) => {
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      const q = query(collection(db, collectionName), ...queryConstraints);
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const documents = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate?.() || new Date(),
          updatedAt: doc.data().updatedAt?.toDate?.() || new Date(),
          date: doc.data().date?.toDate?.() || doc.data().date,
          validUntil: doc.data().validUntil?.toDate?.() || doc.data().validUntil,
        }));
        setData(documents);
        setLoading(false);
      }, (error) => {
        console.error(`Error listening to ${collectionName}:`, error);
        setLoading(false);
      });

      return () => unsubscribe();
    }, [collectionName]);

    return { data, loading };
  };

  return {
    getCollection,
    addDocument,
    updateDocument,
    deleteDocument,
    useRealtimeCollection,
  };
};