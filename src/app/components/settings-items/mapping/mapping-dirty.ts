/**
 * Morse Code Studio
 */

/**
 * True when the editor's current fields differ from the mapping they started from (nothing validated or
 * stored). Same comparison as the wizard's mapping page, so an untouched editor is never "dirty".
 */
export function mappingFieldsDirty(fields: object | undefined, stored: object): boolean {
  if (!fields) return false;
  const current = fields as Record<string, unknown>;
  const original = stored as Record<string, unknown>;
  return Object.keys(current).some(key => JSON.stringify(current[key] ?? '') !== JSON.stringify(original[key] ?? ''));
}
