import React, { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useFirestore } from '../hooks/useFirestore';
import { orderBy } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { createChallenge, joinChallenge, ChallengeCategory, ChallengeType } from '../services/challengeService';

const CHALLENGE_TYPES: Record<ChallengeCategory, { label: string; types: { value: ChallengeType; label: string; unit: string }[] }> = {
  exercise: {
    label: 'Exercise',
    types: [
      { value: 'workout_sessions', label: 'Workout Sessions', unit: 'sessions' },
      { value: 'workout_minutes', label: 'Workout Minutes', unit: 'minutes' },
      { value: 'steps', label: 'Daily Steps', unit: 'steps' },
      { value: 'distance', label: 'Distance', unit: 'miles' },
    ],
  },
  nutrition: {
    label: 'Nutrition',
    types: [
      { value: 'healthy_meals', label: 'Healthy Meals', unit: 'meals' },
      { value: 'water_intake', label: 'Water Intake', unit: 'glasses' },
      { value: 'no_sugar', label: 'No Sugar Days', unit: 'days' },
      { value: 'vegetarian_days', label: 'Vegetarian Days', unit: 'days' },
      { value: 'meal_prep', label: 'Meal Prep Days', unit: 'days' },
    ],
  },
  lifestyle: {
    label: 'Lifestyle',
    types: [
      { value: 'meditation', label: 'Meditation', unit: 'minutes' },
      { value: 'sleep_hours', label: 'Sleep Hours', unit: 'hours' },
      { value: 'gratitude', label: 'Gratitude Journal', unit: 'entries' },
      { value: 'reading', label: 'Reading', unit: 'minutes' },
      { value: 'screen_time', label: 'Screen Time Limit', unit: 'hours' },
    ],
  },
  wellness: {
    label: 'Wellness',
    types: [
      { value: 'self_care', label: 'Self Care Days', unit: 'days' },
      { value: 'social_connection', label: 'Social Connection', unit: 'days' },
      { value: 'outdoor_time', label: 'Outdoor Time', unit: 'hours' },
    ],
  },
  custom: {
    label: 'Custom',
    types: [
      { value: 'custom', label: 'Custom Challenge', unit: 'units' },
    ],
  },
};

export default function Challenges() {
  const { currentUser } = useAuth();
  const { useRealtimeCollection } = useFirestore();
  const { data: challenges } = useRealtimeCollection('challenges', [orderBy('startAt','desc')]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ 
    title: '', 
    category: 'exercise' as ChallengeCategory,
    type: 'workout_sessions' as ChallengeType,
    target: 7, 
    days: 7,
    description: '',
    instructions: '',
  });

  const now = Date.now();
  const upcoming = useMemo(()=> (challenges||[]).filter((c:any)=> (c.endAt?.toDate?.()?.getTime?.() ?? c.endAt ?? 0) >= now), [challenges, now]);

  const selectedTypeInfo = useMemo(() => {
    const categoryInfo = CHALLENGE_TYPES[form.category];
    return categoryInfo.types.find(t => t.value === form.type) || categoryInfo.types[0];
  }, [form.category, form.type]);

  const onCreate = async () => {
    if (!currentUser) { toast.error('Sign in required'); return; }
    if (!form.title.trim()) { toast.error('Title required'); return; }
    try {
      const startAt = Date.now();
      const endAt = startAt + form.days*24*60*60*1000;
      const challengeData = { 
        title: form.title.trim(), 
        category: form.category,
        type: form.type,
        target: form.target, 
        unit: selectedTypeInfo.unit,
        startAt, 
        endAt, 
        description: form.description.trim() || undefined,
        instructions: form.instructions.trim() || undefined,
        visibility: 'members' 
      };
      console.log('🔍 Creating challenge with data:', challengeData);
      await createChallenge(challengeData);
      setOpen(false);
      setForm({ title: '', category: 'exercise', type: 'workout_sessions', target: 7, days: 7, description: '', instructions: '' });
      toast.success('Challenge created');
    } catch (e:any) {
      console.error(e);
      toast.error(e?.message || 'Failed to create');
    }
  };

  const onJoin = async (id: string) => {
    try {
      await joinChallenge(id);
      toast.success('Joined');
    } catch (e:any) { toast.error(e?.message || 'Failed to join'); }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-3xl md:text-4xl font-bold text-[#F25129]">Challenges</h1>
        <button onClick={()=> setOpen(true)} className="px-4 py-2 rounded bg-[#F25129] text-white">New Challenge</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(upcoming || []).map((c:any) => {
          const category = c.category || 'exercise';
          const categoryLabel = CHALLENGE_TYPES[category as ChallengeCategory]?.label || 'Challenge';
          const unit = c.unit || (c.goal === 'minutes' ? 'minutes' : 'sessions');
          const displayGoal = c.target ? `${c.target} ${unit}` : 'Target not set';
          
          return (
            <div key={c.id} className="rounded-xl border bg-white/70 p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="text-lg font-semibold">{c.title}</div>
                <span className="text-xs px-2 py-1 rounded-full bg-[#F25129]/10 text-[#F25129] font-medium">
                  {categoryLabel}
                </span>
              </div>
              <div className="text-xs text-gray-600 mt-1">{displayGoal}</div>
              {c.description && (
                <div className="text-sm text-gray-500 mt-2 line-clamp-2">{c.description}</div>
              )}
              <div className="mt-3">
                <button onClick={()=> onJoin(c.id)} className="px-3 py-1.5 rounded border">Join</button>
                <a href={`/challenges/${c.id}`} className="ml-2 px-3 py-1.5 rounded bg-black text-white text-sm">View</a>
              </div>
            </div>
          );
        })}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl p-5 max-h-[90vh] overflow-y-auto">
            <div className="text-xl font-semibold mb-4">Create Challenge</div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Challenge Title</label>
                <input 
                  value={form.title} 
                  onChange={e=> setForm(f=>({...f, title: e.target.value}))} 
                  className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#F25129] focus:border-[#F25129]"
                  placeholder="e.g., 7-Day Healthy Meals Challenge"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select 
                    value={form.category} 
                    onChange={e=> {
                      const newCategory = e.target.value as ChallengeCategory;
                      const firstType = CHALLENGE_TYPES[newCategory].types[0].value;
                      setForm(f=>({...f, category: newCategory, type: firstType}));
                    }} 
                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#F25129] focus:border-[#F25129]"
                  >
                    {Object.entries(CHALLENGE_TYPES).map(([key, info]) => (
                      <option key={key} value={key}>{info.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select 
                    value={form.type} 
                    onChange={e=> setForm(f=>({...f, type: e.target.value as ChallengeType}))} 
                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#F25129] focus:border-[#F25129]"
                  >
                    {CHALLENGE_TYPES[form.category].types.map(type => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Target ({selectedTypeInfo.unit})
                  </label>
                  <input 
                    type="number" 
                    value={form.target} 
                    onChange={e=> setForm(f=>({...f, target: Math.max(1, Number(e.target.value)||1)}))} 
                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#F25129] focus:border-[#F25129]"
                    min="1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Duration (days)</label>
                  <input 
                    type="number" 
                    value={form.days} 
                    onChange={e=> setForm(f=>({...f, days: Math.max(1, Number(e.target.value)||7)}))} 
                    className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#F25129] focus:border-[#F25129]"
                    min="1"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description (Optional)</label>
                <textarea 
                  value={form.description} 
                  onChange={e=> setForm(f=>({...f, description: e.target.value}))} 
                  className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#F25129] focus:border-[#F25129]"
                  rows={2}
                  placeholder="What's this challenge about?"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Instructions (Optional)</label>
                <textarea 
                  value={form.instructions} 
                  onChange={e=> setForm(f=>({...f, instructions: e.target.value}))} 
                  className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#F25129] focus:border-[#F25129]"
                  rows={2}
                  placeholder="How should participants complete this challenge?"
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  <strong>Challenge Preview:</strong> Complete <strong>{form.target} {selectedTypeInfo.unit}</strong> in <strong>{form.days} day{form.days !== 1 ? 's' : ''}</strong>
                </p>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t">
              <button 
                onClick={()=> {
                  setOpen(false);
                  setForm({ title: '', category: 'exercise', type: 'workout_sessions', target: 7, days: 7, description: '', instructions: '' });
                }} 
                className="px-6 py-2 rounded-lg border border-gray-300 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button 
                onClick={onCreate} 
                className="px-6 py-2 rounded-lg bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white font-semibold hover:from-[#E0451F] hover:to-[#E5A900] transition-all"
              >
                Create Challenge
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
