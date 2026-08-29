export function normalizeReleaseSha(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function consistentHeaderValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const values = value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (values.length === 0) return null;
  const unique = new Set(values);
  return unique.size === 1 ? values[0] : null;
}

export function validReleaseSha(value: unknown): value is string {
  const normalized = normalizeReleaseSha(value);
  return /^[a-f0-9]{40}$/.test(normalized) && !/^0+$/.test(normalized);
}

export function assertCompiledReleaseSha(
  value: unknown,
  options: { localDevelopment: boolean },
): string | null {
  const normalized = normalizeReleaseSha(value);
  if (options.localDevelopment && normalized === "") return null;
  if (!validReleaseSha(normalized)) {
    throw new Error(
      "Production Relay requires VITE_RELEASE_SHA to be the exact non-zero 40-character Git commit deployed across all four origins.",
    );
  }
  return normalized;
}
