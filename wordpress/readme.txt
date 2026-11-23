=== AdSentinel ===
Contributors: adsentinel
Tags: adsentinel, adblock recovery, ad serving, head tags
Requires at least: 5.5
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.0.0
License: MIT
License URI: https://opensource.org/licenses/MIT

Dynamically injects this site's two AdSentinel serving tags into the top of every page's <head>, fetched from the AdSentinel control API, cached, and fail-open.

== Description ==

AdSentinel integrates a site into AdSentinel serving without hard-coding any tags
into your theme. On every front-end page render the plugin injects the two
AdSentinel serving tags at the very start of `<head>`.

The tags are not baked into the plugin: they are fetched at runtime from the
AdSentinel control API (`GET /plugin-support/get-script-js`) using this site's
credentials, so the current generation of tags is always served and can change
server-side without a plugin update. This mirrors the AdSentinel publisher edge
(the Cloudflare Snippet / Worker integration) in PHP.

Key properties:

* **Dynamic** — tags come from the control API, keyed on this site's host and
  credentials, never hard-coded.
* **Cached** — the response is cached in a transient for ~300 seconds (the
  control API's own `max-age`), so at most one request per 5 minutes.
* **Fail-open** — if the control API is unreachable or returns an error, the last
  good tags are served stale (kept up to 24h); if nothing is cached, nothing is
  emitted. The page is never broken or blocked.
* **Liveness-aware** — when a site's recovery is liveness-blocked the control API
  returns an empty HTML comment, which the plugin emits harmlessly (nothing
  meaningful is injected).

== Installation ==

1. Copy the `adsentinel` folder into `wp-content/plugins/`.
2. In the WordPress admin, go to **Plugins** and activate **AdSentinel**.
3. Go to **AdSentinel → Settings** and enter:
   * **Control origin** — leave as the default (`https://page-kit.io`) unless
     instructed otherwise.
   * **API ID** — the `adsentinel-plugin-api-id` value from the AdSentinel console
     (Domain → Serving).
   * **API key** — the matching `adsentinel-plugin-api-key` value.
4. Save. The tags are injected on the next front-end page load.

== Frequently Asked Questions ==

= Where do the credentials come from? =

From the AdSentinel console, under your domain's Serving settings. They are sent
to the control API as the `adsentinel-plugin-api-id` and
`adsentinel-plugin-api-key` request headers.

= Does a control API outage break my site? =

No. The plugin is fail-open: on any fetch failure it serves the last cached tags
(stale), or nothing if nothing is cached. The page always renders.

= How often is the control API called? =

At most once every ~300 seconds per cache entry. All other page views are served
from the transient cache.

== Manual test ==

There is no PHP test runner in this repository, so the plugin is verified with
`php -l` (syntax, run in CI) and the following manual checks in a WordPress
install:

1. **Install & activate**
   * Upload the release zip (`adsentinel-wordpress-<version>.zip`) in wp-admin →
     Plugins → Add New → Upload Plugin, or unzip it into `wp-content/plugins/`.
   * Activate **AdSentinel** in wp-admin → Plugins.

2. **Set credentials**
   * Go to **AdSentinel → Settings**.
   * Leave **Control origin** as the default, enter the **API ID** and **API key**
     from the AdSentinel console (Domain → Serving), and save.
   * The Status row should show the green "Credentials set" message.

3. **Confirm the two tags appear in `<head>`**
   * Load any front-end page and View Source.
   * The two AdSentinel serving tags should be present at the very top of
     `<head>` (before the theme's own tags).

4. **Confirm fail-open when the control API is unreachable**
   * Temporarily set **Control origin** to an unreachable host (e.g.
     `https://127.0.0.1:1`), which clears the cache.
   * Load a front-end page: it must still render normally (no error, no blocking,
     no fatal). With a previously cached value the stale tags are served; with no
     cache, no tags are emitted — the page is unaffected either way.
   * Restore the correct control origin afterwards.

== Changelog ==

= 1.0.0 =
* Initial release: dynamic, cached, fail-open injection of the two AdSentinel
  serving tags into `<head>`, with an AdSentinel → Settings page for the control
  origin and credentials.
