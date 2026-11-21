/**
 * Validates that an external URL uses an explicit http:// or https:// scheme.
 * Rejects javascript:, data:, vbscript:, file:, protocol-relative, or malformed URLs.
 */
export function safeExternalUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}
