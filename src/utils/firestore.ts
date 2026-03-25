// Small utilities for Firestore writes

function isPlainObject(value: any): value is Record<string, any> {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function stripUndefined<T>(value: T): T {
  if (value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    const cleaned = value
      .map(item => stripUndefined(item))
      .filter(item => item !== undefined);
    return cleaned as unknown as T;
  }

  if (value instanceof Date) {
    return value;
  }

  if (value && typeof (value as any).toDate === 'function') {
    return value;
  }

  if (isPlainObject(value)) {
    const cleaned: Record<string, any> = {};
    for (const [key, entry] of Object.entries(value)) {
      const sanitized = stripUndefined(entry);
      if (sanitized !== undefined) {
        cleaned[key] = sanitized;
      }
    }
    return cleaned as T;
  }

  return value;
}
