"""This app's switches: one per place it changes how Frappe's desk behaves.

The document is `Open Desk Settings`, a Single. Each switch is opt-in: a site
that never ticked one runs Frappe's own desk. Every one of them leans on details
of Frappe's code that an upgrade can move (`test_frappe_seams.py` lists them),
so each can be switched off without a deploy, the first thing to rule out when
the desk misbehaves after an upgrade.

Reading it is one line and one caveat, so the reader sits beside the document
rather than in each caller.
"""

import frappe

SETTINGS = "Open Desk Settings"

# `js/rail.js`, Frappe's Dock listing the apps `desk_apps` resolves
ENABLE_NAVIGATION_RAIL = "enable_navigation_rail"
# The rail's foot: Search, Notifications and other apps' tiles moved there from the top of the
# sidebar (`js/rail.js`, `scss/rail.scss`). Only with the rail.
ENABLE_RAIL_TOOLS = "enable_rail_tools"
# `apps_screen.py`, which arranges Frappe's Apps screen from the Desk Apps
ENABLE_APPS_SCREEN = "enable_apps_screen"
# `js/user_menu.js`, which moves the site tools and Help into the desk's user menu
ENABLE_USER_MENU = "enable_user_menu"

# What the desk is told, under `frappe.boot.opendesk_features`: each key is the
# name the browser half checks, and each value the field that switches it.
DESK_FEATURES = {
	"navigation_rail": ENABLE_NAVIGATION_RAIL,
	"rail_tools": ENABLE_RAIL_TOOLS,
	"apps_screen": ENABLE_APPS_SCREEN,
	"user_menu": ENABLE_USER_MENU,
}


def _settings():
	"""The cached settings document, or None between this app landing and its migrate.

	Asked on every desk boot, so the missing-doctype case is the exception path
	rather than an existence query up front. Frappe raises
	`ImportError` for a Single whose doctype isn't there; the same error from a
	doctype that *is* there is a real fault, and is raised.
	"""
	try:
		return frappe.get_cached_doc(SETTINGS)
	except (ImportError, frappe.DoesNotExistError):
		if frappe.db.exists("DocType", SETTINGS):
			raise
		return None


def feature_enabled(fieldname: str) -> bool:
	"""Whether a site has switched on the feature behind an `ENABLE_*` field.

	Off until somebody says otherwise: a Check with no row in `tabSingles` reads
	as 0, and so does a site with no doctype yet. Read through the document cache;
	a save clears the cached copy.
	"""
	doc = _settings()
	return bool(doc and doc.get(fieldname))


def may_configure() -> bool:
	"""Whether this user gets Open Desk's tile: someone who may edit its settings or its Desk Apps.

	Frappe's `add_to_apps_screen` `has_permission`; the module itself is offered by Frappe's
	own permission on the doctypes in it.
	"""
	return frappe.has_permission(SETTINGS, "write") or frappe.has_permission("Desk App", "write")


def extend_bootinfo(bootinfo: "frappe._dict") -> None:
	"""Tell the desk which of its patches to install.

	Read once, when the scripts load, so a change reaches a user on their next reload. The
	Apps screen counts as on only where the site's desktop is the Apps screen
	(`apps_screen.enabled`).
	"""
	from opendesk.open_desk import apps_screen

	bootinfo.opendesk_features = {key: feature_enabled(field) for key, field in DESK_FEATURES.items()}
	bootinfo.opendesk_features["apps_screen"] = apps_screen.enabled()
