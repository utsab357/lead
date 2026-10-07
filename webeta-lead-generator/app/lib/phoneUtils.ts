/**
 * Canonical Phone & WhatsApp Normalization Utility
 *
 * Handles all Indian phone number variations:
 * - Standard 10-digit mobile: "9831234567"
 * - Trunk 0 prefix (11 digits): "09831234567"
 * - Country code 91 + 10 digits (12 digits): "919831234567"
 * - Country code 91 + trunk 0 + 10 digits (13 digits): "9109831234567"
 * - International 0091 + 10 digits (14 digits): "00919831234567"
 * - Formatted strings: "+91 98312-34567", "(09831) 234567", etc.
 */

/** Extract clean 10-digit national subscriber number */
export function normalizePhone10(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  let n = digits;
  if (n.startsWith("0091") && n.length === 14) n = n.slice(4);
  else if (n.startsWith("910") && n.length === 13) n = n.slice(3);
  else if (n.startsWith("91") && n.length === 12) n = n.slice(2);
  else if (n.startsWith("0") && n.length === 11) n = n.slice(1);
  // Only accept exact 10-digit subscriber numbers after recognized Indian prefix stripping
  return n.length === 10 ? n : "";
}

/** Extract 12-digit international WhatsApp number: "91" + 10 digits */
export function toWhatsAppNumber(raw: string | null | undefined): string {
  const ten = normalizePhone10(raw);
  if (ten) return `91${ten}`;
  return "";
}

/** Format for standard display e.g. "+91 98312 34567" */
export function formatPhoneDisplay(raw: string | null | undefined): string {
  const ten = normalizePhone10(raw);
  if (ten) return `+91 ${ten.slice(0, 5)} ${ten.slice(5)}`;
  if (!raw) return "n/a";
  return raw;
}

/** Format for spec display e.g. "+91 9831234567" */
export function cleanPhone(raw: string | null | undefined): string {
  const ten = normalizePhone10(raw);
  if (ten) return `+91 ${ten}`;
  return "n/a";
}

/** Generate a 100% valid WhatsApp chat link */
export function createWhatsAppUrl(
  rawPhone: string | null | undefined,
  businessName?: string,
  customText?: string
): string {
  const waNum = toWhatsAppNumber(rawPhone);
  if (!waNum) return "#";
  const text = customText !== undefined ? customText : (businessName ? `Hello ${businessName}` : "Hello");
  return `https://wa.me/${waNum}?text=${encodeURIComponent(text)}`;
}
