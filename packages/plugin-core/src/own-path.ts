/**
 * Whether a request path belongs to AdSentinel and must be relayed to the
 * serving host rather than served by the site's own origin.
 *
 * True when the path's first segment is one of the bundle's route prefixes, OR
 * the path matches one of AdSentinel's own endpoint paths (a trailing-slash
 * entry by prefix, a bare entry by equality or followed by a query string).
 */
import type { EdgeBundle } from './types.js';

export function isOwnPath(pathname: string, bundle: Pick<EdgeBundle, 'ownPaths' | 'routePrefixes'>): boolean {
  const first = pathname.split('/')[1] || '';
  if (first && bundle.routePrefixes.includes(first)) return true;
  return bundle.ownPaths.some((p) => (p.endsWith('/') ? pathname.startsWith(p) : pathname === p || pathname.startsWith(p + '?')));
}
