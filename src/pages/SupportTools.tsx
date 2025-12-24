import { orderBy, where } from 'firebase/firestore';
import { Lock, Plus, Search } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CategorySeo } from '../components/supportTools/CategorySeo';
import CreateSupportToolModal from '../components/supportTools/CreateSupportToolModal';
import SupportToolCard from '../components/supportTools/SupportToolCard';
import { useAuth } from '../contexts/AuthContext';
import { useFirestore } from '../hooks/useFirestore';
import { SupportTool, SupportToolCategory } from '../types/supportTools';
import { isUserApproved } from '../utils/userUtils';

const SupportTools: React.FC = () => {
  const { categorySlug } = useParams<{ categorySlug?: string }>();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { useRealtimeCollection } = useFirestore();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  // Load categories
  const { data: categories } = useRealtimeCollection(
    'supportToolCategories',
    [where('isActive', '==', true), orderBy('order', 'asc')]
  ) as { data: SupportToolCategory[] };

  // Find selected category
  const selectedCategory = useMemo(() => {
    if (!categorySlug || !categories) return null;
    return categories.find(cat => cat.slug === categorySlug) || null;
  }, [categorySlug, categories]);

  // Filter categories user can access
  const accessibleCategories = useMemo(() => {
    if (!categories) return [];
    // If user is approved member, can see all active categories
    if (currentUser && isUserApproved(currentUser)) {
      return categories;
    }
    // If external/pending user, only show public categories
    return categories.filter(cat => cat.allowPublicRead);
  }, [categories, currentUser]);

  // Build query constraints
  const queryConstraints = useMemo(() => {
    const constraints: any[] = [
      where('moderationStatus', '==', 'approved'),
      where('isDeleted', '==', false),
      orderBy('createdAt', 'desc'),
    ];

    if (selectedCategory) {
      constraints.unshift(where('categoryId', '==', selectedCategory.id));
    }

    return constraints;
  }, [selectedCategory]);

  // Load support tools
  const { data: supportTools, loading } = useRealtimeCollection(
    'supportTools',
    queryConstraints
  ) as { data: SupportTool[]; loading: boolean };

  // Filter tools by search query
  const filteredTools = useMemo(() => {
    if (!supportTools) return [];
    if (!searchQuery.trim()) return supportTools;

    const query = searchQuery.toLowerCase();
    return supportTools.filter(tool => 
      tool.title.toLowerCase().includes(query) ||
      tool.content.toLowerCase().includes(query) ||
      tool.tags?.some(tag => tag.toLowerCase().includes(query)) ||
      tool.categoryName.toLowerCase().includes(query)
    );
  }, [supportTools, searchQuery]);

  // Check if user can access selected category
  const canAccessCategory = useMemo(() => {
    if (!selectedCategory) return true; // All categories view
    if (currentUser && isUserApproved(currentUser)) return true; // Approved members can access all
    return selectedCategory.allowPublicRead; // External users can only access public categories
  }, [selectedCategory, currentUser]);

  // Handle invalid category slug
  useEffect(() => {
    if (categorySlug && categories && categories.length > 0) {
      const found = categories.find(cat => cat.slug === categorySlug);
      if (!found) {
        navigate('/support-tools', { replace: true });
        toast.error('Category not found');
      }
    }
  }, [categorySlug, categories, navigate]);

  const handleCategoryClick = (slug: string) => {
    navigate(`/support-tools/${slug}`);
  };

  const handleToolDeleted = () => {
    setRefreshKey(prev => prev + 1);
  };

  const canPost = currentUser && isUserApproved(currentUser);

  return (
    <>
      <CategorySeo category={selectedCategory} />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-[#F25129] to-[#FFC107] bg-clip-text text-transparent leading-relaxed pb-1 mb-6">
            {selectedCategory ? selectedCategory.name : 'Support Tools'}
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-6">
            {selectedCategory?.description || 
             'Discover healthy recipes, exercises, and wellness tips from our community of moms'}
          </p>
          
          {canPost && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center px-6 py-3 font-semibold rounded-full transition-all duration-300 transform shadow-lg mx-auto bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white hover:from-[#E0451F] hover:to-[#E55A2A] hover:scale-105"
            >
              <Plus className="w-5 h-5 mr-2" />
              Share Tool
            </button>
          )}
        </div>

        {/* Category Tabs */}
        {accessibleCategories.length > 0 && (
          <div className="mb-8">
            <div className="flex flex-wrap gap-2 justify-center">
              <button
                onClick={() => navigate('/support-tools')}
                className={`px-4 py-2 rounded-full font-medium transition-colors ${
                  !selectedCategory
                    ? 'bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All
              </button>
              {accessibleCategories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => handleCategoryClick(cat.slug)}
                  className={`px-4 py-2 rounded-full font-medium transition-colors flex items-center gap-2 ${
                    selectedCategory?.id === cat.id
                      ? 'bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {cat.name}
                  {!cat.allowPublicRead && (
                    <Lock className="w-3 h-3" title="Members only" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Access Denied Message */}
        {selectedCategory && !canAccessCategory && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-8 text-center">
            <Lock className="w-8 h-8 text-yellow-600 mx-auto mb-2" />
            <h3 className="text-lg font-semibold text-yellow-900 mb-2">
              Members Only Category
            </h3>
            <p className="text-yellow-700 mb-4">
              This category is only available to approved members. Please sign in or wait for account approval.
            </p>
            {!currentUser && (
              <Link
                to="/login"
                className="inline-block px-4 py-2 bg-[#F25129] text-white rounded-lg hover:bg-[#E0451F] transition-colors"
              >
                Sign In
              </Link>
            )}
          </div>
        )}

        {/* Search Bar */}
        {canAccessCategory && (
          <div className="mb-8 max-w-md mx-auto">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search support tools..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
              />
            </div>
          </div>
        )}

        {/* Tools Feed */}
        {canAccessCategory && (
          <div className="space-y-6" key={refreshKey}>
            {loading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#F25129]"></div>
                <p className="mt-4 text-gray-600">Loading support tools...</p>
              </div>
            ) : filteredTools.length > 0 ? (
              filteredTools.map((tool) => (
                <SupportToolCard key={tool.id} tool={tool} onToolDeleted={handleToolDeleted} />
              ))
            ) : (
              <div className="text-center py-16">
                <p className="text-xl font-medium text-gray-500 mb-2">
                  {searchQuery ? 'No tools found matching your search' : 'No tools yet'}
                </p>
                <p className="text-gray-400 mb-6">
                  {searchQuery 
                    ? 'Try a different search term'
                    : 'Be the first to share your favorite recipes, exercises, or tips!'}
                </p>
                {canPost && !searchQuery && (
                  <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="px-6 py-3 font-semibold rounded-full transition-all duration-300 transform bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white hover:from-[#E0451F] hover:to-[#E55A2A] hover:scale-105"
                  >
                    Create First Tool
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Create Tool Modal */}
        {isCreateModalOpen && (
          <CreateSupportToolModal
            onClose={() => setIsCreateModalOpen(false)}
            onToolCreated={() => {
              setIsCreateModalOpen(false);
              setRefreshKey(prev => prev + 1);
            }}
          />
        )}
      </div>
    </>
  );
};

export default SupportTools;






