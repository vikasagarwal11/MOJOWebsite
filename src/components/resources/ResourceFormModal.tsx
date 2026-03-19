import React, { useEffect, useMemo, useState } from 'react';
import { Eye, Pencil, Save, X } from 'lucide-react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import DOMPurify from 'dompurify';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import type { ResourceCategory, ResourceEntry, CreateResourceEntryData } from '../../types/resources';
import { createResourceEntry, updateResourceEntry } from '../../services/resourceService';

interface ResourceFormModalProps {
  categories: ResourceCategory[];
  entry?: ResourceEntry | null;
  onClose: () => void;
  onSaved: () => void;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const ResourceFormModal: React.FC<ResourceFormModalProps> = ({ categories, entry, onClose, onSaved }) => {
  const { currentUser } = useAuth();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [previewMode, setPreviewMode] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [location, setLocation] = useState('');
  const [contact, setContact] = useState('');
  const [website, setWebsite] = useState('');
  const [tagsText, setTagsText] = useState('');

  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleDays, setScheduleDays] = useState<string[]>([]);
  const [scheduleTime, setScheduleTime] = useState('');
  const [scheduleInstructor, setScheduleInstructor] = useState('');
  const [scheduleNotes, setScheduleNotes] = useState('');

  const [isSaving, setIsSaving] = useState(false);

  const subcategories = useMemo(
    () => categories.filter(c => c.parentId === categoryId),
    [categories, categoryId]
  );

  useEffect(() => {
    if (!entry) return;
    setTitle(entry.title || '');
    setDescription(entry.description || '');
    setCategoryId(entry.categoryId || '');
    setSubcategoryId(entry.subcategoryId || '');
    setLocation(entry.location || '');
    setContact(entry.contact || '');
    setWebsite(entry.website || '');
    setTagsText(entry.tags?.join(', ') || '');

    const hasSchedule = !!entry.schedule;
    setScheduleEnabled(hasSchedule);
    setScheduleDays(entry.schedule?.days || []);
    setScheduleTime(entry.schedule?.time || '');
    setScheduleInstructor(entry.schedule?.instructor || '');
    setScheduleNotes(entry.schedule?.notes || '');
    setPreviewMode(false);
  }, [entry]);

  useEffect(() => {
    if (entry) return;
    setTitle('');
    setDescription('');
    setCategoryId('');
    setSubcategoryId('');
    setLocation('');
    setContact('');
    setWebsite('');
    setTagsText('');
    setScheduleEnabled(false);
    setScheduleDays([]);
    setScheduleTime('');
    setScheduleInstructor('');
    setScheduleNotes('');
    setPreviewMode(false);
  }, [entry]);

  useEffect(() => {
    if (subcategoryId && !subcategories.find(sc => sc.id === subcategoryId)) {
      setSubcategoryId('');
    }
  }, [subcategoryId, subcategories]);

  const handleToggleDay = (day: string) => {
    setScheduleDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const buildPayload = (): CreateResourceEntryData => {
    const tags = tagsText
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean);

    const schedule = scheduleEnabled
      ? {
          days: scheduleDays.length > 0 ? scheduleDays : undefined,
          time: scheduleTime.trim() || undefined,
          instructor: scheduleInstructor.trim() || undefined,
          notes: scheduleNotes.trim() || undefined,
        }
      : undefined;

    return {
      title: title.trim(),
      description: description.trim(),
      categoryId,
      subcategoryId: subcategoryId || null,
      location: location.trim() || undefined,
      contact: contact.trim() || undefined,
      website: website.trim() || undefined,
      tags,
      schedule,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      toast.error('Please log in to add resources.');
      return;
    }
    if (!title.trim()) {
      toast.error('Title is required.');
      return;
    }
    if (!description.trim() || description.trim() === '<p><br></p>') {
      toast.error('Description is required.');
      return;
    }
    if (!categoryId) {
      toast.error('Please select a category.');
      return;
    }

    setIsSaving(true);
    try {
      const payload = buildPayload();

      if (entry) {
        await updateResourceEntry(entry.id, payload);
        toast.success('Resource updated.');
      } else {
        await createResourceEntry(
          payload,
          currentUser.id,
          currentUser.displayName || 'Member',
          currentUser.photoURL || undefined
        );
        toast.success('Resource added.');
      }

      onSaved();
      onClose();
    } catch (error: any) {
      console.error('Failed to save resource', error);
      toast.error(error?.message || 'Failed to save resource.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm overflow-y-auto">
      <div className="min-h-full flex items-start justify-center p-4 sm:p-6">
        <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full my-6 sm:my-10 max-h-[calc(100vh-3rem)] sm:max-h-[calc(100vh-4rem)] flex flex-col">
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-gray-200 flex items-center justify-between p-6 rounded-t-2xl">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {entry ? 'Edit Resource' : 'Add Resource'}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Share trusted recommendations and community knowledge.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
              >
                <option value="">Select a category</option>
                {categories.filter(c => !c.parentId).map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Subcategory
              </label>
              <select
                value={subcategoryId}
                onChange={(e) => setSubcategoryId(e.target.value)}
                disabled={subcategories.length === 0}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent disabled:bg-gray-100"
              >
                <option value="">None</option>
                {subcategories.map(sub => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
              placeholder="e.g., Mom-friendly yoga studio"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Description <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => setPreviewMode((prev) => !prev)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-100"
              >
                {previewMode ? <Pencil className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                {previewMode ? 'Edit' : 'Preview'}
              </button>
            </div>

            {!previewMode ? (
              <ReactQuill
                theme="snow"
                value={description}
                onChange={setDescription}
                placeholder="Why is this resource helpful? Share details moms should know."
                className="resource-editor"
              />
            ) : (
              <div className="resource-richtext border border-gray-200 rounded-lg p-4 bg-gray-50">
                {/<\/?[a-z][\s\S]*>/i.test(description || '') ? (
                  <div
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(description || '') }}
                  />
                ) : (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {description || '*Nothing to preview yet.*'}
                  </ReactMarkdown>
                )}
              </div>
            )}
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Location</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                placeholder="City, neighborhood, or address"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Contact</label>
              <input
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                placeholder="Phone or email"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Website</label>
              <input
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
                placeholder="https://..."
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tags</label>
            <input
              type="text"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#F25129] focus:border-transparent"
              placeholder="e.g., family-friendly, stroller-accessible, beginner"
            />
            <p className="text-xs text-gray-500 mt-1">Separate tags with commas.</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">Class Schedule (optional)</h3>
                <p className="text-xs text-gray-500">Great for Classes & Schedules entries.</p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={scheduleEnabled}
                  onChange={(e) => setScheduleEnabled(e.target.checked)}
                  className="w-4 h-4 text-[#F25129] rounded"
                />
                Add schedule
              </label>
            </div>

            {scheduleEnabled && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">Days</label>
                  <div className="flex flex-wrap gap-2">
                    {DAYS.map(day => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => handleToggleDay(day)}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                          scheduleDays.includes(day)
                            ? 'bg-[#F25129] text-white border-[#F25129]'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-[#F25129]'
                        }`}
                      >
                        {day.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Time</label>
                    <input
                      type="text"
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      placeholder="e.g., 7:00 AM"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Instructor</label>
                    <input
                      type="text"
                      value={scheduleInstructor}
                      onChange={(e) => setScheduleInstructor(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      placeholder="Instructor name"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                    <input
                      type="text"
                      value={scheduleNotes}
                      onChange={(e) => setScheduleNotes(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      placeholder="Bring a mat, etc."
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white rounded-lg hover:from-[#E0451F] hover:to-[#E55A2A] transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Saving...' : entry ? 'Save changes' : 'Add resource'}
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
};

export default ResourceFormModal;
