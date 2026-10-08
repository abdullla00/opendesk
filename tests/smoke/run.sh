#!/usr/bin/env bash
# Run Open Desk's browser smoke test against a running site.
#
#   OPENDESK_SMOKE_PASSWORD=admin tests/smoke/run.sh http://demo.localhost:8000
#
# Optional: OPENDESK_SMOKE_USER (default Administrator), OPENDESK_SMOKE_HEADED=1 to watch it, or
# OPENDESK_SMOKE_SID=<a session's sid cookie> in place of the password.
#
# It only reads: editors are closed without saving, no setting is changed, and it logs out at the
# end. It drives the Chrome installed on this machine, so no browser is downloaded; Playwright
# itself is installed once into a cache folder of its own, outside the app and the bench.
set -euo pipefail

PLAYWRIGHT_VERSION="1.62.1"
CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/opendesk-smoke"

if [ ! -f "$CACHE/node_modules/playwright/package.json" ] ||
	[ "$(node -p "require('$CACHE/node_modules/playwright/package.json').version")" != "$PLAYWRIGHT_VERSION" ]; then
	mkdir -p "$CACHE"
	PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --prefix "$CACHE" --no-audit --no-fund --silent \
		"playwright@$PLAYWRIGHT_VERSION"
fi

NODE_PATH="$CACHE/node_modules" exec node "$(dirname "$0")/smoke.cjs" "$@"
