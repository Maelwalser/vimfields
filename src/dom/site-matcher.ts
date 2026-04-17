/**
 * Match the current hostname against a user-supplied list of disabled-site patterns.
 *
 * Supported pattern forms:
 *   - "example.com"        → matches example.com AND any subdomain (mail.example.com, …)
 *   - "*.example.com"      → matches subdomains only (mail.example.com), NOT example.com
 *   - "mail.example.com"   → matches that exact host AND deeper subdomains
 *   - "localhost"          → matches the literal hostname
 *
 * Patterns are normalized: lowercase, protocol/path/query stripped, leading "www."
 * removed. A URL pasted by the user (e.g. "https://mail.google.com/inbox") is
 * reduced to its hostname automatically.
 */

/**
 * Normalize a user-supplied site pattern to a comparable canonical form.
 * Returns an empty string when the input is not a usable pattern.
 */
export function normalizeSitePattern(raw: string): string {
  if (!raw) return "";
  let s = raw.trim().toLowerCase();
  if (!s) return "";

  // If a full URL was pasted, extract the hostname.
  if (/^[a-z][a-z0-9+.-]*:\/\//.test(s)) {
    try {
      s = new URL(s).hostname;
    } catch {
      // fall through — treat the rest as a raw pattern
    }
  }

  // Strip path/query/fragment if still present.
  s = s.split("/")[0].split("?")[0].split("#")[0];

  // Strip a port.
  s = s.replace(/:\d+$/, "");

  // A leading wildcard is preserved; otherwise strip "www."
  if (s.startsWith("*.")) {
    const rest = s.slice(2).replace(/^www\./, "");
    if (!rest) return "";
    return "*." + rest;
  }

  s = s.replace(/^www\./, "");

  // Reject patterns that would match anything (e.g. "", "*", "*.")
  if (!s || s === "*") return "";

  return s;
}

/**
 * Returns true when `hostname` should be considered disabled under `pattern`.
 * Both inputs are compared in their normalized form.
 */
export function matchesSite(hostname: string, pattern: string): boolean {
  const host = normalizeSitePattern(hostname);
  const pat = normalizeSitePattern(pattern);
  if (!host || !pat) return false;

  if (pat.startsWith("*.")) {
    const suffix = pat.slice(2);
    return host.endsWith("." + suffix);
  }

  return host === pat || host.endsWith("." + pat);
}

/** True when any pattern in the list matches the hostname. */
export function isHostDisabled(
  hostname: string,
  patterns: readonly string[],
): boolean {
  for (const pat of patterns) {
    if (matchesSite(hostname, pat)) return true;
  }
  return false;
}
