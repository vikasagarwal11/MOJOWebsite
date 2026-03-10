import { orderBy } from 'firebase/firestore';
import { MessageCircle, Plus } from 'lucide-react';
import React, { useState } from 'react';
import CreatePostModal from '../components/posts/CreatePostModal';
import PostCard from '../components/posts/PostCard';
import { useAuth } from '../contexts/AuthContext';
import { useFirestore } from '../hooks/useFirestore';
import { isUserApproved } from '../utils/userUtils';

const Posts: React.FC = () => {
  const { currentUser } = useAuth();
  const { useRealtimeCollection } = useFirestore();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sortBy, setSortBy] = useState<'newest' | 'liked'>('newest');
  const [search, setSearch] = useState('');

  // Get posts from Firestore in real-time.
  // Always query by createdAt for stability, then sort client-side for UI toggles.
  const { data: posts = [], loading } = useRealtimeCollection('posts', [orderBy('createdAt', 'desc')]);

  const normalizedSearch = search.trim().toLowerCase();
  const filteredPosts = normalizedSearch
    ? posts.filter((post: any) =>
        post.title?.toLowerCase().includes(normalizedSearch) ||
        post.content?.toLowerCase().includes(normalizedSearch) ||
        post.authorName?.toLowerCase().includes(normalizedSearch)
      )
    : posts;

  const sortedPosts = [...filteredPosts].sort((a: any, b: any) => {
    if (sortBy === 'liked') {
      const aReactionsCountObj = (a.reactionsCount ?? {}) as Record<string, number>;
      const bReactionsCountObj = (b.reactionsCount ?? {}) as Record<string, number>;

      const aTotal =
        (a.totalReactions ??
          Object.values(aReactionsCountObj).reduce((acc, n) => acc + (typeof n === 'number' ? n : 0), 0) ??
          a.likesCount ??
          a.likes?.length ??
          0) as number;
      const bTotal =
        (b.totalReactions ??
          Object.values(bReactionsCountObj).reduce((acc, n) => acc + (typeof n === 'number' ? n : 0), 0) ??
          b.likesCount ??
          b.likes?.length ??
          0) as number;

      if (bTotal !== aTotal) return bTotal - aTotal;
    }

    const aDate = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
    const bDate = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
    return bDate - aDate;
  });

  // Handle post deletion - refresh the posts list
  const handlePostDeleted = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Modern Header */}
      <div className="flex flex-col items-center justify-center mb-8 animate-fade-in">
        <h1 className="text-4xl md:text-5xl font-extrabold bg-gradient-to-r from-[#F25129] to-[#FFC107] bg-clip-text text-transparent tracking-tight mb-2">Posts</h1>
        <p className="text-lg text-gray-700 font-medium max-w-xl text-center">Share your fitness journey, tips, and connect with the community!</p>
      </div>

      {/* Search / Sort / Create Bar */}
      <div className="flex flex-col gap-4 mb-8 animate-fade-in md:flex-row md:items-center md:justify-between">
        <div className="flex w-full flex-col gap-3 md:flex-row md:items-center">
          <input
            type="text"
            placeholder="Search posts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full md:w-[360px] px-5 py-3 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-[#F25129] shadow-sm text-lg"
          />

          <div className="flex w-full flex-wrap gap-2 md:w-auto">
            <button
              type="button"
              className={`px-5 py-3 rounded-full font-semibold transition-all duration-200 border text-lg ${sortBy === 'newest' ? 'bg-[#F25129] text-white shadow-md' : 'bg-white text-[#F25129] border-[#F25129]'} hover:bg-[#FFC107] hover:text-white`}
              onClick={() => setSortBy('newest')}
            >
              Newest
            </button>
            <button
              type="button"
              className={`px-5 py-3 rounded-full font-semibold transition-all duration-200 border text-lg ${sortBy === 'liked' ? 'bg-[#F25129] text-white shadow-md' : 'bg-white text-[#F25129] border-[#F25129]'} hover:bg-[#FFC107] hover:text-white`}
              onClick={() => setSortBy('liked')}
            >
              Most liked
            </button>
          </div>
        </div>

        {currentUser && isUserApproved(currentUser) && (
          <>
            {/* Desktop: Sleek icon button */}
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="hidden md:inline-flex items-center justify-center gap-2 rounded-full border border-[#F25129] bg-white px-5 py-2 text-base font-semibold text-[#F25129] shadow hover:bg-[#F25129] hover:text-white hover:shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#F25129]"
              title="Create a new post"
            >
              <Plus className="h-5 w-5" />
              <span className="hidden sm:inline">Create Post</span>
            </button>
            {/* Mobile: Floating action button */}
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="fixed bottom-6 right-6 z-40 md:hidden flex items-center justify-center rounded-full bg-gradient-to-r from-[#F25129] to-[#FFC107] p-4 shadow-lg hover:scale-110 transition-transform duration-200 focus:outline-none focus:ring-2 focus:ring-[#F25129]"
              title="Create a new post"
              style={{ boxShadow: '0 4px 24px 0 rgba(242,81,41,0.18)' }}
            >
              <Plus className="h-7 w-7 text-white" />
            </button>
          </>
        )}
      </div>

      {/* Floating Action Button for Create Post */}
      {/* Keep Create Post accessible even when posts exist */}

      {/* Posts Feed with animation and search filter */}
      <div className="space-y-6 animate-fade-in" key={refreshKey}>
        {sortedPosts.map((post: any) => (
          <PostCard key={post.id} post={post} onPostDeleted={handlePostDeleted} />
        ))}
      </div>

      {/* Empty State with illustration and call-to-action */}
      {!loading && posts.length === 0 && (
        <div className="text-center py-16 animate-fade-in">
          <MessageCircle className="w-16 h-16 text-gray-300 mx-auto mb-4 animate-bounce" />
          <h3 className="text-xl font-medium text-gray-500 mb-2">
            No posts yet
          </h3>
          <p className="text-gray-400 mb-6">
            Be the first to share your fitness journey with the community!
          </p>
          {currentUser && isUserApproved(currentUser) && (
            <div className="flex justify-center mt-6">
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white rounded-full shadow-lg px-8 py-4 font-bold text-xl flex items-center gap-3 hover:scale-105 transition-transform animate-bounce"
                title="Create a new post"
              >
                <MessageCircle className="w-7 h-7" /> Create Post
              </button>
            </div>
          )}
        </div>
      )}

      {/* Create Post Modal */}
      {isCreateModalOpen && (
        <CreatePostModal
          onClose={() => setIsCreateModalOpen(false)}
          onPostCreated={() => {
            // Reset UI so the newly created post is visible immediately
            setIsCreateModalOpen(false);
            setSearch('');
            setSortBy('newest');
            try {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            } catch {
              window.scrollTo(0, 0);
            }
          }}
        />
      )}
    </div>
  );
};

export default Posts;