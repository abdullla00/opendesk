// The site's tools and Help, in the user menu rather than the sidebar's header menu.
//
// Frappe 16.50 ends the menu at the top of the sidebar, which is otherwise about the module on
// screen, with the site's Navbar Settings rows (System Console, and whatever else a site or an
// app's `standard_navbar_items` adds) and Help (the page's own help links, then the site's
// Navbar Settings help rows). Neither is about the module. Both are about you and the site, as is
// everything in the user menu at the foot of the rail (Settings, Reload, Logout), so they move
// there, as one group above Logout: the same rows Frappe builds, from the header's own
// `navbar_items`, and the same Help submenu, read afresh on every open from its
// `get_help_siblings`, so the page's help links still follow the page.
//
// They go in as one more group, just above Logout, through `opendesk.user_menu`
// (`public/js/user_menu_rows.js`), which says how a row gets into Frappe's user menu.
//
// Off unless Open Desk Settings' "Move Help and Site Tools to User Menu" is ticked, and off too if
// Frappe has moved what this hangs on: then both stay where Frappe puts them. They leave the
// header menu only once a user menu has really been built with them in it, so a change in how
// Frappe builds that menu leaves them where Frappe puts them rather than nowhere.
(function () {
	const features = (frappe.boot && frappe.boot.opendesk_features) || {};
	if (!features.user_menu) return;

	const Header = frappe.ui && frappe.ui.SidebarHeader;
	if (
		!Header ||
		!(window.opendesk && opendesk.user_menu && opendesk.user_menu.add) ||
		typeof Header.prototype.system_items !== "function" ||
		typeof Header.prototype.navbar_items !== "function" ||
		typeof Header.prototype.get_help_siblings !== "function"
	) {
		return;
	}

	// Into the user menu, over Logout -- and then, only once they are there, off the header menu:
	// those rows and no others, so anything Frappe adds to that block later stays where it is.
	const row_id = (row) => row && (row.name || row.label);
	let moved = null;
	const added = opendesk.user_menu.add((groups, sidebar) => {
		// Navbar Settings rows read only the boot, so the prototype builds them as well as a
		// header would; the sidebar's header may not exist yet when the menu is made.
		const site_rows = Header.prototype.navbar_items.call(
			sidebar.sidebar_header || Header.prototype
		);
		const help = {
			group: "",
			options: [
				...site_rows,
				{
					name: "help",
					label: __("Help"),
					icon: "info",
					// A function, so the menu reads it on every open: the page's help links
					// change with every navigation.
					submenu: () =>
						sidebar.sidebar_header ? sidebar.sidebar_header.get_help_siblings() : [],
					condition: () =>
						!!sidebar.sidebar_header &&
						sidebar.sidebar_header
							.get_help_siblings()
							.some((section) => section.options.length),
				},
			],
		};

		const changed = [...groups];
		changed.splice(Math.max(changed.length - 1, 0), 0, help);
		moved = new Set(help.options.map(row_id).filter(Boolean));
		return changed;
	});
	if (added) {
		// Wrapped, not replaced: Frappe's own list, less what reached the user menu. If Frappe's
		// list stops being rows, it is shown as Frappe made it.
		const system_items = Header.prototype.system_items;
		Header.prototype.system_items = function () {
			const items = system_items.apply(this, arguments);
			if (!moved || !Array.isArray(items)) return items;
			try {
				return items.filter((row) => !moved.has(row_id(row)));
			} catch (e) {
				console.error("opendesk: kept the header menu's own rows", e);
				return items;
			}
		};
	}
})();
