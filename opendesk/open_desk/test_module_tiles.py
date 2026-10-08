# Copyright (c) 2026, Peter and contributors
# For license information, please see license.txt

"""An Apps screen picture drawn from a module's own icon, over plain data."""

from unittest import TestCase
from unittest.mock import patch
from urllib.parse import unquote

from opendesk.open_desk import module_tiles

SYMBOLS = {"calculator-duotone": ('viewBox="0 0 24 24" stroke="none"', '<path d="M1 1H2Z"/>')}


def drawn(icon, style="Solid"):
	with (
		patch.object(module_tiles, "_symbols", return_value=SYMBOLS),
		patch.object(module_tiles, "app_color", return_value="#0289F7"),
		patch.object(module_tiles.frappe, "get_installed_apps", return_value=["frappe", "erpnext"]),
	):
		url = module_tiles.picture(icon, "erpnext", style)
	return url and unquote(url.removeprefix("data:image/svg+xml,"))


class TestPicture(TestCase):
	def test_solid_is_the_glyph_in_white_on_the_apps_colour(self):
		svg = drawn("calculator-duotone")
		self.assertIn('fill="#0289F7"/>', svg)
		self.assertIn("--duotone-dark:#FFFFFF", svg)
		self.assertIn('<svg x="14" y="14" width="26" height="26" viewBox="0 0 24 24" stroke="none">', svg)

	def test_subtle_is_the_glyph_in_the_apps_colour_on_a_tint(self):
		svg = drawn("calculator-duotone", style="Subtle")
		self.assertIn('fill="#0289F7" fill-opacity="0.19"', svg)
		self.assertIn("--duotone-dark:#0289F7", svg)

	def test_no_symbol_or_no_name_is_no_picture(self):
		self.assertIsNone(drawn("not-an-icon"))
		self.assertIsNone(drawn(None))
		self.assertIsNone(drawn('x" onload="alert(1)'))
