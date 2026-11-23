/**
 * Prepend the serving tags at the start of a page's `<head>`, on a plain HTML
 * string.
 *
 * Runtime-agnostic counterpart of the Cloudflare edge's `injectTags`
 * (`@adsentinel/cloudflare`), which uses Cloudflare's `HTMLRewriter`. Here the `<head>` opening tag is found case-insensitively and
 * the tags are inserted immediately after it, before any existing head
 * children — the same placement the rewriter's `prepend` produces.
 *
 * Fail-open: empty tags or a document with no `<head>` returns the html
 * unchanged; nothing throws into the host app.
 */

/** Matches the opening `<head ...>` tag, case-insensitive, with or without attributes. */
const HEAD_OPEN = /<head\b[^>]*>/i;

export function injectTagsIntoHtml(html: string, tags: string): string {
  if (!tags) return html;
  const match = HEAD_OPEN.exec(html);
  if (!match) return html;
  const insertAt = match.index + match[0].length;
  return html.slice(0, insertAt) + tags + html.slice(insertAt);
}
