import React, { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, deleteDoc } from 'firebase/firestore';
import { ArrowDown, ArrowUp, Eye, EyeOff, Edit2, Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { db } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import type { ResourceCategory } from '../../types/resources';
import { generateSlug } from '../../services/resourceService';

const defaultForm: Partial<ResourceCategory> = {
  name: '',
  slug: '',
  description: '',
  icon: '',
  color: '#F25129',
  order: 0,
  isActive: true,
  allowPublicRead: true,
  parentId: null,
};

export const ResourceCategoriesPanel: React.FC = () => {
  const { currentUser } = useAuth();
  const [categories, setCategories] = useState<ResourceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<Partial<ResourceCategory>>(defaultForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!currentUser || currentUser.role !== 'admin') return;

    const q = query(collection(db, 'resourceCategories'), orderBy('order', 'asc'));
    const unsub = onSnapshot(
      q,
      snapshot => {
        const list = snapshot.docs.map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data(),
          createdAt: docSnap.data().createdAt?.toDate?.() ?? new Date(),
          updatedAt: docSnap.data().updatedAt?.toDate?.() ?? new Date(),
        })) as ResourceCategory[];
        setCategories(list);
        setLoading(false);
      },
      err => {
        console.error('Failed to load resource categories', err);
        toast.error('Failed to load resource categories');
        setLoading(false);
      }
    );

    return () => unsub();
  }, [currentUser]);

  const topCategories = useMemo(
    () => categories.filter(cat => !cat.parentId),
    [categories]
  );

  const resetForm = () => {
    setFormData({ ...defaultForm, order: categories.length });
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
      const parent = formData.parentId ? categories.find(cat => cat.id === formData.parentId) : null;

      await addDoc(collection(db, 'resourceCategories'), {
        name: formData.name.trim(),
        slug,
        description: formData.description?.trim() || '',
        icon: formData.icon?.trim() || '',
        color: formData.color || '#F25129',
        order: formData.order ?? categories.length,
        isActive: formData.isActive ?? true,
        allowPublicRead: formData.allowPublicRead ?? true,
        parentId: parent ? parent.id : null,
        parentSlug: parent ? parent.slug : null,
        parentName: parent ? parent.name : null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: currentUser.id,
      });

      toast.success('Category created');
      resetForm();
    } catch (error: any) {
      console.error('Failed to create category', error);
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
      const slug = formData.slug?.trim() || generateSlug(formData.name);
      const parent = formData.parentId ? categories.find(cat => cat.id === formData.parentId) : null;

      await updateDoc(doc(db, 'resourceCategories', categoryId), {
        name: formData.name.trim(),
        slug,
        description: formData.description?.trim() || '',
        icon: formData.icon?.trim() || '',
        color: formData.color || '#F25129',
        order: formData.order ?? 0,
        isActive: formData.isActive ?? true,
        allowPublicRead: formData.allowPublicRead ?? true,
        parentId: parent ? parent.id : null,
        parentSlug: parent ? parent.slug : null,
        parentName: parent ? parent.name : null,
        updatedAt: serverTimestamp(),
      });

      toast.success('Category updated');
      resetForm();
    } catch (error: any) {
      console.error('Failed to update category', error);
      toast.error(error?.message || 'Failed to update category');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (categoryId: string) => {
    if (!window.confirm('Delete this category? This cannot be undone.')) return;
    try {
      await deleteDoc(doc(db, 'resourceCategories', categoryId));
      toast.success('Category deleted');
    } catch (error: any) {
      console.error('Failed to delete category', error);
      toast.error(error?.message || 'Failed to delete category');
    }
  };

  const handleEdit = (category: ResourceCategory) => {
    setFormData({
      name: category.name,
      slug: category.slug,
      description: category.description || '',
      icon: category.icon || '',
      color: category.color || '#F25129',
      order: category.order,
      isActive: category.isActive,
      allowPublicRead: category.allowPublicRead,
      parentId: category.parentId ?? null,
    });
    setEditingId(category.id);
    setIsCreating(false);
  };

  const handleMoveOrder = async (categoryId: string, direction: 'up' | 'down') => {
    const index = categories.findIndex(cat => cat.id === categoryId);
    if (index === -1) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= categories.length) return;

    const current = categories[index];
    const target = categories[targetIndex];

    try {
      await updateDoc(doc(db, 'resourceCategories', current.id), {
        order: target.order,
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'resourceCategories', target.id), {
        order: current.order,
        updatedAt: serverTimestamp(),
      });
      toast.success('Order updated');
    } catch (error: any) {
      console.error('Failed to update order', error);
      toast.error('Failed to update order');
    }
  };

  const handleTogglePublic = async (categoryId: string, currentValue: boolean) => {
    try {
      await updateDoc(doc(db, 'resourceCategories', categoryId), {
        allowPublicRead: !currentValue,
        updatedAt: serverTimestamp(),
      });
      toast.success(!currentValue ? 'Category is now public' : 'Category set to members-only');
    } catch (error: any) {
      console.error('Failed to update access', error);
      toast.error('Failed to update access');
    }
  };

  const seedDefaults = async () => {
    if (!currentUser) return;
    if (!window.confirm('Seed default resource categories?')) return;

    setIsSubmitting(true);
    try {
      const recipesId = await addDoc(collection(db, 'resourceCategories'), {
        name: 'Recipes',
        slug: 'recipes',
        description: 'Healthy, quick, and family-friendly meal ideas.',
        icon: '???',
        color: '#F25129',
        order: 0,
        isActive: true,
        allowPublicRead: true,
        parentId: null,
        parentSlug: null,
        parentName: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: currentUser.id,
      });

      const recommendationsId = await addDoc(collection(db, 'resourceCategories'), {
        name: 'Recommendations',
        slug: 'recommendations',
        description: 'Community-curated recommendations for moms.',
        icon: '?',
        color: '#FFC107',
        order: 1,
        isActive: true,
        allowPublicRead: true,
        parentId: null,
        parentSlug: null,
        parentName: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: currentUser.id,
      });

      await addDoc(collection(db, 'resourceCategories'), {
        name: 'Classes & Schedules',
        slug: 'classes-schedules',
        description: 'Classes moms attend regularly with schedules and notes.',
        icon: '???',
        color: '#F25129',
        order: 2,
        isActive: true,
        allowPublicRead: true,
        parentId: null,
        parentSlug: null,
        parentName: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: currentUser.id,
      });

      const recipesDocId = recipesId.id;
      const recommendationsDocId = recommendationsId.id;

      const recipeSubs = [
        'Healthy Recipes',
        'Quick Meal Ideas',
        'Snack Ideas',
        'Family-Friendly Meal Options',
      ];

      for (const [index, name] of recipeSubs.entries()) {
        await addDoc(collection(db, 'resourceCategories'), {
          name,
          slug: generateSlug(name),
          description: '',
          icon: '',
          color: '#F25129',
          order: index,
          isActive: true,
          allowPublicRead: true,
          parentId: recipesDocId,
          parentSlug: 'recipes',
          parentName: 'Recipes',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: currentUser.id,
        });
      }

      const recommendationSubs = [
        'Gyms / Fitness Centers',
        'Healthy Eating Places',
        'Trainers / Coaches',
        'Wellness Services',
        'Kids Activities / Family-Friendly Spots',
      ];

      for (const [index, name] of recommendationSubs.entries()) {
        await addDoc(collection(db, 'resourceCategories'), {
          name,
          slug: generateSlug(name),
          description: '',
          icon: '',
          color: '#FFC107',
          order: index,
          isActive: true,
          allowPublicRead: true,
          parentId: recommendationsDocId,
          parentSlug: 'recommendations',
          parentName: 'Recommendations',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: currentUser.id,
        });
      }

      toast.success('Default categories seeded');
    } catch (error: any) {
      console.error('Failed to seed categories', error);
      toast.error(error?.message || 'Failed to seed categories');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!currentUser || currentUser.role !== 'admin') {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-600">
        Admin access required to manage resource categories.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Resource Categories</h2>
          <p className="text-sm text-gray-600 mt-1">Manage the Resources navigation and subcategories.</p>
        </div>
        <div className="flex items-center gap-2">
          {categories.length === 0 && (
            <button
              onClick={seedDefaults}
              className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-full text-sm font-semibold text-gray-700 hover:bg-gray-100"
              disabled={isSubmitting}
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Seed Defaults
            </button>
          )}
          <button
            onClick={() => {
              resetForm();
              setIsCreating(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#F25129] text-white rounded-full font-semibold hover:bg-[#E0451F] transition"
          >
            <Plus className="w-4 h-4" /> Add Category
          </button>
        </div>
      </div>

      {(isCreating || editingId) && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">{editingId ? 'Edit Category' : 'Create Category'}</h3>
            <button onClick={resetForm} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value, slug: prev.slug || generateSlug(e.target.value) }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
              <input
                type="text"
                value={formData.slug}
                onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                rows={2}
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Parent Category</label>
              <select
                value={formData.parentId || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, parentId: e.target.value || null }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
              >
                <option value="">None (top-level)</option>
                {topCategories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Display Order</label>
              <input
                type="number"
                value={formData.order ?? 0}
                onChange={(e) => setFormData(prev => ({ ...prev, order: parseInt(e.target.value, 10) || 0 }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
              />
            </div>
            <div className="flex items-center gap-4 md:col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={formData.isActive ?? true}
                  onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                  className="w-4 h-4 text-[#F25129] rounded"
                />
                Active
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={formData.allowPublicRead ?? true}
                  onChange={(e) => setFormData(prev => ({ ...prev, allowPublicRead: e.target.checked }))}
                  className="w-4 h-4 text-[#F25129] rounded"
                />
                Public Access
              </label>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => editingId ? handleUpdate(editingId) : handleCreate()}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#F25129] text-white rounded-lg font-semibold hover:bg-[#E0451F] transition disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {editingId ? 'Update' : 'Create'}
            </button>
            <button
              onClick={resetForm}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-[#F25129] mx-auto" />
          <p className="mt-4 text-gray-600">Loading categories...</p>
        </div>
      ) : categories.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#F25129]/30 bg-white/80 p-12 text-center">
          <p className="text-gray-600 mb-4">No resource categories yet. Seed defaults or create a new one.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {categories.map((category, index) => (
            <div
              key={category.id}
              className={`rounded-xl border ${category.isActive ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-75'} p-4 shadow-sm`}
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
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      {category.icon && <span className="text-2xl">{category.icon}</span>}
                      <h3 className="text-lg font-semibold text-gray-900">{category.name}</h3>
                      {category.parentName && (
                        <span className="px-2 py-0.5 text-xs font-semibold bg-gray-100 text-gray-600 rounded-full">
                          {category.parentName}
                        </span>
                      )}
                      {!category.isActive && (
                        <span className="px-2 py-0.5 text-xs font-semibold bg-gray-200 text-gray-600 rounded-full">
                          Inactive
                        </span>
                      )}
                      {category.allowPublicRead ? (
                        <span className="px-2 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-700 rounded-full flex items-center gap-1">
                          <Eye className="w-3 h-3" /> Public
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-xs font-semibold bg-amber-100 text-amber-700 rounded-full flex items-center gap-1">
                          <EyeOff className="w-3 h-3" /> Members Only
                        </span>
                      )}
                    </div>
                    {category.description && <p className="text-sm text-gray-600 mb-2">{category.description}</p>}
                    <div className="text-xs text-gray-500">
                      Slug: <code className="bg-gray-100 px-1 rounded">{category.slug}</code>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleTogglePublic(category.id, category.allowPublicRead)}
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

export default ResourceCategoriesPanel;
