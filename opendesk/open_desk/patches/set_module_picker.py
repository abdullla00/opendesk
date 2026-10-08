"""Open Desk Settings' Module Picker arrived after sites had saved their settings, and a Select's
default only fills a new document: give it the default, Header Menu, where it is still empty."""

import frappe


def execute():
	if not frappe.db.get_single_value("Open Desk Settings", "module_picker"):
		frappe.db.set_single_value("Open Desk Settings", "module_picker", "Header Menu")
