import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

type ApplyReq = { planId?: string };
type ApplyResp = { adjustment: { avgRpe: number; minutesDelta: number; suggestion: 'increase'|'hold'|'decrease'|'swap_mobility'; evaluatedAt: string | Date; coachNote?: string } };

const applyFn = httpsCallable<ApplyReq, ApplyResp>(functions, 'applyAdaptiveProgression');

export async function applyAdaptiveProgression(planId?: string) {
  const res = await applyFn({ planId });
  return res.data.adjustment;
}

