// Small utilities for Firestore writes

export function stripUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  // Remove top-level keys whose value is strictly undefined.
  // This prevents "Unsupported field value: undefined" from Firestore.
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as Partial<T>;
}
