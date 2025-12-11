import React, { useState, useEffect } from 'react';
import { collection, doc, getDocs, addDoc, updateDoc, deleteDoc, onSnapshot, orderBy, serverTimestamp, query } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { Plus, Edit2, Trash2, Save, X, Eye, EyeOff, ArrowUp, ArrowDown, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { SupportToolCategory } from '../../types/supportTools';
import { generateSlug } from '../../services/supportToolService';

export const SupportToolCategoriesPanel: React.FC = () => {
  const { currentUser } = useAuth();
  const [categories, setCategories] = useState<SupportToolCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<SupportToolCategory>>({
    name: '',
    slug: '',
    description: '',
    seoDescription: '',
    seoKeywords: [],
    icon: '',
    color: '#F25129',
    order: 0,
    isActive: true,
    allowPublicRead: true,
  });

  // Load categories
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'admin') return;

    const categoriesQuery = query(
      collection(db, 'supportToolCategories'),
      orderBy('order', 'asc')
    );

    const unsubscribe = onSnapshot(
      categoriesQuery,
      (snapshot) => {
        const cats = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate?.() ?? new Date(),
          updatedAt: doc.data().updatedAt?.toDate?.() ?? new Date(),
        })) as SupportToolCategory[];
        setCategories(cats);
        setLoading(false);
      },
      (error) => {
        console.error('Error loading categories:', error);
        setLoading(false);
        toast.error('Failed to load categories');
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  const resetForm = () => {
    setFormData({
      name: '',
      slug: '',
      description: '',
      seoDescription: '',
      seoKeywords: [],
      icon: '',
      color: '#F25129',
      order: categories.length,
      isActive: true,
      allowPublicRead: true,
    });
    setEditingId(null);
    setIsCreating(false);
  };

  const handleCreate = async () => {
    if (!currentUser) return;
    if (!formData.name?.trim()) {
      toast.error('Category name is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const slug = formData.slug?.trim() || generateSlug(formData.name);
      
      const categoryData = {
        name: formData.name.trim(),
        slug: slug.trim(),
        description: formData.description?.trim() || '',
        seoDescription: formData.seoDescription?.trim() || '',
        seoKeywords: formData.seoKeywords || [],
        icon: formData.icon?.trim() || '',
        color: formData.color || '#F25129',
        order: formData.order ?? categories.length,
        isActive: formData.isActive ?? true,
        allowPublicRead: formData.allowPublicRead ?? true,
        seoTitle: formData.seoTitle?.trim() || '',
        seoImage: formData.seoImage?.trim() || '',
        fields: formData.fields || {},
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: currentUser.id,
      };

      await addDoc(collection(db, 'supportToolCategories'), categoryData);
      toast.success('Category created successfully');
      resetForm();
    } catch (error: any) {
      console.error('Error creating category:', error);
      toast.error(error?.message || 'Failed to create category');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (categoryId: string) => {
    if (!currentUser) return;
    if (!formData.name?.trim()) {
      toast.error('Category name is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const categoryRef = doc(db, 'supportToolCategories', categoryId);
      const slug = formData.slug?.trim() || generateSlug(formData.name);
      
      await updateDoc(categoryRef, {
        name: formData.name.trim(),
        slug: slug.trim(),
        description: formData.description?.trim() || '',
        seoDescription: formData.seoDescription?.trim() || '',
        seoKeywords: formData.seoKeywords || [],
        icon: formData.icon?.trim() || '',
        color: formData.color || '#F25129',
        order: formData.order ?? 0,
        isActive: formData.isActive ?? true,
        allowPublicRead: formData.allowPublicRead ?? true,
        seoTitle: formData.seoTitle?.trim() || '',
        seoImage: formData.seoImage?.trim() || '',
        fields: formData.fields || {},
        updatedAt: serverTimestamp(),
      });

      toast.success('Category updated successfully');
      resetForm();
    } catch (error: any) {
      console.error('Error updating category:', error);
      toast.error(error?.message || 'Failed to update category');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (categoryId: string) => {
    if (!window.confirm('Are you sure you want to delete this category? This action cannot be undone.')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'supportToolCategories', categoryId));
      toast.success('Category deleted successfully');
    } catch (error: any) {
      console.error('Error deleting category:', error);
      toast.error(error?.message || 'Failed to delete category');
    }
  };

  const handleEdit = (category: SupportToolCategory) => {
    setFormData({
      name: category.name,
      slug: category.slug,
      description: category.description || '',
      seoDescription: category.seoDescription || '',
      seoKeywords: category.seoKeywords || [],
      icon: category.icon || '',
      color: category.color || '#F25129',
      order: category.order,
      isActive: category.isActive,
      allowPublicRead: category.allowPublicRead,
      seoTitle: category.seoTitle || '',
      seoImage: category.seoImage || '',
      fields: category.fields || {},
    });
    setEditingId(category.id);
    setIsCreating(false);
  };

  const handleMoveOrder = async (categoryId: string, direction: 'up' | 'down') => {
    const category = categories.find(c => c.id === categoryId);
    if (!category) return;

    const currentIndex = categories.findIndex(c => c.id === categoryId);
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    if (newIndex < 0 || newIndex >= categories.length) return;

    const targetCategory = categories[newIndex];
    
    try {
      // Swap orders
      await updateDoc(doc(db, 'supportToolCategories', categoryId), {
        order: targetCategory.order,
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'supportToolCategories', targetCategory.id), {
        order: category.order,
        updatedAt: serverTimestamp(),
      });
      toast.success('Order updated');
    } catch (error: any) {
      console.error('Error updating order:', error);
      toast.error('Failed to update order');
    }
  };

  const handleTogglePublicAccess = async (categoryId: string, currentValue: boolean) => {
    try {
      await updateDoc(doc(db, 'supportToolCategories', categoryId), {
        allowPublicRead: !currentValue,
        updatedAt: serverTimestamp(),
      });
      toast.success(
        !currentValue 
          ? 'Category is now publicly accessible' 
          : 'Category is now members-only'
      );
    } catch (error: any) {
      console.error('Error toggling public access:', error);
      toast.error('Failed to update access setting');
    }
  };

  if (!currentUser || currentUser.role !== 'admin') {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-600">
        Admin access required to manage support tool categories.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Support Tool Categories</h2>
          <p className="text-sm text-gray-600 mt-1">
            Manage categories for support tools. Categories control access and organization.
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setIsCreating(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#F25129] text-white rounded-full font-semibold hover:bg-[#E0451F] transition"
        >
          <Plus className="w-4 h-4" />
          Add Category
        </button>
      </div>

      {/* Create/Edit Form */}
      {(isCreating || editingId) && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              {editingId ? 'Edit Category' : 'Create New Category'}
            </h3>
            <button
              onClick={resetForm}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => {
                  setFormData({ ...formData, name: e.target.value });
                  if (!formData.slug) {
                    setFormData({ ...formData, name: e.target.value, slug: generateSlug(e.target.value) });
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                placeholder="e.g., Healthy Recipes"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Slug
              </label>
              <input
                type="text"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                placeholder="auto-generated from name"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                placeholder="Brief description of this category"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Icon (Emoji)
              </label>
              <input
                type="text"
                value={formData.icon}
                onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                placeholder="🍎"
                maxLength={2}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Color
              </label>
              <input
                type="color"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                className="w-full h-10 border border-gray-300 rounded-lg cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Display Order
              </label>
              <input
                type="number"
                value={formData.order}
                onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
              />
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-4 h-4 text-[#F25129] rounded focus:ring-[#F25129]"
                />
                <span className="text-sm font-medium text-gray-700">Active</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.allowPublicRead}
                  onChange={(e) => setFormData({ ...formData, allowPublicRead: e.target.checked })}
                  className="w-4 h-4 text-[#F25129] rounded focus:ring-[#F25129]"
                />
                <span className="text-sm font-medium text-gray-700">Public Access</span>
              </label>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => editingId ? handleUpdate(editingId) : handleCreate()}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#F25129] text-white rounded-lg font-semibold hover:bg-[#E0451F] transition disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {editingId ? 'Updating...' : 'Creating...'}
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  {editingId ? 'Update' : 'Create'}
                </>
              )}
            </button>
            <button
              onClick={resetForm}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Categories List */}
      {loading ? (
        <div className="text-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-[#F25129] mx-auto" />
          <p className="mt-4 text-gray-600">Loading categories...</p>
        </div>
      ) : categories.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#F25129]/30 bg-white/80 p-12 text-center">
          <p className="text-gray-600 mb-4">No categories yet. Create your first category to get started!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {categories.map((category, index) => (
            <div
              key={category.id}
              className={`rounded-xl border ${
                category.isActive ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-75'
              } p-4 shadow-sm`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4 flex-1">
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => handleMoveOrder(category.id, 'up')}
                      disabled={index === 0}
                      className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleMoveOrder(category.id, 'down')}
                      disabled={index === categories.length - 1}
                      className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {category.icon && <span className="text-2xl">{category.icon}</span>}
                      <h3 className="text-lg font-semibold text-gray-900">{category.name}</h3>
                      {!category.isActive && (
                        <span className="px-2 py-1 text-xs font-semibold bg-gray-200 text-gray-600 rounded-full">
                          Inactive
                        </span>
                      )}
                      {category.allowPublicRead ? (
                        <span className="px-2 py-1 text-xs font-semibold bg-green-100 text-green-700 rounded-full flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          Public
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-semibold bg-amber-100 text-amber-700 rounded-full flex items-center gap-1">
                          <EyeOff className="w-3 h-3" />
                          Members Only
                        </span>
                      )}
                    </div>
                    {category.description && (
                      <p className="text-sm text-gray-600 mb-2">{category.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>Slug: <code className="bg-gray-100 px-1 rounded">{category.slug}</code></span>
                      <span>Order: {category.order}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleTogglePublicAccess(category.id, category.allowPublicRead)}
                    className="p-2 text-gray-600 hover:text-[#F25129] hover:bg-[#F25129]/10 rounded-lg transition"
                    title={category.allowPublicRead ? 'Make members-only' : 'Make public'}
                  >
                    {category.allowPublicRead ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => handleEdit(category)}
                    className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                    title="Edit category"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(category.id)}
                    className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                    title="Delete category"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

