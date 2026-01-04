/**
 * Blocked Personal Email Domains
 *
 * These domains are blocked for B2B signups.
 * Users must sign up with a corporate/custom email domain.
 */

export const BLOCKED_PERSONAL_DOMAINS = [
  // Google
  "gmail.com",
  "googlemail.com",

  // Microsoft
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",

  // Yahoo
  "yahoo.com",
  "ymail.com",
  "yahoo.co.uk",
  "yahoo.co.in",

  // Apple
  "icloud.com",
  "me.com",
  "mac.com",

  // Other major providers
  "aol.com",
  "protonmail.com",
  "proton.me",
  "zoho.com",
  "mail.com",
  "gmx.com",
  "gmx.net",
  "yandex.com",
  "yandex.ru",
  "qq.com",
  "163.com",
  "126.com",
  "sina.com",

  // Temporary/disposable email services
  "tempmail.com",
  "guerrillamail.com",
  "mailinator.com",
  "10minutemail.com",
  "throwaway.email",
  "temp-mail.org",
];

/**
 * Check if an email address uses a personal/blocked domain.
 */
export function isPersonalEmail(email: string): boolean {
  const domain = extractDomain(email);
  if (!domain) return true; // Invalid email format, block it
  return BLOCKED_PERSONAL_DOMAINS.includes(domain);
}

/**
 * Extract the domain from an email address.
 * Returns null if the email format is invalid.
 */
export function extractDomain(email: string): string | null {
  const parts = email.toLowerCase().trim().split("@");
  if (parts.length !== 2 || !parts[1]) return null;
  return parts[1];
}

/**
 * Derive an organization name from a domain.
 * Examples:
 *   acme.com → "Acme"
 *   acme-corp.io → "Acme Corp"
 *   my_company.co.uk → "My Company"
 */
export function deriveOrgNameFromDomain(domain: string): string {
  // Get the first part of the domain (before the TLD)
  const namePart = domain.split(".")[0];

  // Split by hyphens and underscores, capitalize each word
  return namePart
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
