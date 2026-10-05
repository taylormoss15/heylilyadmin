// Keep the preview and actual outreach delivery pointed at the same addresses.
export function outreachRecipients(prospect: { email: string | null; leadEmail: string | null }): string[] {
  return [...new Set([prospect.email, prospect.leadEmail]
    .flatMap((value) => (value || "").split(/[;,\s]+/))
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean))];
}
