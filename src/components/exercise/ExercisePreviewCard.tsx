import React, { useEffect, useState } from 'react';
import type { ExerciseDoc } from '../../types/exercise';
import { getDownloadURL, ref } from 'firebase/storage';
import { storage } from '../../config/firebase';

type Props = {
  exercise: ExerciseDoc;
  compact?: boolean;
};

export default function ExercisePreviewCard({ exercise, compact }: Props) {
  const media = exercise.media || {};
  const [poster, setPoster] = useState<string | undefined>(media.posterUrl);
  const [loop, setLoop] = useState<string | undefined>(media.loopUrl);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        if (media.posterPath) {
          const url = await getDownloadURL(ref(storage as any, media.posterPath));
          if (mounted) setPoster(url);
        } else {
          setPoster(media.posterUrl);
        }
      } catch {
        setPoster(media.posterUrl);
      }
      try {
        if (media.loopPath) {
          const url = await getDownloadURL(ref(storage as any, media.loopPath));
          if (mounted) setLoop(url);
        } else {
          setLoop(media.loopUrl);
        }
      } catch {
        setLoop(media.loopUrl);
      }
    };
    run();
    return () => { mounted = false; };
  }, [media.posterPath, media.loopPath, media.posterUrl, media.loopUrl]);
  return (
    <div className={`border rounded-xl bg-white/70 ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex items-start gap-3">
        <div className="w-28 h-28 rounded overflow-hidden bg-gray-100 flex items-center justify-center">
          {loop ? (
            <video
              src={loop}
              className="w-full h-full object-cover"
              autoPlay
              muted
              loop
              playsInline
            />
          ) : poster ? (
            <img src={poster} alt={exercise.canonicalName} className="w-full h-full object-cover" />
          ) : (
            <div className="text-xs text-gray-500 px-2 text-center">Preview coming soon</div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-900">{exercise.canonicalName}</div>
          {exercise.instructions?.length ? (
            <ul className="mt-1 text-xs text-gray-600 list-disc list-inside space-y-0.5">
              {exercise.instructions.slice(0, 3).map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          ) : (
            <div className="mt-1 text-xs text-gray-500">No instructions available yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
