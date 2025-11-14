import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

export type PlanIntake = {
  goal: 'fat_loss' | 'strength' | 'mobility' | 'general';
  daysPerWeek: 2 | 3 | 4 | 5;
  minutesPerSession: 10 | 20 | 30 | 45;
  level: 'beginner' | 'intermediate' | 'advanced';
  equipment: Array<'none' | 'bands' | 'dumbbells' | 'kettlebell' | 'barbell' | 'treadmill' | 'bike'>;
  postpartum?: boolean;
  environment?: 'home' | 'gym' | 'outdoors';
  restrictions?: string[];
};

export type ReadinessInput = {
  sleep: 1 | 2 | 3 | 4 | 5;       // 1=poor, 5=great
  stress: 1 | 2 | 3 | 4 | 5;      // 1=high, 5=low
  timeAvailable: 5 | 10 | 20 | 30 | 45; // minutes
  soreness?: 0 | 1 | 2 | 3;       // 0=none
};

type GeneratePlanResp = { planId: string };
type SuggestionResp = {
  suggestion: {
    type: 'strength' | 'hiit' | 'mobility' | 'walk' | 'rest';
    minutes: number;
    title: string;
    note?: string;
  };
};

const generatePlanFn = httpsCallable<PlanIntake, GeneratePlanResp>(functions, 'generateWorkoutPlan');
const getDailySuggestionFn = httpsCallable<ReadinessInput, SuggestionResp>(functions, 'getDailyWorkoutSuggestion');

export async function generateWorkoutPlan(intake: PlanIntake): Promise<string> {
  const res = await generatePlanFn(intake);
  return (res.data as GeneratePlanResp).planId;
}

export async function getDailyWorkoutSuggestion(readiness: ReadinessInput) {
  const res = await getDailySuggestionFn(readiness);
  return (res.data as SuggestionResp).suggestion;
}
