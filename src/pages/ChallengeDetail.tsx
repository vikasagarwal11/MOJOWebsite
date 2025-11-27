import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useFirestore } from '../hooks/useFirestore';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import { joinChallenge, generateChallengeShareCard, logChallengeCheckIn } from '../services/challengeService';

export default function ChallengeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { useRealtimeDoc, useRealtimeCollection } = useFirestore();
  const challengeDocPath = id ? `challenges/${id}` : undefined;
  const participantsPath = id ? `challenges/${id}/participants` : undefined;
  const { data: challenge, loading: loadingChallenge } = useRealtimeDoc(challengeDocPath);
  const { data: participants } = useRealtimeCollection(participantsPath as any, []);
  const [joining, setJoining] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [loggingProgress, setLoggingProgress] = useState(false);
  const [progressInput, setProgressInput] = useState<number>(1);

  const isValueBasedChallenge = (ch?: any) => {
    if (!ch) return false;
    const type = ch.type;
    const unit = ch.unit;
    const valueTypes = new Set([
      'workout_minutes',
      'meditation',
      'sleep_hours',
      'reading',
      'screen_time',
      'outdoor_time',
      'water_intake',
      'distance',
      'steps',
    ]);
    if (type && valueTypes.has(type)) return true;
    if (unit && ['minutes', 'hours', 'glasses', 'miles', 'steps'].includes(unit)) return true;
    return ch.goal === 'minutes';
  };

  const sortedParticipants = useMemo(() => {
    if (!participants) return [];
    const copy = [...participants];
    copy.sort((a: any, b: any) => {
      const valueBased = isValueBasedChallenge(challenge);
      if (valueBased) {
        const aValue = a?.progressValue || a?.minutesSum || 0;
        const bValue = b?.progressValue || b?.minutesSum || 0;
        return bValue - aValue;
      } else {
        return (b?.progressCount || 0) - (a?.progressCount || 0);
      }
    });
    return copy;
  }, [participants, challenge?.goal, challenge?.type]);

  const isParticipant = useMemo(() => {
    if (!currentUser) return false;
    return sortedParticipants.some((p: any) => p.id === currentUser.id || p.userId === currentUser.id);
  }, [sortedParticipants, currentUser]);

  const currentEntry = useMemo(() => {
    if (!currentUser) return null;
    return sortedParticipants.find((p: any) => p.id === currentUser.id || p.userId === currentUser.id) || null;
  }, [sortedParticipants, currentUser]);

  if (!id) return <div className="max-w-4xl mx-auto p-6">Invalid challenge</div>;

  const formatDate = (value: any) => {
    if (!value) return 'Date TBD';
    const date = value instanceof Date ? value : (value?.toDate ? value.toDate() : new Date(value));
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  const formatDateShort = (value: any) => {
    if (!value) return 'Date TBD';
    const date = value instanceof Date ? value : (value?.toDate ? value.toDate() : new Date(value));
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getChallengeDescription = () => {
    if (!challenge) return '';
    const unit = challenge.unit || (challenge.goal === 'minutes' ? 'minutes' : 'sessions');
    const category = challenge.category || 'exercise';
    
    // Get friendly description based on category and type
    if (challenge.type) {
      const typeDescriptions: Record<string, string> = {
        'workout_sessions': 'workout sessions',
        'workout_minutes': 'minutes of workouts',
        'steps': 'steps',
        'distance': 'miles',
        'healthy_meals': 'healthy meals',
        'water_intake': 'glasses of water',
        'no_sugar': 'days without added sugar',
        'vegetarian_days': 'vegetarian days',
        'meal_prep': 'meal prep days',
        'meditation': 'minutes of meditation',
        'sleep_hours': 'hours of sleep',
        'gratitude': 'gratitude entries',
        'reading': 'minutes of reading',
        'screen_time': 'hours of screen time',
        'self_care': 'self-care days',
        'social_connection': 'days of social connection',
        'outdoor_time': 'hours outdoors',
        'custom': `${challenge.target} ${unit}`,
      };
      const desc = typeDescriptions[challenge.type];
      if (desc) {
        return `${challenge.target} ${desc}`;
      }
    }
    
    // Fallback to unit-based description
    return `${challenge.target} ${unit}`;
  };

  const getChallengeDuration = () => {
    if (!challenge?.startAt || !challenge?.endAt) return '';
    const start = challenge.startAt instanceof Date ? challenge.startAt : (challenge.startAt?.toDate ? challenge.startAt.toDate() : new Date(challenge.startAt));
    const end = challenge.endAt instanceof Date ? challenge.endAt : (challenge.endAt?.toDate ? challenge.endAt.toDate() : new Date(challenge.endAt));
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const getMotivationalMessage = () => {
    if (!challenge || !currentEntry) return '';
    const percent = percentComplete;
    if (percent === 0) return "You're just getting started! Every journey begins with the first step.";
    if (percent < 25) return "Great start! You're building momentum. Keep going!";
    if (percent < 50) return "You're making solid progress! You've got this!";
    if (percent < 75) return "You're more than halfway there! So close to the finish line!";
    if (percent < 100) return "Almost there! You're crushing this challenge!";
    return "Congratulations! You've completed the challenge!";
  };

  const progressString = (() => {
    if (!challenge || !currentEntry) return '';
    
    const unit = challenge.unit || (challenge.goal === 'minutes' ? 'minutes' : 'sessions');
    const valueBased = isValueBasedChallenge(challenge);
    
    if (valueBased) {
      const completed = currentEntry.progressValue || currentEntry.minutesSum || 0;
      const remaining = Math.max(0, challenge.target - completed);
      return remaining > 0 
        ? `${completed} of ${challenge.target} ${unit} completed - ${remaining} to go!`
        : `All ${challenge.target} ${unit} completed!`;
    } else {
      const completed = currentEntry.progressCount || 0;
      const remaining = Math.max(0, challenge.target - completed);
      return remaining > 0
        ? `${completed} of ${challenge.target} ${unit} completed - ${remaining} to go!`
        : `All ${challenge.target} ${unit} completed!`;
    }
  })();

  const percentComplete = (() => {
    if (!challenge || !currentEntry || !challenge.target) return 0;
    
    const valueBased = isValueBasedChallenge(challenge);
    
    const value = valueBased 
      ? (currentEntry.progressValue || currentEntry.minutesSum || 0)
      : (currentEntry.progressCount || 0);
    
    return Math.min(100, Math.round((value / challenge.target) * 100));
  })();

  const handleJoin = async () => {
    if (!currentUser) {
      toast.error('Sign in to join challenges');
      return;
    }
    if (!id) return;
    setJoining(true);
    try {
      await joinChallenge(id);
      toast.success('Joined challenge');
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || 'Failed to join');
    } finally {
      setJoining(false);
    }
  };

  const handleShare = async () => {
    if (!currentUser) {
      toast.error('Sign in to share progress');
      return;
    }
    if (!id) return;
    if (!isParticipant) {
      toast.error('Join the challenge to generate a progress card.');
      return;
    }
    setSharing(true);
    try {
      const { url } = await generateChallengeShareCard(id);
      toast.success('Share card ready! Added to Media gallery and opening in a new tab...', { duration: 5000 });
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || 'Failed to generate share card');
    } finally {
      setSharing(false);
    }
  };

  const handleLogProgress = async () => {
    if (!currentUser) {
      toast.error('Sign in to log progress');
      return;
    }
    if (!id) return;
    if (!isParticipant) {
      toast.error('Join the challenge to log progress');
      return;
    }
    const valueBased = isValueBasedChallenge(challenge);
    const payload = valueBased
      ? { value: Math.max(0, Number(progressInput) || 0) }
      : { count: Math.max(0, Number(progressInput) || 0) };
    if ((payload.value ?? payload.count ?? 0) <= 0) {
      toast.error('Enter a positive value');
      return;
    }
    setLoggingProgress(true);
    try {
      await logChallengeCheckIn(id, payload);
      toast.success('Progress logged');
      setProgressInput(valueBased ? payload.value || 0 : payload.count || 1);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || 'Failed to log progress');
    } finally {
      setLoggingProgress(false);
    }
  };

  const handleBack = () => navigate('/challenges');

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <button onClick={handleBack} className="text-sm text-gray-500 hover:text-[#F25129]">&larr; Back to challenges</button>
          <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-[#F25129] to-[#FFC107] bg-clip-text text-transparent mt-2 mb-2">
            {loadingChallenge ? 'Loading...' : challenge?.title || 'Challenge'}
          </h1>
          {challenge && (
            <div className="space-y-2">
              <div className="text-base text-gray-700 font-medium">
                Complete {getChallengeDescription()} in {getChallengeDuration()} day{getChallengeDuration() !== 1 ? 's' : ''}!
              </div>
              <div className="text-sm text-gray-600">
                  Runs from {formatDateShort(challenge.startAt)} to {formatDateShort(challenge.endAt)}, {challenge.endAt?.toDate ? challenge.endAt.toDate().getFullYear() : new Date().getFullYear()}
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          {!isParticipant && (
            <button
              onClick={handleJoin}
              disabled={joining}
              className="px-6 py-3 rounded-full bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white font-semibold text-sm shadow-lg hover:shadow-xl transition-all disabled:opacity-60 transform hover:scale-105"
            >
              {joining ? 'Joining...' : 'Join the Challenge'}
            </button>
          )}
          {isParticipant && (
            <button
              onClick={handleShare}
              disabled={sharing}
              className="px-6 py-3 rounded-full border-2 border-[#F25129] text-[#F25129] font-semibold text-sm hover:bg-[#F25129] hover:text-white transition-all disabled:opacity-60 transform hover:scale-105"
            >
              {sharing ? 'Generating...' : 'Share Your Progress'}
            </button>
          )}
        </div>
      </div>

      {isParticipant && currentEntry && (
        <div className="rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-green-50 px-6 py-4 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="text-base font-bold text-emerald-800">Your Journey</div>
            <div className="text-lg font-bold text-emerald-700">{percentComplete}%</div>
          </div>
          <div className="text-sm text-emerald-700 mb-3">
            {progressString}
          </div>
          <div className="mb-2">
            <div className="h-3 bg-white rounded-full overflow-hidden shadow-inner">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-green-500 transition-all duration-500 shadow-sm"
                style={{ width: `${percentComplete}%` }}
              />
            </div>
          </div>
          <div className="text-xs text-emerald-600 italic mt-2">
            {getMotivationalMessage()}
          </div>
        </div>
      )}

      {isParticipant && (
        <div className="rounded-xl border bg-white/70 p-6 shadow-sm mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-lg font-semibold text-gray-900">Log Progress</div>
              <div className="text-sm text-gray-600">
                {isValueBasedChallenge(challenge)
                  ? `Add ${challenge?.unit || 'units'} toward your goal`
                  : 'Add completed count toward your goal'}
              </div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 items-center">
            <input
              type="number"
              value={progressInput}
              onChange={(e) => setProgressInput(Number(e.target.value))}
              min={0}
              className="w-full sm:w-48 border rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#F25129] focus:border-[#F25129]"
              aria-label="Progress amount"
            />
            <button
              onClick={handleLogProgress}
              disabled={loggingProgress}
              className="px-6 py-2 rounded-lg bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white font-semibold hover:from-[#E0451F] hover:to-[#E5A900] transition-all disabled:opacity-60"
            >
              {loggingProgress ? 'Saving...' : 'Log Progress'}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-white/70 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xl font-bold text-gray-900 mb-1">Leaderboard</div>
            <div className="text-sm text-gray-600">
              {sortedParticipants && sortedParticipants.length 
                ? `${sortedParticipants.length} ${sortedParticipants.length === 1 ? 'champion' : 'champions'} competing`
                : 'Be the first to join and lead the way!'}
            </div>
          </div>
        </div>
        {sortedParticipants && sortedParticipants.length ? (
          <div className="divide-y divide-gray-200">
            {sortedParticipants.map((p:any, idx:number) => {
              const isCurrentUser = currentUser && (p.id === currentUser.id || p.userId === currentUser.id);
              const medal = idx === 0 ? '1st' : idx === 1 ? '2nd' : idx === 2 ? '3rd' : '';
              return (
                <div key={p.id} className={`py-3 flex items-center justify-between transition-colors ${isCurrentUser ? 'bg-gradient-to-r from-[#F25129]/10 to-[#FFC107]/10 rounded-lg px-3 border-l-4 border-[#F25129]' : 'px-3 hover:bg-gray-50'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                      idx === 0 ? 'bg-gradient-to-r from-yellow-400 to-yellow-500 text-white' :
                      idx === 1 ? 'bg-gradient-to-r from-gray-300 to-gray-400 text-white' :
                      idx === 2 ? 'bg-gradient-to-r from-orange-300 to-orange-400 text-white' :
                      'bg-[#F25129]/10 text-[#F25129]'
                    }`}>
                      {medal || (idx + 1)}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                        {p.displayName || 'Member'}
                        {isCurrentUser && <span className="text-xs bg-[#F25129] text-white px-2 py-0.5 rounded-full">You</span>}
                      </div>
                      <div className="text-xs text-gray-600 mt-0.5">
                        {(() => {
                          const unit = challenge?.unit || (challenge?.goal === 'minutes' ? 'minutes' : 'sessions');
                          const valueBased = isValueBasedChallenge(challenge);
                          
                          if (valueBased) {
                            const value = p.progressValue || p.minutesSum || 0;
                            return `${value} ${unit} completed`;
                          } else {
                            const count = p.progressCount || 0;
                            return `${count} ${unit} completed`;
                          }
                        })()}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    Joined {p.joinedAt?.toDate?.() ? new Date(p.joinedAt.toDate()).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="text-4xl mb-3">*</div>
            <div className="text-base font-semibold text-gray-700 mb-1">Ready to be the first champion?</div>
            <div className="text-sm text-gray-600">Join now and set the pace for everyone else!</div>
          </div>
        )}
      </div>
    </div>
  );
}
