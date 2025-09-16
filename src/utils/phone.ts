/** Normalize phone numbers to their last 10 digits for consistent session keys. */
export function normalizePhone(raw: string): string {
  if (!raw) return "";
  // Remove leading + and any non-digit characters
  const digits = raw.replace(/^\+/, "").replace(/[^\d]/g, "");
  // Use last 10 digits to collapse country/leading zeros differences
  return digits.slice(-10);
}
