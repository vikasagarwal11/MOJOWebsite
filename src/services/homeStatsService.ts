import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

export type HomeStatsSettings = {
  activeMembersCount: number;
  activeMembersShowPlusSign: boolean;
  monthlyEventsCount: number;
  monthlyEventsShowPlusSign: boolean;
  updatedAt?: any;
  updatedBy?: string;
};

const DEFAULT_HOME_STATS: HomeStatsSettings = {
  activeMembersCount: 190,
  activeMembersShowPlusSign: true,
  monthlyEventsCount: 2,
  monthlyEventsShowPlusSign: true,
};

const HOME_STATS_DOC = doc(db, 'appConfig', 'homeStats');

export async function getHomeStatsSettings(): Promise<HomeStatsSettings> {
  const snap = await getDoc(HOME_STATS_DOC);
  const data = snap.exists() ? (snap.data() as Partial<HomeStatsSettings>) : {};
  const merged = { ...DEFAULT_HOME_STATS, ...data } as HomeStatsSettings;

  const normalizedCount = Number.isFinite(Number(merged.activeMembersCount))
    ? Math.max(0, Math.round(Number(merged.activeMembersCount)))
    : DEFAULT_HOME_STATS.activeMembersCount;

  const normalizeBoolean = (value: unknown) =>
    value === false || value === 'false' || value === 0 || value === '0' ? false : true;

  const normalizedActiveMembersShowPlus = normalizeBoolean(
    (merged as any).activeMembersShowPlusSign ?? (merged as any).showPlusSign
  );

  const normalizedMonthlyEventsCount = Number.isFinite(Number(merged.monthlyEventsCount))
    ? Math.max(0, Math.round(Number(merged.monthlyEventsCount)))
    : DEFAULT_HOME_STATS.monthlyEventsCount;

  const normalizedMonthlyEventsShowPlus = normalizeBoolean(merged.monthlyEventsShowPlusSign);

  return {
    ...merged,
    activeMembersCount: normalizedCount,
    activeMembersShowPlusSign: normalizedActiveMembersShowPlus,
    monthlyEventsCount: normalizedMonthlyEventsCount,
    monthlyEventsShowPlusSign: normalizedMonthlyEventsShowPlus,
  };
}

export async function updateHomeStatsSettings(
  partial: Partial<HomeStatsSettings>,
  userId: string
): Promise<void> {
  const safePartial: Partial<HomeStatsSettings> = { ...partial };

  if (safePartial.activeMembersCount !== undefined) {
    const normalized = Number.isFinite(Number(safePartial.activeMembersCount))
      ? Math.max(0, Math.round(Number(safePartial.activeMembersCount)))
      : DEFAULT_HOME_STATS.activeMembersCount;
    safePartial.activeMembersCount = normalized;
  }

  if (safePartial.monthlyEventsCount !== undefined) {
    const normalized = Number.isFinite(Number(safePartial.monthlyEventsCount))
      ? Math.max(0, Math.round(Number(safePartial.monthlyEventsCount)))
      : DEFAULT_HOME_STATS.monthlyEventsCount;
    safePartial.monthlyEventsCount = normalized;
  }

  if (safePartial.activeMembersShowPlusSign !== undefined) {
    safePartial.activeMembersShowPlusSign = !!safePartial.activeMembersShowPlusSign;
  }

  if (safePartial.monthlyEventsShowPlusSign !== undefined) {
    safePartial.monthlyEventsShowPlusSign = !!safePartial.monthlyEventsShowPlusSign;
  }

  await setDoc(
    HOME_STATS_DOC,
    {
      ...safePartial,
      updatedAt: serverTimestamp(),
      updatedBy: userId,
    },
    { merge: true }
  );
}
