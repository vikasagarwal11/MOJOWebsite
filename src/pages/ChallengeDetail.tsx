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
    if (value instanceof Date) return value.toLocaleDateString();
    if (value?.toDate) return value.toDate().toLocaleDateString();
    return value;
  };

  const progressString = (() => {
    if (!challenge || !currentEntry) return '';
    if (challenge.goal === 'minutes') {
      return `${currentEntry.minutesSum || 0} / ${challenge.target} min`;
    }
    return `${currentEntry.progressCount || 0} / ${challenge.target} sessions`;
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
          <h1 className="text-3xl md:text-4xl font-bold text-[#F25129] mt-2 mb-1">
            {loadingChallenge ? 'Loading…' : challenge?.title || 'Challenge'}
          </h1>
          <div className="text-sm text-gray-600">
            Goal: <span className="uppercase">{challenge?.goal}</span> • Target: {challenge?.target} •
            {' '}Starts {formatDate(challenge?.startAt)} • Ends {formatDate(challenge?.endAt)}
          </div>
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
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 mb-6">
          <div className="text-sm font-semibold text-emerald-700">Your Progress</div>
          <div className="flex items-center justify-between text-sm text-emerald-800 mt-1">
            <span>{progressString}</span>
            <span>{percentComplete}% complete</span>
          </div>
          <div className="mt-2 h-2 bg-white rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${percentComplete}%` }}
            />
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

