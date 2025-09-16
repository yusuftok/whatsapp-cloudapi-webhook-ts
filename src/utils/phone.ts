/** Normalize phone numbers to their last 10 digits for consistent session keys. */
export function normalizePhone(raw: string): string {
  if (!raw) return "";
  // Remove leading + and any non-digit characters
  const digits = raw.replace(/^\+/, "").replace(/[^\d]/g, "");
  if (!digits) return "";

  const lastDigits = digits.slice(-10);
  // Pad with leading zeros if the remaining digits are shorter than 10
  return lastDigits.padStart(10, "0");
}
