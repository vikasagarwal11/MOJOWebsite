import React, { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, X, ChevronRight, ChevronLeft, Timer } from "lucide-react";

/** ---------- Data ---------- */
type Step = { title: string; instructions: string; durationSec: number };
type MicroWorkout = {
  id: string;
  title: string;
  emoji: string;
  color: string;          // bg for icon chip
  cardBg: string;         // soft card background
  cta: string;
  est: string;            // "(5 min)"
  equipment?: string;
  steps: Step[];
};

const WORKOUTS: MicroWorkout[] = [
  {
    id: "stretch-5",
    title: "5-Minute Stretch",
    emoji: "🧘‍♀️",
    color: "bg-indigo-600",
    cardBg: "from-indigo-50 to-blue-50",
    cta: "Start now",
    est: "(5 min)",
    steps: [
      { title: "Neck rolls", instructions: "Slow circles, both directions. Shoulders relaxed.", durationSec: 40 },
      { title: "Shoulder rolls", instructions: "Forward 20s, backward 20s. Breathe.", durationSec: 40 },
      { title: "Cat–Cow", instructions: "Arch and round your spine with breath.", durationSec: 50 },
      { title: "Hip flexor stretch (R)", instructions: "Half-kneel, tuck pelvis, gentle lean.", durationSec: 45 },
      { title: "Hip flexor stretch (L)", instructions: "Repeat on left side.", durationSec: 45 },
      { title: "Hamstring fold", instructions: "Soft knees, hinge and breathe.", durationSec: 40 },
      { title: "Chest opener", instructions: "Clasp hands behind, lift gently.", durationSec: 40 }
    ]
  },
  {
    id: "strength-10",
    title: "10-Minute Strength",
    emoji: "💪",
    color: "bg-orange-600",
    cardBg: "from-orange-50 to-rose-50",
    cta: "Start now",
    est: "(10 min)",
    equipment: "Light dumbbells (or water bottles)",
    steps: [
      { title: "Squats", instructions: "Feet shoulder-width, sit back, chest tall.", durationSec: 45 },
      { title: "Rest", instructions: "Shake it out.", durationSec: 15 },
      { title: "Push-ups / incline", instructions: "Knees or counter if needed.", durationSec: 45 },
      { title: "Rest", instructions: "Breathe.", durationSec: 15 },
      { title: "Rows", instructions: "Hinge at hips, squeeze shoulder blades.", durationSec: 45 },
      { title: "Rest", instructions: "Relax your grip.", durationSec: 15 },
      { title: "Reverse lunges", instructions: "Alternate legs, slow and controlled.", durationSec: 45 },
      { title: "Rest", instructions: "Tall posture.", durationSec: 15 },
      { title: "Overhead press", instructions: "Ribs down, soft knees.", durationSec: 45 },
      { title: "Rest", instructions: "Last push coming!", durationSec: 15 },
      { title: "Dead bug (core)", instructions: "Low back down, slow opposite arm/leg.", durationSec: 45 },
      { title: "Box breathing", instructions: "In 4 • hold 4 • out 4 • hold 4.", durationSec: 60 }
    ]
  },
  {
    id: "reset-60",
    title: "60-Second Reset",
    emoji: "🫁",
    color: "bg-emerald-600",
    cardBg: "from-emerald-50 to-green-50",
    cta: "Start now",
    est: "(1 min)",
    steps: [
      { title: "Box breathing", instructions: "Inhale 4 • Hold 4 • Exhale 4 • Hold 4. Repeat.", durationSec: 60 }
    ]
  }
];

/** ---------- Helpers ---------- */
function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** ---------- Modal ---------- */
const MicroWorkoutModal: React.FC<{
  workout: MicroWorkout;
  onClose: () => void;
}> = ({ workout, onClose }) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [remaining, setRemaining] = useState(workout.steps[0].durationSec);
  const [running, setRunning] = useState(true);
  const intervalRef = useRef<number | null>(null);

  const totalSec = useMemo(
    () => workout.steps.reduce((sum, s) => sum + s.durationSec, 0),
    [workout]
  );
  const elapsed = useMemo(
    () =>
      workout.steps
        .slice(0, stepIndex)
        .reduce((sum, s) => sum + s.durationSec, 0) +
      (workout.steps[stepIndex].durationSec - remaining),
    [workout, stepIndex, remaining]
  );
  const progress = Math.min(100, Math.round((elapsed / totalSec) * 100));
  const step = workout.steps[stepIndex];

  useEffect(() => {
    if (!running) {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      intervalRef.current = null;
      return;
    }
    intervalRef.current = window.setInterval(() => {
      setRemaining((r) => {
        if (r > 1) return r - 1;
        // step finished
        if (stepIndex < workout.steps.length - 1) {
          setStepIndex((i) => i + 1);
          return workout.steps[stepIndex + 1].durationSec;
        }
        // workout finished
        window.clearInterval(intervalRef.current!);
        intervalRef.current = null;
        setRunning(false);
        return 0;
      });
      return 0; // TS appeasement; value replaced above
    }, 1000) as unknown as number;

    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [running, stepIndex, workout]);

  // Reset remaining whenever step changes
  useEffect(() => {
    setRemaining(workout.steps[stepIndex].durationSec);
  }, [stepIndex, workout]);

  const prev = () => {
    if (stepIndex === 0) return;
    setStepIndex((i) => i - 1);
    setRemaining(workout.steps[stepIndex - 1].durationSec);
  };
  const next = () => {
    if (stepIndex >= workout.steps.length - 1) return;
    setStepIndex((i) => i + 1);
    setRemaining(workout.steps[stepIndex + 1].durationSec);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 ${workout.color} text-white rounded-xl grid place-content-center text-lg`}>{workout.emoji}</div>
            <div>
              <h3 className="font-semibold">{workout.title}</h3>
              <p className="text-xs text-gray-500 flex items-center gap-1"><Timer className="w-3 h-3" /> {formatTime(totalSec)}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        {/* Progress */}
        <div className="px-4 pt-4">
          <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full bg-[#F25129] transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-2 text-xs text-gray-500">{progress}% complete</div>
        </div>

        {/* Body */}
        <div className="p-6">
          <div className="text-sm text-gray-500 mb-1">Step {stepIndex + 1} of {workout.steps.length}</div>
          <h4 className="text-2xl font-bold mb-2">{step.title}</h4>
          <p className="text-gray-700 mb-6">{step.instructions}</p>

          <div className="text-4xl sm:text-5xl font-bold tabular-nums text-gray-900 mb-6">{formatTime(remaining)}</div>

          {workout.equipment && (
            <div className="mb-4 text-sm text-gray-600"><span className="font-medium">Equipment:</span> {workout.equipment}</div>
          )}

          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={prev}
                disabled={stepIndex === 0}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border disabled:opacity-40 text-sm"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
              <button
                onClick={() => setRunning((r) => !r)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#F25129] text-white hover:brightness-110 text-sm flex-1 sm:flex-none"
              >
                {running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {running ? "Pause" : "Resume"}
              </button>
              <button
                onClick={next}
                disabled={stepIndex >= workout.steps.length - 1}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border disabled:opacity-40 text-sm"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <a
              href={`/microworkouts/${workout.id}`}
              className="text-sm text-[#F25129] hover:underline text-center sm:text-left"
            >
              Open full page
            </a>
          </div>

          <p className="mt-6 text-xs text-gray-500">
            Listen to your body. Skip anything that hurts; consult your clinician if you have concerns.
          </p>
        </div>
      </div>
    </div>
  );
};

/** ---------- Card ---------- */
const MicroWorkoutCard: React.FC<{
  w: MicroWorkout;
  onStart: (w: MicroWorkout) => void;
}> = ({ w, onStart }) => (
  <div className={`group p-6 rounded-2xl bg-gradient-to-br ${w.cardBg} border border-gray-200 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-2`}>
    <div className={`w-16 h-16 ${w.color} rounded-2xl flex items-center justify-center text-white mb-4 group-hover:scale-110 transition-transform duration-300`}>
      <span className="text-2xl">{w.emoji}</span>
    </div>
    <h3 className="text-xl font-semibold text-gray-900 mb-3">{w.title}</h3>
    <p className="text-gray-600 leading-relaxed mb-4">
      {w.id === "stretch-5" && "Perfect for between meetings or after school pickup. Gentle movements to release tension and boost energy."}
      {w.id === "strength-10" && "Build strength with simple dumbbell moves you can do at home. No gym required, just 10 minutes."}
      {w.id === "reset-60" && "Instant calm for those overwhelming moments. Simple breathing technique to reset your nervous system."}
    </p>
    <button
      onClick={() => onStart(w)}
      className="w-full px-4 py-2 bg-gradient-to-r from-[#F25129] to-[#FFC107] text-white rounded-lg hover:from-[#E0451F] hover:to-[#E55A2A] transition-colors font-medium"
    >
      {w.cta} {w.est}
    </button>
  </div>
);

/** ---------- Section (export this) ---------- */
export const MicroWorkoutsSection: React.FC = () => {
  const [active, setActive] = useState<MicroWorkout | null>(null);

  return (
    <section id="quick-wins" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="text-center mb-12">
        <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
          Quick Wins for Busy Moms
        </h2>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          No time? No problem. Start with these 10-minute (or less) wellness moments.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {WORKOUTS.map((w) => (
          <MicroWorkoutCard key={w.id} w={w} onStart={setActive} />
        ))}
      </div>

      {active && <MicroWorkoutModal workout={active} onClose={() => setActive(null)} />}
    </section>
  );
};
