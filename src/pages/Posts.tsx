import React, { useState, useEffect } from 'react';
import { Plus, MessageCircle } from 'lucide-react';
import { orderBy } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useFirestore } from '../hooks/useFirestore';
import { Post } from '../types';
import PostCard from '../components/posts/PostCard';
import CreatePostModal from '../components/posts/CreatePostModal';

const Posts: React.FC = () => {
  const { currentUser } = useAuth();
  const { useRealtimeCollection } = useFirestore();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Get posts from Firestore in real-time
  const { data: posts, loading } = useRealtimeCollection('posts', [orderBy('createdAt', 'desc')]);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-[#F25129] to-[#FF6B35] bg-clip-text text-transparent mb-2 leading-relaxed pb-1">
            Community Posts
          </h1>
          <p className="text-gray-600 text-lg">
            Share your journey and connect with fellow moms
          </p>
        </div>
        
        {currentUser && (
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="mt-4 md:mt-0 flex items-center px-6 py-3 bg-gradient-to-r from-[#F25129] to-[#FF6B35] text-white font-semibold rounded-full hover:from-[#E0451F] hover:to-[#E55A2A] transition-all duration-300 transform hover:scale-105 shadow-lg"
          >
            <Plus className="w-5 h-5 mr-2" />
            Share Post
          </button>
        )}
      </div>

      {/* Posts Feed */}
      <div className="space-y-6">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
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
          {currentUser && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-6 py-3 bg-gradient-to-r from-[#F25129] to-[#FF6B35] text-white font-semibold rounded-full hover:from-[#E0451F] hover:to-[#E55A2A] transition-all duration-300 transform hover:scale-105"
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