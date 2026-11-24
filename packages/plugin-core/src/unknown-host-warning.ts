/**
 * The one warning the package logs on its own: the edge-bundle endpoint does not
 * know the host it was asked for.
 *
 * Everything else fails open silently, but an unknown host almost always means
 * a misconfiguration the publisher can fix (the app sits behind a reverse proxy
 * and sees the proxy's upstream host), and without a hint nothing is injected
 * and nothing says why. Logged once per process, so a busy server does not
 * flood its logs.
 */
import { SITE_HOST_ENV } from './site-host.js';

let warned = false;

/** The warning text for an unknown host. */
export function unknownHostMessage(siteHost: string | undefined): string {
  return (
    `[adsentinel] The AdSentinel edge-bundle endpoint answered "unknown host" for host "${siteHost ?? ''}", ` +
    'so no tags are injected. If this server sits behind a reverse proxy, CDN or gateway, it is probably seeing ' +
    `an internal host: set the \`siteHost\` option (or the ${SITE_HOST_ENV} environment variable) to the site's ` +
    'public host, e.g. "www.example.com".'
  );
}

/** Log {@link unknownHostMessage} the first time this is called in the process; later calls are no-ops. */
export function warnUnknownHostOnce(siteHost: string | undefined, warn: (message: string) => void = console.warn): void {
  if (warned) return;
  warned = true;
  try {
    warn(unknownHostMessage(siteHost));
  } catch {
    // A broken logger must never break the host app.
  }
}

/** Re-arm the once-per-process warning. For tests only. */
export function resetUnknownHostWarning(): void {
  warned = false;
}
