
import { EventDoc } from '../hooks/useEvents';

export function computeCapacity(event: EventDoc, goingCount: number) {
  const max = event.maxAttendees ?? null;
  const isFull = max != null && goingCount >= max;
  const pct = max ? Math.min(100, Math.round((goingCount / max) * 100)) : null;
  return { max, goingCount, isFull, pct };
}

export function visibilityPill(v?: string) {
  if (v === 'public') return { text: 'Public', tone: 'green' };
  if (v === 'members') return { text: 'Members', tone: 'purple' };
  if (v === 'private') return { text: 'Private', tone: 'gray' };
  return { text: 'Unknown', tone: 'gray' };
}
