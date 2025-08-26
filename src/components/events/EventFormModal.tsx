import React, { useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

// Predefined fitness event tags organized by category
const FITNESS_TAGS = {
  'Class Type': ['Yoga', 'Pilates', 'HIIT', 'Strength Training', 'Cardio', 'Dance', 'Boxing', 'Swimming', 'Running', 'Cycling', 'Zumba', 'Barre', 'CrossFit'],
  'Level': ['Beginner', 'Intermediate', 'Advanced', 'All Levels'],
  'Audience': ['Women Only', 'Kids', 'Seniors', 'All Ages', 'Pregnancy Safe', 'Postpartum'],
  'Special': ['Workshop', 'Social', 'Competition', 'Training', 'Wellness', 'Nutrition', 'Mindfulness', 'Recovery'],
  'Duration': ['30 min', '45 min', '60 min', '90 min', '2+ hours']
};

type Props = { onClose: () => void; };

const EventFormModal: React.FC<Props> = ({ onClose }) => {
  const { currentUser } = useAuth();
  const [title, setTitle] = useState('');
  const [startAt, setStartAt] = useState('');
  const [visibility, setVisibility] = useState<'public'|'members'|'private'>('public');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState('');
  const [maxAttendees, setMaxAttendees] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (!currentUser) throw new Error('Sign in first');
      if (currentUser.role !== 'admin') throw new Error('Only admins can create events');
              await addDoc(collection(db, 'events'), {
          title,
          startAt: new Date(startAt),
          visibility,
          tags: selectedTags,
          maxAttendees: maxAttendees ? parseInt(maxAttendees) : null,
          createdBy: currentUser.id,
          createdAt: serverTimestamp(),
          invitedUserIds: [],
        });
      toast.success('Event created');
      onClose();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to create event');
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl p-6 shadow max-w-md w-full">
        <h2 className="text-lg font-semibold mb-4">Create Event</h2>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="text-sm block mb-1">Title</label>
            <input value={title} onChange={(e)=>setTitle(e.target.value)} className="w-full rounded border px-3 py-2" required />
          </div>
          <div>
            <label className="text-sm block mb-1">Start</label>
            <input type="datetime-local" value={startAt} onChange={(e)=>setStartAt(e.target.value)} className="w-full rounded border px-3 py-2" required />
          </div>
          <div>
            <label className="text-sm block mb-1">Visibility</label>
            <select value={visibility} onChange={(e)=>setVisibility(e.target.value as any)} className="w-full rounded border px-3 py-2">
              <option value="public">Public</option>
              <option value="members">Members</option>
              <option value="private">Private</option>
            </select>
          </div>
          
          <div>
            <label className="text-sm block mb-1">Max Attendees (optional)</label>
            <input 
              type="number" 
              min="1" 
              max="1000"
              value={maxAttendees} 
              onChange={(e)=>setMaxAttendees(e.target.value)} 
              placeholder="Leave empty for unlimited"
              className="w-full rounded border px-3 py-2" 
            />
          </div>
          
          {/* Tags Section */}
          <div>
            <label className="text-sm block mb-2">Tags</label>
            <div className="space-y-3">
              {/* Predefined Tags by Category */}
              {Object.entries(FITNESS_TAGS).map(([category, tags]) => (
                <div key={category}>
                  <h4 className="text-xs font-medium text-gray-600 mb-2">{category}</h4>
                  <div className="flex flex-wrap gap-2">
                    {tags.map(tag => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          if (selectedTags.includes(tag)) {
                            setSelectedTags(selectedTags.filter(t => t !== tag));
                          } else {
                            setSelectedTags([...selectedTags, tag]);
                          }
                        }}
                        className={`px-2 py-1 text-xs rounded-full border transition-colors ${
                          selectedTags.includes(tag)
                            ? 'bg-purple-600 text-white border-purple-600'
                            : 'bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-100'
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              
              {/* Custom Tag Input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customTag}
                  onChange={(e) => setCustomTag(e.target.value)}
                  placeholder="Add custom tag..."
                  className="flex-1 text-sm rounded border px-2 py-1"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && customTag.trim()) {
                      e.preventDefault();
                      if (!selectedTags.includes(customTag.trim())) {
                        setSelectedTags([...selectedTags, customTag.trim()]);
                      }
                      setCustomTag('');
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (customTag.trim() && !selectedTags.includes(customTag.trim())) {
                      setSelectedTags([...selectedTags, customTag.trim()]);
                      setCustomTag('');
                    }
                  }}
                  className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
                >
                  Add
                </button>
              </div>
              
              {/* Selected Tags Display */}
              {selectedTags.length > 0 && (
                <div>
                  <p className="text-xs text-gray-600 mb-2">Selected Tags:</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedTags.map(tag => (
                      <span
                        key={tag}
                        className="px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded-full flex items-center gap-1"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => setSelectedTags(selectedTags.filter(t => t !== tag))}
                          className="text-purple-600 hover:text-purple-800"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded border">Cancel</button>
            <button type="submit" className="px-4 py-2 rounded bg-purple-600 text-white">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
};
export default EventFormModal;
