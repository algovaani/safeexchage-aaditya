/** Split comma-separated env values into a trimmed string array. */
export function parseEnvList(value) {
  if (!value || typeof value !== 'string') return [];
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}
