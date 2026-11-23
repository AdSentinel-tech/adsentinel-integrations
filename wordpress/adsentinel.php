<?php
/**
 * Plugin Name:       AdSentinel
 * Plugin URI:        https://page-kit.io/
 * Description:       Dynamically injects the site's two AdSentinel serving tags into the top of every page's <head>, fetched from the AdSentinel control API with the site's credentials, cached, and fail-open.
 * Version:           1.0.0
 * Requires at least: 5.5
 * Requires PHP:      7.4
 * Author:            AdSentinel
 * Author URI:        https://adsentinel.tech/
 * License:           MIT
 * License URI:       https://opensource.org/licenses/MIT
 * Text Domain:       adsentinel
 *
 * Same behaviour as the other AdSentinel integrations (see @adsentinel/plugin-core
 * and @adsentinel/cloudflare in this repository): it fetches the site's serving tags from the control API's GET
 * /plugin-support/get-script-js endpoint, caches them for ~300s, injects them
 * at the start of <head>, and fails open — a control-plane outage, bad
 * credentials, or a liveness-blocked site never breaks or blocks the page.
 */

defined( 'ABSPATH' ) || exit;

/** Default control / serving origin (same default as @adsentinel/plugin-core). */
define( 'ADSENTINEL_DEFAULT_CONTROL_ORIGIN', 'https://page-kit.io' );

/** The control API path that returns the two serving tags as an HTML string. */
define( 'ADSENTINEL_SCRIPT_PATH', '/plugin-support/get-script-js' );

/**
 * Credential request header names the control API reads (same as
 * API_ID_HEADER / API_KEY_HEADER in @adsentinel/plugin-core).
 */
define( 'ADSENTINEL_API_ID_HEADER', 'adsentinel-plugin-api-id' );
define( 'ADSENTINEL_API_KEY_HEADER', 'adsentinel-plugin-api-key' );

/** Option names (stored in wp_options). */
define( 'ADSENTINEL_OPTION_CONTROL_ORIGIN', 'adsentinel_control_origin' );
define( 'ADSENTINEL_OPTION_API_ID', 'adsentinel_api_id' );
define( 'ADSENTINEL_OPTION_API_KEY', 'adsentinel_api_key' );

/** Transient keys: the fresh (short-lived) copy and the stale (fail-open) backup. */
define( 'ADSENTINEL_TRANSIENT_FRESH', 'adsentinel_tags_fresh' );
define( 'ADSENTINEL_TRANSIENT_STALE', 'adsentinel_tags_stale' );

/** Fresh cache lifetime in seconds — the control API's own max-age=300. */
define( 'ADSENTINEL_CACHE_TTL', 300 );

/**
 * How long the stale backup is kept, so a control-plane outage keeps serving
 * the last good tags (the Cloudflare edge in @adsentinel/cloudflare keeps the bundle 24h for the same reason).
 */
define( 'ADSENTINEL_STALE_TTL', DAY_IN_SECONDS );

/** HTTP timeout for the control API call — short, so a hung API never stalls a page. */
define( 'ADSENTINEL_HTTP_TIMEOUT', 2 );

/**
 * The control origin, trimmed of trailing slashes; the default when unset.
 *
 * @return string
 */
function adsentinel_control_origin() {
	$origin = (string) get_option( ADSENTINEL_OPTION_CONTROL_ORIGIN, ADSENTINEL_DEFAULT_CONTROL_ORIGIN );
	$origin = trim( $origin );
	if ( '' === $origin ) {
		$origin = ADSENTINEL_DEFAULT_CONTROL_ORIGIN;
	}
	return rtrim( $origin, '/' );
}

/**
 * The site host the tags are asked for — the registered domain of this site.
 *
 * @return string
 */
function adsentinel_site_host() {
	$host = wp_parse_url( home_url(), PHP_URL_HOST );
	return is_string( $host ) ? $host : '';
}

/**
 * The configured credentials, or null when either is missing.
 *
 * @return array{id:string,key:string}|null
 */
function adsentinel_credentials() {
	$id  = trim( (string) get_option( ADSENTINEL_OPTION_API_ID, '' ) );
	$key = trim( (string) get_option( ADSENTINEL_OPTION_API_KEY, '' ) );
	if ( '' === $id || '' === $key ) {
		return null;
	}
	return array(
		'id'  => $id,
		'key' => $key,
	);
}

/**
 * Fetch the two serving tags from the control API.
 *
 * Returns the HTML string on success (which may be an empty HTML comment when
 * the site's recovery is liveness-blocked — that is a valid success, not an
 * error), or null on any failure (network error, non-2xx status).
 *
 * @return string|null
 */
function adsentinel_fetch_tags() {
	$credentials = adsentinel_credentials();
	$host        = adsentinel_site_host();
	if ( null === $credentials || '' === $host ) {
		return null;
	}

	$url = adsentinel_control_origin() . ADSENTINEL_SCRIPT_PATH . '?host=' . rawurlencode( $host );

	$response = wp_remote_get(
		$url,
		array(
			'timeout'     => ADSENTINEL_HTTP_TIMEOUT,
			'redirection' => 2,
			'headers'     => array(
				ADSENTINEL_API_ID_HEADER  => $credentials['id'],
				ADSENTINEL_API_KEY_HEADER => $credentials['key'],
			),
		)
	);

	if ( is_wp_error( $response ) ) {
		return null;
	}

	$code = (int) wp_remote_retrieve_response_code( $response );
	if ( $code < 200 || $code >= 300 ) {
		// 403/404 (unknown host / unauthorized) and any 5xx fall through to the
		// stale backup; an unconfigured site therefore simply serves nothing.
		return null;
	}

	// The body is the serving-tags HTML (text/html); an empty string is valid.
	return (string) wp_remote_retrieve_body( $response );
}

/**
 * The serving-tags HTML to inject: the fresh cached copy while it lasts, else a
 * fresh fetch (cached on success), else the stale backup, else an empty string.
 *
 * Mirrors loadBundle() in @adsentinel/cloudflare: one network call per TTL, and on failure the
 * last good value is served stale rather than nothing (fail-open).
 *
 * @return string
 */
function adsentinel_get_tags_html() {
	$fresh = get_transient( ADSENTINEL_TRANSIENT_FRESH );
	if ( false !== $fresh ) {
		return (string) $fresh;
	}

	$tags = adsentinel_fetch_tags();
	if ( null !== $tags ) {
		// Cache the fresh copy for its TTL and refresh the long-lived backup.
		set_transient( ADSENTINEL_TRANSIENT_FRESH, $tags, ADSENTINEL_CACHE_TTL );
		set_transient( ADSENTINEL_TRANSIENT_STALE, $tags, ADSENTINEL_STALE_TTL );
		return $tags;
	}

	$stale = get_transient( ADSENTINEL_TRANSIENT_STALE );
	if ( false !== $stale ) {
		return (string) $stale;
	}

	return '';
}

/**
 * Emit the serving tags at the very top of <head>.
 *
 * Hooked on wp_head at an early priority. The tags are first-party HTML from
 * our own control API (script elements that must execute), so they are printed
 * verbatim — escaping them would break them. Everything that could fail is
 * guarded; this never throws and never blocks the page.
 */
function adsentinel_print_tags() {
	// Only on real front-end page renders.
	if ( is_admin() || is_feed() || is_embed() ) {
		return;
	}
	if ( null === adsentinel_credentials() ) {
		return;
	}

	$html = adsentinel_get_tags_html();
	if ( ! is_string( $html ) || '' === trim( $html ) ) {
		return;
	}

	// A liveness-blocked site returns only an HTML comment: emitting it is
	// harmless (nothing meaningful), so no special-casing is needed.
	echo "\n" . $html . "\n"; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- trusted first-party tag HTML from the AdSentinel control API; must not be escaped.
}
add_action( 'wp_head', 'adsentinel_print_tags', 1 );

/**
 * Drop both cached copies, e.g. when credentials or the control origin change,
 * so the next page render fetches with the new settings.
 */
function adsentinel_flush_cache() {
	delete_transient( ADSENTINEL_TRANSIENT_FRESH );
	delete_transient( ADSENTINEL_TRANSIENT_STALE );
}

/* -------------------------------------------------------------------------
 * Settings (AdSentinel → Settings)
 * ---------------------------------------------------------------------- */

/**
 * Register the stored options and their sanitizers.
 */
function adsentinel_register_settings() {
	register_setting(
		'adsentinel_settings',
		ADSENTINEL_OPTION_CONTROL_ORIGIN,
		array(
			'type'              => 'string',
			'sanitize_callback' => 'adsentinel_sanitize_origin',
			'default'           => ADSENTINEL_DEFAULT_CONTROL_ORIGIN,
		)
	);
	register_setting(
		'adsentinel_settings',
		ADSENTINEL_OPTION_API_ID,
		array(
			'type'              => 'string',
			'sanitize_callback' => 'adsentinel_sanitize_credential',
			'default'           => '',
		)
	);
	register_setting(
		'adsentinel_settings',
		ADSENTINEL_OPTION_API_KEY,
		array(
			'type'              => 'string',
			'sanitize_callback' => 'adsentinel_sanitize_credential',
			'default'           => '',
		)
	);
}
add_action( 'admin_init', 'adsentinel_register_settings' );

// Any settings change invalidates the cached tags.
add_action( 'update_option_' . ADSENTINEL_OPTION_CONTROL_ORIGIN, 'adsentinel_flush_cache' );
add_action( 'update_option_' . ADSENTINEL_OPTION_API_ID, 'adsentinel_flush_cache' );
add_action( 'update_option_' . ADSENTINEL_OPTION_API_KEY, 'adsentinel_flush_cache' );

/**
 * Sanitize the control origin: a valid URL, or the default when empty/invalid.
 *
 * @param string $value Raw submitted value.
 * @return string
 */
function adsentinel_sanitize_origin( $value ) {
	$value = trim( (string) $value );
	if ( '' === $value ) {
		return ADSENTINEL_DEFAULT_CONTROL_ORIGIN;
	}
	$clean = esc_url_raw( $value, array( 'http', 'https' ) );
	return '' !== $clean ? $clean : ADSENTINEL_DEFAULT_CONTROL_ORIGIN;
}

/**
 * Sanitize a credential value.
 *
 * @param string $value Raw submitted value.
 * @return string
 */
function adsentinel_sanitize_credential( $value ) {
	return sanitize_text_field( (string) $value );
}

/**
 * Add the top-level AdSentinel menu with its Settings page.
 */
function adsentinel_register_menu() {
	add_menu_page(
		__( 'AdSentinel', 'adsentinel' ),
		__( 'AdSentinel', 'adsentinel' ),
		'manage_options',
		'adsentinel',
		'adsentinel_render_settings_page',
		'dashicons-shield',
		80
	);
	add_submenu_page(
		'adsentinel',
		__( 'AdSentinel Settings', 'adsentinel' ),
		__( 'Settings', 'adsentinel' ),
		'manage_options',
		'adsentinel',
		'adsentinel_render_settings_page'
	);
}
add_action( 'admin_menu', 'adsentinel_register_menu' );

/**
 * Render the settings page.
 */
function adsentinel_render_settings_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}

	$host          = adsentinel_site_host();
	$has_creds     = null !== adsentinel_credentials();
	$origin        = adsentinel_control_origin();
	$preview_url   = $origin . ADSENTINEL_SCRIPT_PATH . '?host=' . rawurlencode( $host );
	?>
	<div class="wrap">
		<h1><?php echo esc_html__( 'AdSentinel', 'adsentinel' ); ?></h1>
		<p>
			<?php echo esc_html__( 'Injects this site\'s two AdSentinel serving tags into the top of every page. Enter the credentials from the AdSentinel console (Domain → Serving).', 'adsentinel' ); ?>
		</p>
		<form action="options.php" method="post">
			<?php settings_fields( 'adsentinel_settings' ); ?>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row">
						<label for="adsentinel_control_origin"><?php echo esc_html__( 'Control origin', 'adsentinel' ); ?></label>
					</th>
					<td>
						<input
							name="<?php echo esc_attr( ADSENTINEL_OPTION_CONTROL_ORIGIN ); ?>"
							id="adsentinel_control_origin"
							type="url"
							class="regular-text"
							value="<?php echo esc_attr( get_option( ADSENTINEL_OPTION_CONTROL_ORIGIN, ADSENTINEL_DEFAULT_CONTROL_ORIGIN ) ); ?>"
							placeholder="<?php echo esc_attr( ADSENTINEL_DEFAULT_CONTROL_ORIGIN ); ?>"
						/>
						<p class="description"><?php echo esc_html__( 'The AdSentinel control API base. Leave as the default unless instructed otherwise.', 'adsentinel' ); ?></p>
					</td>
				</tr>
				<tr>
					<th scope="row">
						<label for="adsentinel_api_id"><?php echo esc_html__( 'API ID', 'adsentinel' ); ?></label>
					</th>
					<td>
						<input
							name="<?php echo esc_attr( ADSENTINEL_OPTION_API_ID ); ?>"
							id="adsentinel_api_id"
							type="text"
							class="regular-text"
							autocomplete="off"
							value="<?php echo esc_attr( get_option( ADSENTINEL_OPTION_API_ID, '' ) ); ?>"
						/>
					</td>
				</tr>
				<tr>
					<th scope="row">
						<label for="adsentinel_api_key"><?php echo esc_html__( 'API key', 'adsentinel' ); ?></label>
					</th>
					<td>
						<input
							name="<?php echo esc_attr( ADSENTINEL_OPTION_API_KEY ); ?>"
							id="adsentinel_api_key"
							type="password"
							class="regular-text"
							autocomplete="off"
							value="<?php echo esc_attr( get_option( ADSENTINEL_OPTION_API_KEY, '' ) ); ?>"
						/>
					</td>
				</tr>
				<tr>
					<th scope="row"><?php echo esc_html__( 'Site host', 'adsentinel' ); ?></th>
					<td>
						<code><?php echo esc_html( '' !== $host ? $host : '(unknown)' ); ?></code>
						<p class="description">
							<?php echo esc_html__( 'The tags are requested for this host:', 'adsentinel' ); ?>
							<code><?php echo esc_html( $preview_url ); ?></code>
						</p>
					</td>
				</tr>
				<tr>
					<th scope="row"><?php echo esc_html__( 'Status', 'adsentinel' ); ?></th>
					<td>
						<?php if ( $has_creds ) : ?>
							<span style="color:#1a7f37;">&#10003; <?php echo esc_html__( 'Credentials set — tags will be injected into <head>.', 'adsentinel' ); ?></span>
						<?php else : ?>
							<span style="color:#b32d2e;"><?php echo esc_html__( 'Credentials missing — nothing is injected until both API ID and API key are set.', 'adsentinel' ); ?></span>
						<?php endif; ?>
					</td>
				</tr>
			</table>
			<?php submit_button(); ?>
		</form>
	</div>
	<?php
}

/**
 * Clear cached tags on activation and deactivation, so a reinstall never serves
 * a stale copy from a previous configuration.
 */
register_activation_hook( __FILE__, 'adsentinel_flush_cache' );
register_deactivation_hook( __FILE__, 'adsentinel_flush_cache' );
