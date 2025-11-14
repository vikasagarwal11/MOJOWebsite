import React, { useEffect, useMemo, useState } from 'react';
import { resolveExerciseByName, findAlternatives } from '../../services/exerciseService';
import type { ExerciseDoc, EquipmentFamily } from '../../types/exercise';
import ExercisePreviewCard from './ExercisePreviewCard';
import { normalizeExerciseName } from '../../utils/exerciseName';

type Props = {
  open: boolean;
  baseName: string;
  onClose: () => void;
  onSelect: (newName: string, exercise?: ExerciseDoc) => void;
  allowEquipment?: Record<EquipmentFamily, boolean>;
  difficulty?: 'beginner'|'intermediate'|'advanced';
};

const DEFAULT_EQUIPMENT: Record<EquipmentFamily, boolean> = {
  bodyweight: true,
  dumbbells: true,
  kettlebell: true,
  bands: true,
  barbell: false,
  machines: false,
  bench: true,
  box: true,
  medicine_ball: true,
  other: true,
};

export default function ExerciseSwapDialog({ open, baseName, onClose, onSelect, allowEquipment, difficulty }: Props) {
  const [loading, setLoading] = useState(false);
  const [base, setBase] = useState<ExerciseDoc | null>(null);
  const [alts, setAlts] = useState<ExerciseDoc[]>([]);
  const [equipment, setEquipment] = useState(allowEquipment || DEFAULT_EQUIPMENT);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    (async () => {
      try {
        const resolved = await resolveExerciseByName(normalizeExerciseName(baseName));
        setBase(resolved);
        if (resolved) {
          const options = await findAlternatives(resolved, { allowEquipment: equipment, movementFamily: resolved.movementFamily, difficulty: difficulty });
          setAlts(options);
        } else {
          setAlts([]);
        }
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, baseName]);

  useEffect(() => {
    if (!open || !base) return;
    (async () => {
      const options = await findAlternatives(base, { allowEquipment: equipment, movementFamily: base.movementFamily, difficulty });
      setAlts(options);
    })();
  }, [equipment, base?.slug, difficulty, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-4" role="dialog" aria-modal>
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-500">Swap exercise</div>
            <div className="text-lg font-semibold">{baseName}</div>
          </div>
          <button onClick={onClose} className="px-2 py-1 rounded border">Close</button>
        </div>

        <div className="mt-3">
          {loading && <div className="text-sm text-gray-500">Loading…</div>}
          {!loading && (
            <>
              {base && (
                <div className="mb-3">
                  <div className="text-xs text-gray-600 mb-1">Current</div>
                  <ExercisePreviewCard exercise={base} compact />
                  <button onClick={()=> onSelect(base.canonicalName, base)} className="mt-2 px-3 py-1.5 rounded text-xs border">Keep this</button>
                </div>
              )}
              <div className="flex items-center gap-2 flex-wrap text-xs">
                {Object.keys(equipment).map((key) => (
                  <label key={key} className={`px-2 py-1 rounded border cursor-pointer ${equipment[key as EquipmentFamily] ? 'bg-black text-white' : ''}`}>
                    <input type="checkbox" className="hidden" checked={!!equipment[key as EquipmentFamily]}
                      onChange={(e)=> setEquipment(v=> ({ ...v, [key]: e.target.checked }))} />
                    {key}
                  </label>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 max-h-80 overflow-auto">
                {alts.map(ex => (
                  <div key={ex.id || ex.slug} className="border rounded-xl p-2">
                    <ExercisePreviewCard exercise={ex} compact />
                    <div className="mt-2">
                      <button onClick={()=> onSelect(ex.canonicalName, ex)} className="px-3 py-1.5 rounded text-xs border bg-white hover:bg-gray-50">Use this</button>
                    </div>
                  </div>
                ))}
                {!alts.length && <div className="text-sm text-gray-500">No alternatives found.</div>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
