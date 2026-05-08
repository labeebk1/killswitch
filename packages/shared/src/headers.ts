/**
 * Rewrite HTTP response headers coming from a dev server before forwarding
 * to viewer iframes or back through the tunnel.
 *
 * Rules:
 *   - Drop X-Frame-Options (iframe must be embeddable)
 *   - Rewrite CSP frame-ancestors to 'none' (origin isolation handles sandboxing)
 *   - Append SameSite=None; Secure to Set-Cookie values missing them
 */
export function rewriteTunnelHeaders(
  headers: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    const lower = k.toLowerCase();

    if (lower === "x-frame-options") continue;

    if (lower === "content-security-policy") {
      out[k] = v
        .replace(/frame-ancestors[^;]*(;|$)/gi, "frame-ancestors 'none'$1")
        .trim();
      continue;
    }

    if (lower === "set-cookie") {
      // Split multi-cookie headers only on commas that precede a new cookie
      // name (a letter-starting token followed by `=`).  This avoids splitting
      // on commas inside `expires=Thu, 01 Jan 1970` date values.
      const cookies = v.split(/,\s*(?=[a-zA-Z][a-zA-Z0-9_-]*\s*=)/);
      out[k] = cookies
        .map((cookie) => {
          let c = cookie;
          if (!/samesite/i.test(c)) c += "; SameSite=None";
          if (!/\bSecure\b/i.test(c)) c += "; Secure";
          return c;
        })
        .join(", ");
      continue;
    }

    out[k] = v;
  }
  return out;
}
