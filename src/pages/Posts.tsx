import React, { useState, useEffect } from 'react';
import { MessageCircle } from 'lucide-react';
import { orderBy } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useFirestore } from '../hooks/useFirestore';
import { Post } from '../types';
import PostCard from '../components/posts/PostCard';
import CreatePostModal from '../components/posts/CreatePostModal';
import { isUserApproved } from '../utils/userUtils';
import toast from 'react-hot-toast';

const Posts: React.FC = () => {
  const { currentUser } = useAuth();
  const { useRealtimeCollection } = useFirestore();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Get posts from Firestore in real-time
  const { data: posts, loading } = useRealtimeCollection('posts', [orderBy('createdAt', 'desc')]);

  // Handle post deletion - refresh the posts list
  const handlePostDeleted = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-[#F25129] to-[#FFC107] bg-clip-text text-transparent leading-relaxed pb-1 mb-6">
          MFM Stories
        </h1>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-6">
          Share your journey and connect with fellow moms
        </p>
        
        {/* Only show button for approved users - hide for non-approved to keep consistent with Media page */}
        {currentUser && isUserApproved(currentUser) && (
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center px-6 py-3 font-semibold rounded-full transition-all duration-300 transform shadow-lg mx-auto bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white hover:from-[#E0451F] hover:to-[#E55A2A] hover:scale-105"
          >
            Share your Stories
          </button>
        )}
      </div>

      {/* Posts Feed */}
      <div className="space-y-6" key={refreshKey}>
        {posts.map((post) => (
          <PostCard key={post.id} post={post} onPostDeleted={handlePostDeleted} />
        ))}
      </div>

      {/* Empty State */}
      {posts.length === 0 && (
        <div className="text-center py-16">
          <MessageCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-medium text-gray-500 mb-2">
            No posts yet
          </h3>
          <p className="text-gray-400 mb-6">
            Be the first to share your fitness journey with the community!
          </p>
          {/* Only show button for approved users - hide for non-approved to keep consistent */}
          {currentUser && isUserApproved(currentUser) && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-6 py-3 font-semibold rounded-full transition-all duration-300 transform bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white hover:from-[#E0451F] hover:to-[#E55A2A] hover:scale-105"
            >
              Create First Post
            </button>
          )}
        </div>
      )}

      {/* Create Post Modal */}
      {isCreateModalOpen && (
        <CreatePostModal
          onClose={() => setIsCreateModalOpen(false)}
          onPostCreated={(newPost) => {
            setIsCreateModalOpen(false);
          }}
        />
      )}
    </div>
  );
};

export default Posts;