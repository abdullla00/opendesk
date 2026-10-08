// Copyright (c) 2026, Peter and contributors
// For license information, please see license.txt

// The desk reads these switches once, as it loads, so a save reloads it -- as Frappe's own Navbar
// Settings does, through the same call, which also drops the desk's cached copy of the boot.
// Everyone else's desk picks the change up on their next reload.
frappe.ui.form.on("Open Desk Settings", {
	after_save() {
		frappe.ui.toolbar.clear_cache();
	},
});
