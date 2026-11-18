// UX validation only; Supabase's signup hook remains the eligibility authority.
export const ALLOWED_DOMAINS_HINT = "Works with Gmail, Outlook or any school (.edu) address."
export const DISALLOWED_DOMAIN_ERROR = "Use a Gmail, Outlook.com, or school (.edu) email address."
export const EMAIL_CODE_LENGTH = 8
export function isAllowedEmailDomain(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@")[1] ?? ""
  return ["gmail.com", "outlook.com"].includes(domain) || /\.edu(\.[a-z]{2})?$/.test(domain)
}
export function emailValidationError(email: string): string | null {
  if (!email.trim()) return "Enter your email address."
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Enter a valid email address."
  return isAllowedEmailDomain(email) ? null : DISALLOWED_DOMAIN_ERROR
}
export function isEmailCode(code: string): boolean { return /^\d{8}$/.test(code.trim()) }
