# Copyright (c) 2026, Peter and contributors
# For license information, please see license.txt

"""The switches for the places this app changes Frappe's desk. Read by
`opendesk.open_desk.settings`, which says what each one turns on."""

from frappe.model.document import Document


class OpenDeskSettings(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		enable_apps_screen: DF.Check
		enable_navigation_rail: DF.Check
		enable_rail_tools: DF.Check
		enable_user_menu: DF.Check
		module_picker: DF.Literal["Header Menu", "Sidebar List", "Module Column"]
	# end: auto-generated types

	pass
