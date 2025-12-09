import React, { useState, useEffect, useRef } from 'react';
import { collection, doc, getDoc, getDocs, query, where, addDoc, deleteDoc, onSnapshot, orderBy, serverTimestamp, limit } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { Search, UserPlus, X, Shield, Loader2, CheckCircle, User, Mail, Phone } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { useDebounce } from 'use-debounce';

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
  const [debouncedSearchQuery] = useDebounce(searchQuery, 500); // Increased to 500ms for better performance
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [addingUserId, setAddingUserId] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  // Optimized type-ahead search with smart query strategy
  useEffect(() => {
    let cancelled = false;
    
    const performSearch = async () => {
      const trimmedQuery = debouncedSearchQuery.trim();
      
      // Require minimum 3 characters for search (reduces unnecessary queries)
      if (!trimmedQuery || trimmedQuery.length < 3) {
        setSearchResults([]);
        setShowDropdown(false);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      setShowDropdown(true);
      
      try {
        const usersRef = collection(db, 'users');
        const searchTerm = trimmedQuery.toLowerCase();
        const normalizedPhone = searchTerm.replace(/\D/g, ''); // Remove non-digits
        
        // Smart query strategy: Start with most common searches first
        // Priority: Email > DisplayName > FirstName/LastName > Phone
        
        const queries: any[] = [];
        const isEmailSearch = searchTerm.includes('@');
        const isPhoneSearch = normalizedPhone.length >= 3 && /^\d+$/.test(normalizedPhone);
        
        // Strategy 1: If it looks like an email, search email first
        if (isEmailSearch) {
          queries.push(
            query(
              usersRef,
              where('email', '>=', searchTerm),
              where('email', '<=', searchTerm + '\uf8ff'),
              limit(20) // Get more results for better matching
            )
          );
        }
        // Strategy 2: If it looks like a phone number, search phone AND names
        // (because "333333" could match phone "+13333333333" or name "333")
        else if (isPhoneSearch) {
          // Search for phone numbers starting with normalized digits (without +)
          queries.push(
            query(
              usersRef,
              where('phoneNumber', '>=', normalizedPhone),
              where('phoneNumber', '<=', normalizedPhone + '\uf8ff'),
              limit(20)
            )
          );
          
          // Also search for phone numbers with + prefix
          if (normalizedPhone.length >= 3) {
            queries.push(
              query(
                usersRef,
                where('phoneNumber', '>=', '+' + normalizedPhone),
                where('phoneNumber', '<=', '+' + normalizedPhone + '\uf8ff'),
                limit(20)
              )
            );
          }
          
          // Also search name fields (in case it's a name, not a phone)
          // Search displayName
          queries.push(
            query(
              usersRef,
              where('displayName', '>=', searchTerm),
              where('displayName', '<=', searchTerm + '\uf8ff'),
              limit(20)
            )
          );
          
          // Search firstName
          const capitalizedTerm = searchTerm.charAt(0).toUpperCase() + searchTerm.slice(1);
          queries.push(
            query(
              usersRef,
              where('firstName', '>=', capitalizedTerm),
              where('firstName', '<=', capitalizedTerm + '\uf8ff'),
              limit(20)
            )
          );
          
          // Search lastName if query is longer
          if (searchTerm.length >= 4) {
            queries.push(
              query(
                usersRef,
                where('lastName', '>=', capitalizedTerm),
                where('lastName', '<=', capitalizedTerm + '\uf8ff'),
                limit(20)
              )
            );
          }
        }
        // Strategy 3: Otherwise, search by name fields (most common case)
        else {
          // Search displayName (most likely to have full name)
          queries.push(
            query(
              usersRef,
              where('displayName', '>=', searchTerm),
              where('displayName', '<=', searchTerm + '\uf8ff'),
              limit(20)
            )
          );
          
          // Also search firstName (common for first name searches)
          const capitalizedTerm = searchTerm.charAt(0).toUpperCase() + searchTerm.slice(1);
          queries.push(
            query(
              usersRef,
              where('firstName', '>=', capitalizedTerm),
              where('firstName', '<=', capitalizedTerm + '\uf8ff'),
              limit(20)
            )
          );
          
          // Search lastName if query is longer (likely last name)
          if (searchTerm.length >= 4) {
            queries.push(
              query(
                usersRef,
                where('lastName', '>=', capitalizedTerm),
                where('lastName', '<=', capitalizedTerm + '\uf8ff'),
                limit(20)
              )
            );
          }
        }
        
        // Always include email search as fallback (if not already included)
        if (!isEmailSearch) {
          queries.push(
            query(
              usersRef,
              where('email', '>=', searchTerm),
              where('email', '<=', searchTerm + '\uf8ff'),
              limit(10)
            )
          );
        }

        // Execute queries in parallel (but limit to 3-4 queries max)
        const snapshots = await Promise.all(
          queries.slice(0, 4).map(q => 
            getDocs(q).catch((err) => {
              console.warn('Query failed:', err);
              return { docs: [] };
            })
          )
        );

        if (cancelled) return;

        const results: any[] = [];
        const seenIds = new Set<string>();

        // Combine and filter results client-side for better matching
        snapshots.forEach(snapshot => {
          snapshot.docs.forEach(doc => {
            if (!seenIds.has(doc.id)) {
              seenIds.add(doc.id);
              const data = doc.data();
              
              // Client-side filtering for better matching (handles partial matches)
              // Normalize phone numbers for comparison (remove all non-digits)
              const userPhoneNormalized = data.phoneNumber?.replace(/\D/g, '') || '';
              const searchPhoneNormalized = normalizedPhone;
              
              const matchesSearch = 
                (data.email?.toLowerCase().includes(searchTerm)) ||
                (data.displayName?.toLowerCase().includes(searchTerm)) ||
                (data.firstName?.toLowerCase().includes(searchTerm)) ||
                (data.lastName?.toLowerCase().includes(searchTerm)) ||
                (userPhoneNormalized.includes(searchPhoneNormalized) && searchPhoneNormalized.length >= 3) ||
                (data.phoneNumber?.toLowerCase().includes(searchTerm.toLowerCase()));
              
              if (matchesSearch) {
                results.push({
                  id: doc.id,
                  ...data
                });
              }
            }
          });
        });

        if (cancelled) return;

        // Sort results by relevance (exact/starts-with matches first)
        results.sort((a, b) => {
          const aEmail = a.email?.toLowerCase() || '';
          const bEmail = b.email?.toLowerCase() || '';
          const aName = `${a.firstName || ''} ${a.lastName || ''}`.toLowerCase().trim();
          const bName = `${b.firstName || ''} ${b.lastName || ''}`.toLowerCase().trim();
          const aDisplayName = a.displayName?.toLowerCase() || '';
          const bDisplayName = b.displayName?.toLowerCase() || '';
          
          // Exact match gets highest priority
          const aExact = aEmail === searchTerm || aName === searchTerm || aDisplayName === searchTerm;
          const bExact = bEmail === searchTerm || bName === searchTerm || bDisplayName === searchTerm;
          if (aExact && !bExact) return -1;
          if (!aExact && bExact) return 1;
          
          // Then starts-with matches
          const aStartsWith = aEmail.startsWith(searchTerm) || aName.startsWith(searchTerm) || aDisplayName.startsWith(searchTerm);
          const bStartsWith = bEmail.startsWith(searchTerm) || bName.startsWith(searchTerm) || bDisplayName.startsWith(searchTerm);
          if (aStartsWith && !bStartsWith) return -1;
          if (!aStartsWith && bStartsWith) return 1;
          
          return 0;
        });

        setSearchResults(results.slice(0, 10)); // Limit to top 10 results
      } catch (error: any) {
        if (!cancelled) {
          console.error('Error searching users:', error);
          setSearchResults([]);
        }
      } finally {
        if (!cancelled) {
          setIsSearching(false);
        }
      }
    };

    performSearch();
    
    // Cleanup function to cancel in-flight requests
    return () => {
      cancelled = true;
    };
  }, [debouncedSearchQuery]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

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
      setShowDropdown(false);
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
        <div className="relative">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 z-10" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowDropdown(true);
              }}
              onFocus={() => {
                if (searchResults.length > 0) {
                  setShowDropdown(true);
                }
              }}
              placeholder="Type at least 3 characters to search (name, email, or phone)..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
            />
            {isSearching && (
              <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 animate-spin text-gray-400" />
            )}
          </div>

          {/* Type-ahead Dropdown */}
          {showDropdown && searchQuery.length >= 3 && (
            <div
              ref={dropdownRef}
              className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-96 overflow-y-auto"
            >
              {isSearching ? (
                <div className="p-4 text-center text-gray-500">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                  <p className="text-sm">Searching...</p>
                </div>
              ) : searchResults.length > 0 ? (
                <div className="py-2">
                  {searchResults.map((user) => {
                    const alreadyTrusted = isUserTrusted(user.id);
                    const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.displayName || 'No name';
                    return (
                      <div
                        key={user.id}
                        className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                        onClick={() => {
                          if (!alreadyTrusted) {
                            addToTrustedList(user);
                          }
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                              <p className="font-medium text-gray-900 truncate">{fullName}</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 ml-6">
                              {user.email && (
                                <div className="flex items-center gap-1">
                                  <Mail className="w-3 h-3" />
                                  <span className="truncate">{user.email}</span>
                                </div>
                              )}
                              {user.phoneNumber && (
                                <div className="flex items-center gap-1">
                                  <Phone className="w-3 h-3" />
                                  <span>{user.phoneNumber}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          {alreadyTrusted ? (
                            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium flex items-center gap-1 flex-shrink-0 ml-2">
                              <CheckCircle className="w-3 h-3" />
                              Trusted
                            </span>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                addToTrustedList(user);
                              }}
                              disabled={addingUserId === user.id}
                              className="px-3 py-1 bg-[#F25129] text-white rounded-lg hover:bg-[#E0451F] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 text-sm flex-shrink-0 ml-2"
                            >
                              {addingUserId === user.id ? (
                                <>
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  Adding...
                                </>
                              ) : (
                                <>
                                  <UserPlus className="w-3 h-3" />
                                  Add
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 text-center text-gray-500">
                  <p className="text-sm">No users found matching "{searchQuery}"</p>
                  <p className="text-xs mt-1">Try searching by first name, last name, email, or phone number</p>
                </div>
              )}
            </div>
          )}
          
          {/* Show hint when typing but less than 3 characters */}
          {searchQuery.length > 0 && searchQuery.length < 3 && (
            <div className="absolute z-50 w-full mt-1 bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
              Type at least 3 characters to search...
            </div>
          )}
        </div>
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

