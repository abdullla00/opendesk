# Copyright (c) 2026, Peter and contributors
# For license information, please see license.txt

"""Every name in Frappe that Open Desk hangs on, still there.

What it checks: the sidebar classes the rail patches and reads, the arrangement editor
`js/arrange.js` extends, the classes `scss/rail.scss` styles, the Apps screen's tiles
(which the rail opens a module list from and `apps_screen.py` arranges), the icon
sprites `module_tiles.py` reads, and -- for the two Dock methods the rail replaces
outright rather than wraps -- that Frappe's own have not changed since the rail was
written against them.

The desk half (`js/rail.js`, `js/user_menu.js`, `js/arrange.js`,
`js/boot_arrangement.js`, `public/js/user_menu_rows.js`) patches Frappe's
sidebar classes and reads their properties, markup and menu rows. In the
browser, a missing method switches the rail off and a changed one makes it give
up (`patch` in the rail), so a Frappe upgrade costs the rail, not the desk --
but quietly. This reads Frappe's own source instead, so the run after
`bench update` says which name moved, before anyone opens the desk.

A failure here is not a broken desk. It is the list of what to look at in
Frappe's diff before shipping the upgrade.
"""

import os
import re
from unittest import TestCase

import frappe

JS = ("public", "js", "frappe")

# Per file: methods defined there, `this.<property>` it sets, and strings (classes,
# row names, globals) it carries.
SEAMS = {
	("ui", "sidebar", "sidebar.js"): {
		"methods": [
			"dock_enabled",
			"open_module",
			"setup",
			"set_workspace_sidebar",
			"add_item",
			"empty",
			"open",
			"refresh_header",
			# An Apps screen tile's landing page, which the rail matches a click to (`js/rail.js`).
			"app_landing_route",
			"refresh_dock",
			"create_user_menu",
			# The Module Column redraws with the sidebar's visibility.
			"apply_page_visibility",
			"toggle",
		],
		"properties": [
			"$items_container",
			"wrapper",
			"current_module",
			"sidebar_expanded",
			"sidebar_header",
			"dock",
		],
		"strings": [
			"workspace-selector",
			"navbar-modal-search-mobile",
			"sidebar-notification",
			"notification-count",
			"standard-items-band",
			"frappe.get_module_icon =",
			'frappe.router.on("change"',
		],
	},
	("ui", "sidebar", "dock.js"): {
		"methods": ["make", "render_entries", "render_logo", "name_tile", "close", "refresh"],
		"properties": [
			"$dock",
			"$items",
			"tooltips",
			"$header",
			"$header_logo",
			"$header_title",
			"is_pinned",
			"enabled",
			"rendered",
			"header_tooltip",
		],
		"strings": [
			"frappe.ui.Dock =",
			"static pointer_can_reveal()",
			"dock-user",
			"dock-item",
			"dock-item-icon",
			"dock-item-label",
			"es-tooltip--plain",
		],
	},
	("ui", "sidebar", "sidebar_header.js"): {
		"methods": [
			"menu_items",
			"all_apps_item",
			"system_items",
			"navbar_items",
			"get_help_siblings",
			"refresh",
			# The Header Menu opens the header's own menu.
			"setup_menu",
		],
		"properties": ["wrapper", "$header_title", "$header_logo", "$drop_icon", "sidebar", "menu"],
		"strings": ["frappe.ui.SidebarHeader =", "switch-module", "switch-app", "all-apps"],
	},
	("ui", "sidebar", "sidebar_header.html"): {"strings": ["title-container"]},
	("ui", "sidebar", "sidebar_item.js"): {
		"strings": [
			"frappe.ui.sidebar_item.TypeButton =",
			"TypeSpacer",
			"section-break",
			"standard-sidebar-item",
		],
	},
	# The last: the rail escapes what it puts in a row, because the template prints labels as HTML.
	("ui", "sidebar", "sidebar_item.html"): {
		"strings": ["sidebar-item-container", "item-anchor", "sidebar-item-label", "{{ item.label }}"],
	},
	("ui", "sidebar", "sidebar_panel.js"): {
		"strings": ["frappe.ui.SidebarPanel =", "frappe.ui.sidebar_panels =", "toggle(name)"],
	},
	# `js/arrange.js` subclasses it: the methods it overrides or calls, and the fields it reads.
	("ui", "sidebar", "arrangement_editor.js"): {
		"methods": [
			"layers",
			"prepare",
			"title",
			"save_args",
			"can_add",
			"add",
			"apply",
			"copy",
			"reset",
			"is_own_add",
			"item_extras",
			"item_classes",
			"decorate_item",
			"entry_icon",
			"preview_item",
			"visibility_button",
			"hide_tooltip",
			"arranged_rows",
			"arrange",
			"render_panes",
			# Manage Desk Apps draws its preview switch over `render`, and the Apps screen in the preview.
			"render",
			"render_preview",
			"selection",
		],
		"properties": [
			"entries",
			"order",
			"hidden",
			"can_curate_site",
			"layer_config",
			"loaded",
			"dialog",
			"$body",
			"$preview",
		],
		"strings": ["frappe.ui.ArrangementEditor ="],
	},
	# The Header Menu opens and closes the header's menu, and chains onto its `opts.on_close`.
	("ui", "components", "dropdown.js"): {
		"methods": ["open", "close"],
		"properties": ["opts"],
		"strings": ["frappe.ui.Dropdown =", "this.opts.on_close && this.opts.on_close(reason)"],
	},
	# Manage Desk Apps' Apps Screen menu marks the current choice; the rows' labels are text.
	("ui", "components", "menu.js"): {"strings": ["item.selected", "textContent"]},
	# An Apps screen tile: where it leads, and the two links the rail recognises it by.
	("ui", "desktop_icon.html"): {"strings": ['class="icon-link"', 'class="icon-title"', "icon.logo_url"]},
	("utils", "utils.js"): {"methods": ["app_logo", "desktop_icon", "sidebar_for_module"]},
}

# The rail's drawers open over the sidebar, one above its z-index.
SCSS_SEAMS = {("desk", "sidebar.scss"): ["z-index: 1020"]}

# Where Frappe's own classes may be defined or drawn: its stylesheets and the sidebar's scripts
# and templates.
CLASS_SOURCES = [("public", "scss"), ("public", "js", "frappe", "ui", "sidebar")]

# The Apps screen page: the container its tiles are in, and the rule for where each leads.
DESKTOP_SEAMS = {
	("desk", "page", "desktop", "desktop.js"): [
		'find(".desktop-container")',
		"app_landing_route(app)",
		# Manage Desk Apps in the Apps screen's avatar menu, and the screen redrawn after a save
		# (`js/arrange.js`).
		'trigger("desktop_screen", { desktop: this })',
		"add_menu_item(item) {",
		'frappe.pages["desktop"].desktop_page = new DesktopPage(page)',
		"\tupdate() {",
	],
	# An editor's save hands the desk new workspaces, and it rebuilds its lookups from them.
	("public", "js", "frappe", "desk.js"): ["setup_workspaces() {"],
}

# Frappe's server functions Open Desk calls outside the boot module, by module.
SERVER_FUNCTIONS = {
	"frappe.desk.doctype.dock.dock": ["get_app_base"],
	"frappe.desk.doctype.desktop_settings.desktop_settings": ["get_desktop_page"],
	"frappe.desk.desktop": ["get_workspaces"],
}

# The two Dock methods the rail replaces rather than wraps (`render_logo`, `render_entries` in
# `js/rail.js`), as Frappe wrote them when the rail last matched them. A change fails here: read
# what Frappe changed, carry it into the rail's version if it matters, then update the
# fingerprint.
REPLACED = {"render_entries": "deaead8e8747244a", "render_logo": "3bc6ff7131056e0f"}

# What the server half calls in `frappe.boot`, and the boot keys the desk half reads.
BOOT_FUNCTIONS = [
	"get_module_sidebars",
	"get_app_data",
	"get_app_rail_host_map",
	"get_boot_module_app",
	"get_icon_style",
]
BOOT_KEYS = ["module_sidebars", "app_data"]


def _source(*parts: str) -> str:
	with open(frappe.get_app_path("frappe", *parts), encoding="utf-8") as f:
		return f.read()


class TestFrappeSeams(TestCase):
	def test_desk_names_are_still_in_frappe(self):
		for parts, seams in SEAMS.items():
			path = os.path.join(*parts)
			source = _source(*JS, *parts)
			# Asserted as booleans: a failure names the seam, not the whole file.
			for method in seams.get("methods", ()):
				with self.subTest(path=path, method=method):
					pattern = rf"(?m)^\s*(static\s+|get\s+)?{re.escape(method)}\s*\(.*\)\s*\{{\s*\}}?\s*$"
					self.assertTrue(re.search(pattern, source), f"{method}() is not defined in {path}")
			for prop in seams.get("properties", ()):
				with self.subTest(path=path, property=prop):
					found = re.search(rf"this\.{re.escape(prop)}\b", source)
					self.assertTrue(found, f"this.{prop} is not in {path}")
			for text in seams.get("strings", ()):
				with self.subTest(path=path, string=text):
					self.assertTrue(text in source, f"{text!r} is not in {path}")

	def test_boot_still_offers_what_the_rail_reads(self):
		import frappe.boot

		for name in BOOT_FUNCTIONS:
			with self.subTest(function=name):
				self.assertTrue(callable(getattr(frappe.boot, name, None)))
		source = _source("boot.py")
		for key in BOOT_KEYS:
			with self.subTest(key=key):
				self.assertIn(f"bootinfo.{key} =", source)

	def test_server_functions_are_still_there(self):
		"""Checked without a site: a name that moved would otherwise show only in the Error Log."""
		import importlib

		for module, names in SERVER_FUNCTIONS.items():
			imported = importlib.import_module(module)
			for name in names:
				with self.subTest(function=f"{module}.{name}"):
					self.assertTrue(callable(getattr(imported, name, None)))

	def test_an_apps_shipped_dock_is_still_readable(self):
		"""`desk_apps.shipped_docks` reads each app's own Dock, before any layer."""
		from frappe.desk.doctype.dock import dock

		if not getattr(frappe.local, "site", None):
			self.skipTest("reads a site's Dock records: run with a site connected")
		for row in dock.get_app_base("frappe"):
			with self.subTest(row=row.get("link_to")):
				self.assertLessEqual({"link_type", "link_to", "hidden"}, set(row))

	def test_app_data_is_in_the_boot_before_extend_bootinfo_runs(self):
		"""The rail reads this user's `app_data` from the boot it extends (`desk_apps.py`)."""
		# `get_bootinfo` builds it (`load_desktop_data`), then the session runs the hooks.
		self.assertIn("load_desktop_data(bootinfo", _source("boot.py"))
		sessions = _source("sessions.py")
		self.assertLess(
			sessions.index("bootinfo = get_bootinfo()"), sessions.index('get_hooks("extend_bootinfo")')
		)

	def test_every_frappe_class_the_rail_styles_is_still_frappes(self):
		"""A renamed class throws nothing: the rail only looks wrong. So each is looked for here."""
		with open(frappe.get_app_path("opendesk", "open_desk", "scss", "rail.scss")) as f:
			stylesheet = re.sub(r"//[^\n]*|/\*[\s\S]*?\*/", "", f.read())
		classes = {
			name for name in re.findall(r"\.([a-z][\w-]*)", stylesheet) if not name.startswith("opendesk-")
		}
		self.assertTrue(classes, "read no classes from rail.scss")

		frappe_source = []
		for parts in CLASS_SOURCES:
			for root, _dirs, files in os.walk(frappe.get_app_path("frappe", *parts)):
				for name in files:
					if name.endswith((".scss", ".js", ".html")):
						with open(os.path.join(root, name), encoding="utf-8") as f:
							frappe_source.append(f.read())
		frappe_source = "\n".join(frappe_source)

		for name in sorted(classes):
			with self.subTest(css_class=name):
				found = re.search(rf"(?<![\w-]){re.escape(name)}(?![\w-])", frappe_source)
				self.assertTrue(found, f".{name} is styled by rail.scss but is not in Frappe")
		for parts, texts in SCSS_SEAMS.items():
			source = _source("public", "scss", *parts)
			for text in texts:
				with self.subTest(path=os.path.join(*parts), string=text):
					self.assertTrue(text in source, f"{text!r} is not in {os.path.join(*parts)}")

	def test_the_dock_methods_the_rail_replaces_are_unchanged(self):
		import hashlib

		source = _source(*JS, "ui", "sidebar", "dock.js")
		for name, fingerprint in REPLACED.items():
			with self.subTest(method=name):
				found = re.search(rf"(?ms)^\t{name}\(.*?\) \{{\n.*?^\t\}}\n", source)
				self.assertTrue(found, f"Dock.{name} is not in dock.js")
				self.assertEqual(
					hashlib.sha256(found.group(0).encode()).hexdigest()[:16],
					fingerprint,
					f"Frappe changed Dock.{name}, which js/rail.js replaces: read the change",
				)

	def test_the_apps_screen_page_still_offers_what_the_rail_reads(self):
		for parts, texts in DESKTOP_SEAMS.items():
			source = _source(*parts)
			for text in texts:
				with self.subTest(path=os.path.join(*parts), string=text):
					self.assertIn(text, source)
		self.assertTrue(
			os.path.isfile(frappe.get_app_path("frappe", "public", "js", "arrangement_editor.bundle.js")),
			"js/arrange.js loads arrangement_editor.bundle.js, which Frappe no longer ships",
		)

	def test_icon_sprites_still_hold_symbols_module_tiles_can_read(self):
		"""`module_tiles` lifts `<symbol id="icon-...">` out of Frappe's sprites and sets their tones."""
		import frappe.hooks

		sprite = next(url for url in frappe.hooks.app_include_icons if url.endswith("module-icons.svg"))
		source = _source("public", *sprite.removeprefix("/assets/frappe/").split("/"))
		self.assertRegex(source, r'<symbol\b[^>]*\bid="icon-[\w-]+-duotone"')
		self.assertIn("--duotone-dark", source)
		self.assertIn("--duotone-light", source)
