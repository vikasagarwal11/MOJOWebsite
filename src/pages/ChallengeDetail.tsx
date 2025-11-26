import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useFirestore } from '../hooks/useFirestore';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import { joinChallenge, generateChallengeShareCard } from '../services/challengeService';

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

  if (!id) return <div className="max-w-4xl mx-auto p-6">Invalid challenge</div>;

  const sortedParticipants = useMemo(() => {
    if (!participants) return [];
    const copy = [...participants];
    copy.sort((a: any, b: any) => {
      if (challenge?.goal === 'minutes') {
        return (b?.minutesSum || 0) - (a?.minutesSum || 0);
      }
      return (b?.progressCount || 0) - (a?.progressCount || 0);
    });
    return copy;
  }, [participants, challenge?.goal]);

  const isParticipant = useMemo(() => {
    if (!currentUser) return false;
    return sortedParticipants.some((p: any) => p.id === currentUser.id || p.userId === currentUser.id);
  }, [sortedParticipants, currentUser]);

  const currentEntry = useMemo(() => {
    if (!currentUser) return null;
    return sortedParticipants.find((p: any) => p.id === currentUser.id || p.userId === currentUser.id) || null;
  }, [sortedParticipants, currentUser]);

  const formatDate = (value: any) => {
    if (!value) return '—';
    const date = value instanceof Date ? value : (value?.toDate ? value.toDate() : new Date(value));
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  const formatDateShort = (value: any) => {
    if (!value) return '—';
    const date = value instanceof Date ? value : (value?.toDate ? value.toDate() : new Date(value));
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getChallengeDescription = () => {
    if (!challenge) return '';
    const goalText = challenge.goal === 'minutes' 
      ? `${challenge.target} minutes of movement` 
      : `${challenge.target} workout session${challenge.target !== 1 ? 's' : ''}`;
    return goalText;
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
    if (percent === 0) return "You're just getting started! Every journey begins with the first step. 💪";
    if (percent < 25) return "Great start! You're building momentum. Keep going! 🔥";
    if (percent < 50) return "You're making amazing progress! You've got this! ⚡";
    if (percent < 75) return "You're more than halfway there! So close to the finish line! 🌟";
    if (percent < 100) return "Almost there! You're crushing this challenge! 🏆";
    return "Congratulations! You've completed the challenge! You're a champion! 🎉";
  };

  const progressString = (() => {
    if (!challenge || !currentEntry) return '';
    if (challenge.goal === 'minutes') {
      const completed = currentEntry.minutesSum || 0;
      const remaining = Math.max(0, challenge.target - completed);
      return remaining > 0 
        ? `${completed} of ${challenge.target} minutes completed • ${remaining} to go!`
        : `All ${challenge.target} minutes completed! 🎉`;
    }
    const completed = currentEntry.progressCount || 0;
    const remaining = Math.max(0, challenge.target - completed);
    return remaining > 0
      ? `${completed} of ${challenge.target} session${challenge.target !== 1 ? 's' : ''} completed • ${remaining} to go!`
      : `All ${challenge.target} session${challenge.target !== 1 ? 's' : ''} completed! 🎉`;
  })();

  const percentComplete = (() => {
    if (!challenge || !currentEntry || !challenge.target) return 0;
    const value = challenge.goal === 'minutes' ? (currentEntry.minutesSum || 0) : (currentEntry.progressCount || 0);
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

  const handleBack = () => navigate('/challenges');

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <button onClick={handleBack} className="text-sm text-gray-500 hover:text-[#F25129]">&larr; Back to challenges</button>
          <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-[#F25129] to-[#FFC107] bg-clip-text text-transparent mt-2 mb-2">
            {loadingChallenge ? 'Loading…' : challenge?.title || 'Challenge'}
          </h1>
          {challenge && (
            <div className="space-y-2">
              <div className="text-base text-gray-700 font-medium">
                Complete {getChallengeDescription()} in {getChallengeDuration()} day{getChallengeDuration() !== 1 ? 's' : ''}!
              </div>
              <div className="text-sm text-gray-600">
                📅 Runs from {formatDateShort(challenge.startAt)} to {formatDateShort(challenge.endAt)}, {challenge.endAt?.toDate ? challenge.endAt.toDate().getFullYear() : new Date().getFullYear()}
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          {!isParticipant && (
            <button
              onClick={handleJoin}
              disabled={joining}
              className="px-4 py-2 rounded bg-[#F25129] text-white text-sm disabled:opacity-60"
            >
              {joining ? 'Joining…' : 'Join Challenge'}
            </button>
          )}
          <button
            onClick={handleShare}
            disabled={!isParticipant || sharing}
            className="px-4 py-2 rounded border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-60"
          >
            {sharing ? 'Generating…' : 'Share Progress'}
          </button>
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

      <div className="rounded-xl border bg-white/70 p-4">
        <div className="text-lg font-semibold mb-3">Leaderboard</div>
        {sortedParticipants && sortedParticipants.length ? (
          <div className="divide-y">
            {sortedParticipants.map((p:any, idx:number) => (
              <div key={p.id} className={`py-2 flex items-center justify-between ${currentUser && (p.id === currentUser.id || p.userId === currentUser.id) ? 'bg-[#F25129]/5 rounded-lg px-2' : 'px-2'}`}>
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-[#F25129]/10 text-[#F25129] flex items-center justify-center text-xs font-semibold">{idx+1}</div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">{p.displayName || 'Member'}</div>
                    <div className="text-xs text-gray-600">
                      {(p.progressCount || 0)} sessions • {(p.minutesSum || 0)} min
                    </div>
                  </div>
                </div>
                <div className="text-xs text-gray-500">
                  Joined {p.joinedAt?.toDate?.() ? new Date(p.joinedAt.toDate()).toLocaleDateString() : ''}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-600">No participants yet.</div>
        )}
      </div>
    </div>
  );
}

