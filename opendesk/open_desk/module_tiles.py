# Copyright (c) 2026, Peter and contributors
# For license information, please see license.txt

"""An Apps screen picture for a module, drawn from the icon the module already has.

Frappe's Apps screen tile takes an image (`app_logo_url`) or draws a letter. A module
has an icon already -- its sidebar's `header_icon`, which the Dock and the sidebar
header draw -- but that is a symbol in an icon sprite (`app_include_icons`), not an
image. So the symbol is lifted out of the sprite that holds it and set on a tile in the
shape and colour of the Apps screen's own artwork (`desktop_icons/<style>/*.svg`): a
54px rounded square, the glyph white on the app's colour (Solid), or in the app's
colour on a tint of it (Subtle). It is handed over as a `data:` URL, so the tile is an
ordinary image and nothing in the browser changes.

The app's colour is the one its shipped artwork is drawn in, else its logo's, else
Frappe's grey -- read from the files, not kept here.
"""

import os
import re
from collections import Counter
from functools import lru_cache
from urllib.parse import quote

import frappe

GREY = "#7B808A"
_FILL = re.compile(r'fill="(#[0-9A-Fa-f]{6})"')
_TILE = (
	"M38.5714 0H15.4286C6.90761 0 0 6.90761 0 15.4286V38.5714C0 47.0924 6.90761 54 15.4286 54"
	"H38.5714C47.0924 54 54 47.0924 54 38.5714V15.4286C54 6.90761 47.0924 0 38.5714 0Z"
)


def picture(icon: str | None, app: str | None, style: str | None) -> str | None:
	"""The tile for `icon`, in `app`'s colour, as a `data:` URL; None when no sprite has it."""
	if not icon or not re.fullmatch(r"[\w-]+", icon):
		return None
	symbol = _symbols(tuple(frappe.get_installed_apps())).get(icon)
	if not symbol:
		return None
	attrs, inner = symbol
	color = app_color(app)
	subtle = (style or "Solid").lower() == "subtle"
	tile = f'fill="{color}" fill-opacity="0.19"' if subtle else f'fill="{color}"'
	ink = color if subtle else "#FFFFFF"
	svg = (
		'<svg xmlns="http://www.w3.org/2000/svg" width="54" height="54" viewBox="0 0 54 54">'
		# A duotone symbol paints with these; a line icon with `currentColor`.
		f"<style>svg{{--duotone-dark:{ink};--duotone-light:{ink}8C;color:{ink}}}</style>"
		f'<path d="{_TILE}" {tile}/>'
		f'<svg x="14" y="14" width="26" height="26" {attrs}>{inner}</svg>'
		"</svg>"
	)
	return "data:image/svg+xml," + quote(svg)


def app_color(app: str | None) -> str:
	"""The colour an app's Apps screen pictures are drawn in."""
	return (_app_colors(tuple(frappe.get_installed_apps())).get(app) if app else None) or GREY


@lru_cache(maxsize=8)
def _symbols(apps: tuple[str, ...]) -> dict[str, tuple[str, str]]:
	"""Every symbol in the installed apps' icon sprites: name -> (its attributes, its content).

	Read once per process for each set of installed `apps` (a process serves every site on
	the bench); the sprites change only with a deploy, which restarts it.
	A symbol's `id` is dropped and its `viewBox` kept, so it can be nested as an `<svg>`.
	"""
	symbols: dict[str, tuple[str, str]] = {}
	for url in frappe.get_hooks("app_include_icons") or []:
		path = _asset_path(url)
		if not path:
			continue
		with open(path, encoding="utf-8") as f:
			source = f.read()
		for match in re.finditer(r"<symbol\b([^>]*)>(.*?)</symbol>", source, re.S):
			attrs, inner = match.groups()
			name = re.search(r'\bid="icon-([\w-]+)"', attrs)
			if not name or name.group(1) in symbols:
				continue
			attrs = re.sub(r'\s*\b(id|class|style)="[^"]*"', "", attrs)
			symbols[name.group(1)] = (attrs.strip(), inner)
	return symbols


@lru_cache(maxsize=8)
def _app_colors(apps: tuple[str, ...]) -> dict[str, str]:
	"""Each installed app's colour: the commonest fill in its shipped Solid artwork, else in its logo."""
	colors = {}
	for app in apps:
		fills = Counter()
		solid = os.path.join(frappe.get_app_path(app), "public", "icons", "desktop_icons", "solid")
		if os.path.isdir(solid):
			for name in os.listdir(solid):
				if name.endswith(".svg"):
					with open(os.path.join(solid, name), encoding="utf-8") as f:
						fills.update(_FILL.findall(f.read()))
		if not fills:
			for logo in frappe.get_hooks("app_logo_url", app_name=app) or []:
				path = _asset_path(logo)
				if path and path.endswith(".svg"):
					with open(path, encoding="utf-8") as f:
						fills.update(_FILL.findall(f.read())[:1])
		fills.pop("#FFFFFF", None)
		fills.pop("#ffffff", None)
		if fills:
			colors[app] = fills.most_common(1)[0][0]
	return colors


def _asset_path(url: str) -> str | None:
	"""The file behind an `/assets/<app>/...` URL, if it is one of an installed app's."""
	match = re.fullmatch(r"/?assets/([\w-]+)/(.+)", url or "")
	if not match or match.group(1) not in frappe.get_installed_apps():
		return None
	path = os.path.join(frappe.get_app_path(match.group(1)), "public", match.group(2))
	return path if os.path.isfile(path) else None
