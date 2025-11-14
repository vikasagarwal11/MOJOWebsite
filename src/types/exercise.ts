// Exercise catalog types for canonical exercises and variants

export type MovementFamily =
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'push'
  | 'pull'
  | 'carry'
  | 'core'
  | 'mobility'
  | 'cardio'
  | 'other';

export type EquipmentFamily =
  | 'bodyweight'
  | 'dumbbells'
  | 'barbell'
  | 'kettlebell'
  | 'bands'
  | 'machines'
  | 'bench'
  | 'box'
  | 'medicine_ball'
  | 'other';

export type Environment = 'home' | 'gym' | 'outdoors';

export type MetricType = 'reps' | 'time' | 'distance' | 'weight';

export interface ExerciseMedia {
  // Storage paths (preferred)
  posterPath?: string; // e.g., exercise-media/processed/slug/poster.jpg
  loopPath?: string;   // e.g., exercise-media/processed/slug/loop.mp4
  hlsPath?: string;    // e.g., exercise-media/processed/slug/hls/index.m3u8

  // Legacy/direct URLs (fallback)
  posterUrl?: string; // static preview image (webp/jpg)
  loopUrl?: string; // short 3–5s looping clip (mp4/webm)
  hlsUrl?: string; // HLS playlist for full how-to video
  captionsUrl?: string; // VTT captions
  aspect?: '16:9' | '1:1' | '9:16';
  loopDuration?: number; // seconds
}

export interface ExerciseDoc {
  id?: string; // Firestore doc id (optional on read)
  canonicalName: string;
  slug: string;
  synonyms?: string[];
  translations?: Record<string, { name: string; instructions?: string[] }>; // e.g., { 'es': { name: 'Sentadilla' } }

  movementFamily: MovementFamily;
  primaryMuscles: string[];
  secondaryMuscles?: string[];
  modality?: 'strength' | 'mobility' | 'conditioning' | 'rehab' | 'warmup' | 'cooldown';
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  metricType?: MetricType;
  unilateral?: boolean; // left/right

  environments?: Environment[]; // where it works best
  requiredEquipment?: EquipmentFamily[];
  optionalEquipment?: EquipmentFamily[];

  instructions?: string[]; // ordered coaching steps
  coachingCues?: string[];
  commonMistakes?: string[];
  safetyNotes?: string;

  media?: ExerciseMedia;

  // Relationships
  regressions?: string[]; // exercise slugs
  progressions?: string[]; // exercise slugs
  alternatives?: string[]; // equipment-based or similar pattern

  // Ops
  status?: 'draft' | 'published';
  lastReviewedAt?: any;
  version?: number;
}

export interface ExerciseVariantDoc {
  id?: string;
  parentSlug: string; // canonical parent
  equipment: EquipmentFamily[];
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  instructions?: string[];
  media?: ExerciseMedia;
  status?: 'draft' | 'published';
}
