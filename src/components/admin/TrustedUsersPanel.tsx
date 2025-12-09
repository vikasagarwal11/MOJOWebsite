import React, { useState, useEffect } from 'react';
import { collection, doc, getDoc, getDocs, query, where, addDoc, deleteDoc, onSnapshot, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { Search, UserPlus, X, Shield, Loader2, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';

interface TrustedUser {
  id: string;
  userId: string;
  userName: string;
  userEmail?: string;
  addedBy: string;
  addedAt: any;
}

export const TrustedUsersPanel: React.FC = () => {
  const { currentUser } = useAuth();
  const [trustedUsers, setTrustedUsers] = useState<TrustedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [addingUserId, setAddingUserId] = useState<string | null>(null);

  // Load trusted users list
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'admin') return;

    const trustedUsersQuery = query(
      collection(db, 'trustedUsers'),
      orderBy('addedAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      trustedUsersQuery,
      (snapshot) => {
        const users = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as TrustedUser[];
        setTrustedUsers(users);
        setLoading(false);
      },
      (error) => {
        console.error('Error loading trusted users:', error);
        setLoading(false);
        toast.error('Failed to load trusted users');
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  // Search for users to add
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast.error('Please enter a search query');
      return;
    }

    setIsSearching(true);
    try {
      // Search by email or display name
      const usersRef = collection(db, 'users');
      const emailQuery = query(
        usersRef,
        where('email', '>=', searchQuery.trim().toLowerCase()),
        where('email', '<=', searchQuery.trim().toLowerCase() + '\uf8ff'),
        limit(10)
      );

      const nameQuery = query(
        usersRef,
        where('displayName', '>=', searchQuery.trim()),
        where('displayName', '<=', searchQuery.trim() + '\uf8ff'),
        limit(10)
      );

      const [emailSnapshot, nameSnapshot] = await Promise.all([
        getDocs(emailQuery),
        getDocs(nameQuery)
      ]);

      const results: any[] = [];
      const seenIds = new Set<string>();

      // Combine results, avoiding duplicates
      [...emailSnapshot.docs, ...nameSnapshot.docs].forEach(doc => {
        if (!seenIds.has(doc.id)) {
          seenIds.add(doc.id);
          results.push({
            id: doc.id,
            ...doc.data()
          });
        }
      });

      setSearchResults(results);
    } catch (error: any) {
      console.error('Error searching users:', error);
      toast.error('Failed to search users');
    } finally {
      setIsSearching(false);
    }
  };

  // Add user to trusted list
  const addToTrustedList = async (user: any) => {
    if (!currentUser) return;

    // Check if already in trusted list
    const isAlreadyTrusted = trustedUsers.some(tu => tu.userId === user.id);
    if (isAlreadyTrusted) {
      toast.error('User is already in the trusted list');
      return;
    }

    setAddingUserId(user.id);
    try {
      await addDoc(collection(db, 'trustedUsers'), {
        userId: user.id,
        userName: user.displayName || user.email || 'Unknown User',
        userEmail: user.email,
        addedBy: currentUser.id,
        addedAt: serverTimestamp()
      });

      toast.success(`${user.displayName || user.email} added to trusted list`);
      setSearchQuery('');
      setSearchResults([]);
    } catch (error: any) {
      console.error('Error adding trusted user:', error);
      toast.error('Failed to add user to trusted list');
    } finally {
      setAddingUserId(null);
    }
  };

  // Remove user from trusted list
  const removeFromTrustedList = async (trustedUserId: string, userName: string) => {
    if (!window.confirm(`Remove ${userName} from trusted list? Their images will be analyzed for inappropriate content.`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'trustedUsers', trustedUserId));
      toast.success(`${userName} removed from trusted list`);
    } catch (error: any) {
      console.error('Error removing trusted user:', error);
      toast.error('Failed to remove user from trusted list');
    }
  };

  // Check if user is in search results and already trusted
  const isUserTrusted = (userId: string) => {
    return trustedUsers.some(tu => tu.userId === userId);
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-200 pb-4">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Shield className="w-6 h-6 text-[#F25129]" />
          Trusted Users Management
        </h2>
        <p className="text-gray-600 mt-2">
          Users in the trusted list will skip image content analysis, reducing costs. 
          Only users NOT in this list will have their images analyzed for inappropriate content.
        </p>
      </div>

      {/* Add User Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Add User to Trusted List</h3>
        <div className="flex gap-2 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search by name or email..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={isSearching}
            className="px-6 py-2 bg-[#F25129] text-white rounded-lg hover:bg-[#E0451F] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSearching ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Searching...
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                Search
              </>
            )}
          </button>
        </div>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="mt-4 space-y-2">
            <h4 className="text-sm font-medium text-gray-700">Search Results:</h4>
            {searchResults.map((user) => {
              const alreadyTrusted = isUserTrusted(user.id);
              return (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <div>
                    <p className="font-medium text-gray-900">{user.displayName || 'No name'}</p>
                    <p className="text-sm text-gray-600">{user.email}</p>
                  </div>
                  {alreadyTrusted ? (
                    <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium flex items-center gap-1">
                      <CheckCircle className="w-4 h-4" />
                      Already Trusted
                    </span>
                  ) : (
                    <button
                      onClick={() => addToTrustedList(user)}
                      disabled={addingUserId === user.id}
                      className="px-4 py-2 bg-[#F25129] text-white rounded-lg hover:bg-[#E0451F] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {addingUserId === user.id ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Adding...
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-4 h-4" />
                          Add to Trusted
                        </>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Trusted Users List */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Trusted Users ({trustedUsers.length})
        </h3>

        {loading ? (
          <div className="text-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-[#F25129] mx-auto mb-4" />
            <p className="text-gray-600">Loading trusted users...</p>
          </div>
        ) : trustedUsers.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 font-medium">No trusted users yet</p>
            <p className="text-sm text-gray-500 mt-1">Add users to skip image analysis and reduce costs</p>
          </div>
        ) : (
          <div className="space-y-3">
            {trustedUsers.map((trustedUser) => (
              <div
                key={trustedUser.id}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-green-600" />
                    <p className="font-medium text-gray-900">{trustedUser.userName}</p>
                  </div>
                  {trustedUser.userEmail && (
                    <p className="text-sm text-gray-600 mt-1">{trustedUser.userEmail}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    Added {trustedUser.addedAt?.toDate ? new Date(trustedUser.addedAt.toDate()).toLocaleDateString() : 'Recently'}
                  </p>
                </div>
                <button
                  onClick={() => removeFromTrustedList(trustedUser.id, trustedUser.userName)}
                  className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-2"
                  title="Remove from trusted list"
                >
                  <X className="w-4 h-4" />
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-semibold text-blue-900 mb-2">How It Works</h4>
        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
          <li>Users in the trusted list skip image content analysis (saves costs)</li>
          <li>Users NOT in the trusted list have their images analyzed for inappropriate content</li>
          <li>Text analysis still runs for all users (low cost)</li>
          <li>Admins are automatically trusted (no need to add them)</li>
        </ul>
      </div>
    </div>
  );
};

