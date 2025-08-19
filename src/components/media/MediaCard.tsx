import React, { useState } from 'react';
import { Heart, MessageCircle, Tag, Play } from 'lucide-react';
import { format } from 'date-fns';
import { MediaFile } from '../../types';
import { useAuth } from '../../contexts/AuthContext';

interface MediaCardProps {
  media: MediaFile;
}

const MediaCard: React.FC<MediaCardProps> = ({ media }) => {
  const { currentUser } = useAuth();
  const [isLiked, setIsLiked] = useState(
    currentUser ? media.likes.includes(currentUser.id) : false
  );
  const [showComments, setShowComments] = useState(false);

  const handleLike = () => {
    if (!currentUser) return;
    setIsLiked(!isLiked);
    // Here you would update the database
  };

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden border border-purple-100 group">
      {/* Media Content */}
      <div className="relative aspect-square overflow-hidden">
        {media.type === 'video' ? (
          <div className="relative">
            <img
              src={media.thumbnailUrl || media.url}
              alt={media.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
            <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
              <div className="w-16 h-16 bg-white/90 rounded-full flex items-center justify-center">
                <Play className="w-8 h-8 text-purple-600 ml-1" />
              </div>
            </div>
          </div>
        ) : (
          <img
            src={media.url}
            alt={media.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        )}

        {/* Event Tag */}
        {media.eventTitle && (
          <div className="absolute top-3 left-3">
            <div className="flex items-center px-3 py-1 bg-white/90 backdrop-blur-sm rounded-full text-sm font-medium text-purple-600 border border-purple-200">
              <Tag className="w-3 h-3 mr-1" />
              {media.eventTitle}
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">
          {media.title}
        </h3>
        
        {media.description && (
          <p className="text-gray-600 text-sm mb-3 line-clamp-2">
            {media.description}
          </p>
        )}

        {/* Meta Info */}
        <div className="flex items-center justify-between text-sm text-gray-500 mb-3">
          <span>By {media.uploaderName}</span>
          <span>{format(media.createdAt, 'MMM d, yyyy')}</span>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={handleLike}
              className={`flex items-center space-x-1 transition-colors ${
                isLiked ? 'text-red-500' : 'text-gray-500 hover:text-red-500'
              }`}
            >
              <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
              <span className="text-sm">{media.likes.length}</span>
            </button>
            
            <button
              onClick={() => setShowComments(!showComments)}
              className="flex items-center space-x-1 text-gray-500 hover:text-purple-600 transition-colors"
            >
              <MessageCircle className="w-5 h-5" />
              <span className="text-sm">{media.comments.length}</span>
            </button>
          </div>
        </div>

        {/* Comments Section */}
        {showComments && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="space-y-3">
              {media.comments.map((comment) => (
                <div key={comment.id} className="text-sm">
                  <span className="font-medium text-gray-900">{comment.authorName}</span>
                  <span className="text-gray-600 ml-2">{comment.content}</span>
                </div>
              ))}
              
              {currentUser && (
                <div className="mt-3">
                  <input
                    type="text"
                    placeholder="Add a comment..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MediaCard;