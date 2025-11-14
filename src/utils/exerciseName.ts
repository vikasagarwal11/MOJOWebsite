export function stripPrescription(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/^[•\-\s]+/, '') // leading bullets/dashes
    .replace(/\s*(\d+\s*[xX]\s*\d+.*|\d+\s*(?:s|sec|secs|second|seconds|min|mins|minute|minutes).*$|\d+\/side.*$|\d+\s*(?:per|each)\s*side.*$)/i, '')
    .replace(/\s*(?:for|x)\s*\d+\s*(?:rounds?|sets?).*$/i, '')
    .trim();
}

export function normalizeExerciseName(raw: string): string {
  const base = stripPrescription(raw);
  return base
    .replace(/\s*\(.*?\)\s*$/, '') // drop trailing parentheses notes
    .replace(/\s{2,}/g, ' ')
    .trim();
}

