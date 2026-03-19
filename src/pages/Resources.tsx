import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { orderBy } from 'firebase/firestore';
import { Lock, Plus, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { useFirestore } from '../hooks/useFirestore';
import type { ResourceCategory, ResourceEntry } from '../types/resources';
import ResourceCard from '../components/resources/ResourceCard';
import ResourceFormModal from '../components/resources/ResourceFormModal';
import { softDeleteResourceEntry } from '../services/resourceService';

const Resources: React.FC = () => {
  const { categorySlug, subcategorySlug } = useParams<{ categorySlug?: string; subcategorySlug?: string }>();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { useRealtimeCollection } = useFirestore();

  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ResourceEntry | null>(null);

  const { data: categories } = useRealtimeCollection('resourceCategories', [orderBy('order', 'asc')]) as { data: ResourceCategory[] };
  const { data: entries, loading } = useRealtimeCollection('resources', [orderBy('createdAt', 'desc')]) as {
    data: ResourceEntry[];
    loading: boolean;
  };

  const activeCategories = useMemo(
    () => (categories || []).filter(cat => cat.isActive),
    [categories]
  );

  const topCategories = useMemo(
    () => activeCategories.filter(cat => !cat.parentId),
    [activeCategories]
  );

  const categoryById = useMemo(() => {
    const map = new Map<string, ResourceCategory>();
    activeCategories.forEach(cat => map.set(cat.id, cat));
    return map;
  }, [activeCategories]);

  const selectedCategory = useMemo(() => {
    if (!categorySlug) return null;
    return activeCategories.find(cat => cat.slug === categorySlug && !cat.parentId) || null;
  }, [activeCategories, categorySlug]);

  const subcategories = useMemo(() => {
    if (!selectedCategory) return [];
    return activeCategories.filter(cat => cat.parentId === selectedCategory.id);
  }, [activeCategories, selectedCategory]);

  const selectedSubcategory = useMemo(() => {
    if (!selectedCategory || !subcategorySlug) return null;
    return subcategories.find(cat => cat.slug === subcategorySlug) || null;
  }, [selectedCategory, subcategories, subcategorySlug]);

  const accessibleTopCategories = useMemo(() => {
    if (currentUser) return topCategories;
    return topCategories.filter(cat => cat.allowPublicRead);
  }, [topCategories, currentUser]);

  const canAccessSelected = useMemo(() => {
    if (!selectedCategory) return true;
    if (selectedCategory.allowPublicRead) return true;
    return !!currentUser;
  }, [selectedCategory, currentUser]);

  useEffect(() => {
    if (!categorySlug) return;
    if (activeCategories.length === 0) return;
    if (!selectedCategory) {
      navigate('/resources', { replace: true });
      toast.error('Resource category not found');
    }
  }, [categorySlug, activeCategories.length, selectedCategory, navigate]);

  useEffect(() => {
    if (!subcategorySlug) return;
    if (selectedCategory && !selectedSubcategory) {
      navigate(`/resources/${selectedCategory.slug}`, { replace: true });
      toast.error('Resource subcategory not found');
    }
  }, [subcategorySlug, selectedCategory, selectedSubcategory, navigate]);

  const filteredEntries = useMemo(() => {
    const list = (entries || []).filter(entry => {
      if (entry.isDeleted) return false;
      if (entry.isPublic === false && !currentUser) return false;
      if (selectedCategory && entry.categoryId !== selectedCategory.id) return false;
      if (selectedSubcategory && entry.subcategoryId !== selectedSubcategory.id) return false;
      return true;
    });

    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(entry =>
      entry.title.toLowerCase().includes(q) ||
      entry.description.toLowerCase().includes(q) ||
      entry.categoryName.toLowerCase().includes(q) ||
      entry.subcategoryName?.toLowerCase().includes(q) ||
      entry.location?.toLowerCase().includes(q) ||
      entry.tags?.some(tag => tag.toLowerCase().includes(q))
    );
  }, [entries, currentUser, selectedCategory, selectedSubcategory, searchQuery]);

  const canPost = !!currentUser;

  const handleEdit = (entry: ResourceEntry) => {
    setEditingEntry(entry);
    setIsModalOpen(true);
  };

  const handleDelete = async (entry: ResourceEntry) => {
    if (!currentUser) return;
    const confirmed = window.confirm(`Delete "${entry.title}"? This can be restored by an admin.`);
    if (!confirmed) return;
    try {
      await softDeleteResourceEntry(entry.id, currentUser.id);
      toast.success('Resource deleted.');
    } catch (error: any) {
      console.error('Failed to delete resource', error);
      toast.error(error?.message || 'Failed to delete resource');
    }
  };

  const canEditEntry = (entry: ResourceEntry) => {
    if (!currentUser) return false;
    return currentUser.role === 'admin' || entry.contributorId === currentUser.id;
  };

  const openCreateModal = () => {
    setEditingEntry(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingEntry(null);
  };

  const breadcrumbs = [
    { label: 'Resources', href: '/resources' },
    ...(selectedCategory ? [{ label: selectedCategory.name, href: `/resources/${selectedCategory.slug}` }] : []),
    ...(selectedSubcategory && selectedCategory
      ? [{ label: selectedSubcategory.name, href: `/resources/${selectedCategory.slug}/${selectedSubcategory.slug}` }]
      : []),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-[#F25129] to-[#FFC107] bg-clip-text text-transparent">
            Resources
          </h1>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto mt-4">
            A community-driven hub for recipes, recommendations, and class schedules shared by Moms Fitness Mojo members.
          </p>
          {canPost && (
            <button
              onClick={openCreateModal}
              className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white font-semibold shadow hover:from-[#E0451F] hover:to-[#E55A2A] transition"
            >
              <Plus className="w-5 h-5" />
              Add Resource
            </button>
          )}
          {!canPost && (
            <div className="mt-5 text-sm text-gray-600">
              <Link to="/login" className="text-[#F25129] font-semibold hover:underline">
                Sign in
              </Link>{' '}
              to add recommendations or recipes.
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-center gap-2 text-sm">
          {breadcrumbs.map((crumb, index) => (
            <span key={crumb.href} className="flex items-center gap-2">
              {index !== 0 && <span className="text-gray-400">/</span>}
              <Link to={crumb.href} className="text-gray-600 hover:text-[#F25129]">
                {crumb.label}
              </Link>
            </span>
          ))}
        </div>

        {accessibleTopCategories.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-center">
            <button
              onClick={() => navigate('/resources')}
              className={`px-4 py-2 rounded-full font-medium transition-colors ${
                !selectedCategory
                  ? 'bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All
            </button>
            {accessibleTopCategories.map(cat => (
              <button
                key={cat.id}
                onClick={() => navigate(`/resources/${cat.slug}`)}
                className={`px-4 py-2 rounded-full font-medium transition-colors ${
                  selectedCategory?.id === cat.id
                    ? 'bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}

        {selectedCategory && subcategories.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-center">
            <button
              onClick={() => navigate(`/resources/${selectedCategory.slug}`)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                !selectedSubcategory
                  ? 'bg-[#F25129] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              All {selectedCategory.name}
            </button>
            {subcategories.map(sub => (
              <button
                key={sub.id}
                onClick={() => navigate(`/resources/${selectedCategory.slug}/${sub.slug}`)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  selectedSubcategory?.id === sub.id
                    ? 'bg-[#F25129] text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {sub.name}
              </button>
            ))}
          </div>
        )}

        {selectedCategory && !canAccessSelected && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
            <Lock className="w-8 h-8 text-yellow-600 mx-auto mb-2" />
            <h3 className="text-lg font-semibold text-yellow-900 mb-2">Members Only</h3>
            <p className="text-yellow-700">
              This category is available to signed-in members. Please log in to view these resources.
            </p>
          </div>
        )}

        <div className="max-w-md mx-auto w-full">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search resources..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
            />
          </div>
        </div>

        {canAccessSelected && (
          <div className="space-y-5">
            {loading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#F25129]"></div>
                <p className="mt-4 text-gray-600">Loading resources...</p>
              </div>
            ) : filteredEntries.length > 0 ? (
              filteredEntries.map(entry => (
                <ResourceCard
                  key={entry.id}
                  entry={entry}
                  canEdit={canEditEntry(entry)}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  categoryColor={categoryById.get(entry.categoryId)?.color}
                  categoryIcon={categoryById.get(entry.categoryId)?.icon}
                  subcategoryColor={entry.subcategoryId ? categoryById.get(entry.subcategoryId)?.color : undefined}
                />
              ))
            ) : (
              <div className="text-center py-16 border border-dashed border-gray-200 rounded-2xl bg-gray-50">
                <p className="text-lg font-medium text-gray-600">No resources yet</p>
                <p className="text-sm text-gray-500 mt-2">
                  {searchQuery ? 'Try a different search term.' : 'Be the first to share a helpful resource.'}
                </p>
                {canPost && !searchQuery && (
                  <button
                    onClick={openCreateModal}
                    className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#F25129] text-white font-semibold hover:bg-[#E0451F] transition"
                  >
                    <Plus className="w-4 h-4" />
                    Add First Resource
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {isModalOpen && (
        <ResourceFormModal
          categories={activeCategories}
          entry={editingEntry}
          onClose={closeModal}
          onSaved={closeModal}
        />
      )}
    </div>
  );
};

export default Resources;
