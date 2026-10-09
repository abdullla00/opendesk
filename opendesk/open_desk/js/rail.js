// The navigation rail: apps down the left of the desk, where Frappe's Dock lists the open app's
// modules.
//
// Built on the Dock rather than beside it. Frappe 16.50 draws a column left of the sidebar (the
// Dock) holding the modules of whichever app owns the sidebar on screen, and a header menu over
// the sidebar. This keeps the column and everything Frappe does with it -- pinned or floating,
// hidden where a page hides it, the user menu at its foot -- and changes only what is in it:
//
//   - the column lists the apps `opendesk.open_desk.desk_apps` resolves (the
//     Desk Apps, then every installed app for the modules those leave unclaimed), the one
//     you are in lit, and its mark at the top is the site's, leading to the Apps screen;
//   - picking an app offers its modules, in one of three places Open Desk Settings' "Module
//     Picker" chooses between (below). Its tooltip is just its name;
//   - the header menu over the sidebar lists the open app's modules, under the Categories and
//     Spacers its Desk App sets, in place of Frappe's switcher rows;
//   - the header names the app as well as the module, since the rail's lit tile is an app and
//     Frappe's header names only the module;
//   - Search and Notifications sit at the foot of the rail, over the user's avatar, rather than
//     at the top of the sidebar. They are Frappe's own: the rail's buttons carry the classes
//     Frappe opens search from (`navbar-modal-search-mobile`, a delegated click) and puts the
//     unread count into (`notification-count`, every one on the page), and the bell toggles
//     Frappe's notifications panel. Other apps' tiles follow them (`opendesk.rail.tools`, below):
//     Commons' To Do, say, opening its own panel the same way. Frappe's panels open beside the
//     rail, over the sidebar, rather than beside the sidebar;
//   - the user menu's Manage Dock, which arranges a Dock nothing draws while the rail is on, gives
//     way to Manage Desk Apps, and a click on the module list's header opens Manage Modules for that
//     app (both `js/arrange.js`). They arrange what the rail does draw, and it is redrawn in
//     place when they save (`opendesk.rail.apply`).
//
// The module picker, "Header Menu" (the default), "Sidebar List" or "Module Column"
// (`features.module_picker`).
//
// Sidebar List. The sidebar's rows become the app's modules -- its frontend first, set apart,
// then the modules under their Categories and Spacers -- and its header is the app: its mark,
// its name, and how many modules it has. Nothing
// else moves: the page stays where it was until a module is picked, and navigating anywhere
// else puts back the sidebar for wherever you land. Frappe's own state is left alone, so
// leaving the list is only rebuilding the sidebar Frappe already thinks it is showing. An app
// with one module, or only a frontend, has no choice to show and opens it.
//
// The rows move to say which way you went: a module opened from the list comes in from the right
// (one level down), the list comes in from the left (one level up), and switching app or module
// sideways -- from the header menu, or an app of one module -- fades. Only what a person clicked
// here animates; the rebuilds Frappe makes on its own as you navigate just appear, or motion
// would stop meaning anything. The header names the module over its app.
//
// Header Menu. Each level of the hierarchy has one surface: the rail holds apps, the sidebar's
// header holds the module -- the app over the module open in it, and a menu to change it -- and
// the sidebar's rows are always the module's content. The modules are never sidebar rows: they
// are the header's menu, the one on screen marked, ending in Manage Modules. Picking an app on
// the rail opens that menu on the app's modules, the header naming the app over "Choose a
// module" until it closes, over the sidebar of the page you are on, which stays as it is until
// a module is picked.
//
// Module Column. The three levels are three columns: the rail, then a column of the app's
// modules, then the sidebar, which only ever holds the module's content and is headed by the
// module alone. Three columns are a lot of the screen, so each can give room back: the module
// column folds to its icons (its foot's button, remembered in this browser), and folded it
// opens over the sidebar while the pointer is on it, or when an app is picked on the rail; the
// sidebar folds as Frappe folds it. Picking another app on the rail shows its modules in the
// column, over the page you are on, until a module is picked or the page changes. Where the
// rail is not drawn (below 768px) there is no column either, and the header menu picks, as the
// Header Menu does.
//
// In all three, an app with one module, or only a frontend, has no choice to show and opens it.
//
// Which app a module is in is written into the boot by `js/boot_arrangement.js`: each module's
// rail app into `module_sidebars[shell].app`, and an `app_data` entry for each rail app Frappe
// does not know, so Frappe's own header names the right app and logo -- again whenever Frappe
// replaces either.
//
// Off unless Open Desk Settings' "Override Navigation Rail" is ticked, and off too if Frappe has moved
// what this hangs on: then the desk is simply Frappe's. Every change to Frappe's classes goes
// through `patch`, so if Frappe changes something this reads and a change throws, the rail
// switches itself off for the rest of the page and Frappe's own method runs instead (`give_up`).
// `test_frappe_seams.py` checks every name this hangs on is still in Frappe's source.
//
// Tiles of other apps' own, at the rail's foot after Search and Notifications. An app adds one by
// pushing a description onto `opendesk.rail.tools`, which it makes itself if it loads first:
//
//   frappe.provide("opendesk.rail");
//   (opendesk.rail.tools = opendesk.rail.tools || []).push({
//       name: "todos",                 // unique among the tiles
//       label: __("To Do"),            // the tooltip and the accessible name
//       icon: "list-todo",             // one of the desk's icons
//       class: "my-panel-trigger",     // optional: classes on the button
//       badge_class: "my-badge",       // optional: a count badge on the tile's corner, drawn hidden
//       condition: () => true,         // optional: whether this user gets the tile
//       on_click: ($button) => {},
//       on_draw: ($button) => {},      // optional: once the tile is on the page
//   });
//
// A plain array, read when the rail draws its foot, so it does not matter which app's script
// loads first, and an app that adds a tile needs nothing from this one when the rail is off or
// this app is not installed. A tile that throws is left out.
frappe.provide("opendesk.rail");
opendesk.rail.tools = opendesk.rail.tools || [];

(function () {
	const features = (frappe.boot && frappe.boot.opendesk_features) || {};
	// Header Menu unless the settings say otherwise (`settings.module_picker`).
	const picker = features.module_picker || "header";
	const column_mode = picker === "column";
	const header_picker = picker === "header";
	// Kept as one array for the life of the page: an editor's save refills it in place.
	const rail_apps = frappe.boot && frappe.boot.desk_apps;
	if (!features.navigation_rail || !Array.isArray(rail_apps) || !rail_apps.length) return;

	const Sidebar = frappe.ui && frappe.ui.Sidebar;
	const Dock = frappe.ui && frappe.ui.Dock;
	const Header = frappe.ui && frappe.ui.SidebarHeader;
	if (
		!Sidebar ||
		!Dock ||
		!Header ||
		[
			"dock_enabled",
			"open_module",
			"setup",
			"set_workspace_sidebar",
			"add_item",
			"empty",
		].some((m) => typeof Sidebar.prototype[m] !== "function") ||
		["make", "render_entries", "render_logo", "name_tile", "close"].some(
			(m) => typeof Dock.prototype[m] !== "function"
		) ||
		typeof Header.prototype.menu_items !== "function" ||
		typeof Sidebar.prototype.refresh_header !== "function" ||
		!(window.opendesk && opendesk.user_menu && opendesk.user_menu.add) ||
		!(opendesk.boot_arrangement && opendesk.boot_arrangement.place)
	) {
		return;
	}

	$("body").addClass("opendesk-rail-on");
	// The rail's foot, with Search, Notifications and other apps' tiles, is a switch of its own.
	if (features.rail_tools) $("body").addClass("opendesk-rail-tools-on");
	opendesk.boot_arrangement.place(rail_apps);

	// Set once a change has thrown: from then on every patched method is Frappe's own.
	let broken = false;

	// Replace `proto[name]` with `impl`, which is handed a function calling Frappe's original with
	// the same arguments. If `impl` throws, the rail gives up and the original answers -- once:
	// not again if `impl` had already called it.
	function patch(proto, name, impl) {
		const original = proto[name];
		proto[name] = function (...args) {
			let called = false;
			let result;
			const call_original = () => {
				called = true;
				return (result = original.apply(this, args));
			};
			if (broken) return call_original();
			try {
				return impl.call(this, call_original, args);
			} catch (e) {
				give_up(e);
				return called ? result : original.apply(this, args);
			}
		};
	}

	// Off for the rest of the page: Frappe's placement back, the rail's tools gone, and the sidebar
	// and Dock drawn again, now by Frappe alone.
	function give_up(error) {
		if (broken) return;
		broken = true;
		console.error(
			"opendesk: the navigation rail met a change in Frappe and has switched itself off",
			error
		);
		$("body").removeClass("opendesk-rail-on opendesk-rail-tools-on");
		$(".opendesk-rail-tools").remove();
		opendesk.boot_arrangement.release();
		setTimeout(() => {
			try {
				const sidebar = frappe.app && frappe.app.sidebar;
				if (!sidebar) return;
				sidebar.opendesk_module_list = null;
				sidebar.opendesk_picker_app = null;
				if (sidebar.opendesk_column) sidebar.opendesk_column.$el.remove();
				sidebar.opendesk_column = null;
				$("body").removeClass("opendesk-column-on");
				$(document).off(".opendesk-column");
				$(window).off(".opendesk-column");
				if (sidebar.sidebar_header) clear_list_header(sidebar.sidebar_header);
				if (sidebar.current_module) sidebar.setup(sidebar.current_module);
				if (sidebar.dock) {
					sidebar.dock.rendered = null;
					sidebar.refresh_dock();
				}
			} catch (e) {
				console.error("opendesk: could not redraw Frappe's sidebar", e);
			}
		});
	}

	// A handler of the rail's own: a click, a key, a timer, a redraw an editor asked for. Frappe
	// calls none of these, so `patch` does not cover them; this does the same for them. If the
	// handler throws, the rail gives up, and `fallback`, when given, does what Frappe's own desk
	// would have done with the same event -- and from then on only `fallback` runs.
	function guarded(handler, fallback) {
		return function (...args) {
			if (!broken) {
				try {
					return handler.apply(this, args);
				} catch (e) {
					give_up(e);
				}
			}
			return fallback ? fallback.apply(this, args) : undefined;
		};
	}

	// Frappe's way into a rail app, for a click the rail could not handle: its first module, else
	// its frontend.
	function frappe_open_app(sidebar, app) {
		const [first] = modules_of(app);
		if (first) sidebar.open_module(first.shell);
		else if (app.frontend) window.location.href = app.frontend.url;
	}

	// The rail app holding a shell, by the placement the server wrote into the boot.
	function rail_app_of(shell) {
		const sidebar = shell && frappe.boot.module_sidebars[shell];
		const app_name = sidebar && sidebar.app;
		return (app_name && rail_apps.find((app) => app.app_name === app_name)) || null;
	}

	// A rail app's modules this user can open, in its order.
	function modules_of(app) {
		return (app.modules || []).filter((entry) => frappe.boot.module_sidebars[entry.shell]);
	}

	// What an app's module list offers: its frontend, then its modules.
	function choice_count(app) {
		return modules_of(app).length + (app.frontend ? 1 : 0);
	}

	// Picking an app offers its modules, unless there is only one thing in it to pick.
	function open_app(sidebar, app) {
		if (choice_count(app) > 1) {
			offer_modules(sidebar, app);
			return;
		}
		const [only] = modules_of(app);
		if (only) {
			open_module(sidebar, only.shell, "fade");
		} else if (app.frontend) {
			window.location.href = app.frontend.url;
		}
	}

	// `open_module` builds the module's sidebar before it routes, so the rows are there to move.
	function open_module(sidebar, shell, motion) {
		leave_module_list(sidebar);
		sidebar.open_module(shell);
		animate_rows(sidebar, motion);
	}

	const MOTIONS = ["forward", "back", "fade"];

	function animate_rows(sidebar, motion) {
		if (!MOTIONS.includes(motion)) return;
		const $rows = sidebar.$items_container;
		if (!$rows || !$rows.length) return;
		$rows.removeClass(MOTIONS.map((m) => `opendesk-enter-${m}`).join(" "));
		// Read a layout property so the class removed above takes effect first, and the same
		// transition twice in a row still plays.
		void $rows.get(0).offsetWidth;
		$rows.addClass(`opendesk-enter-${motion}`);
		$rows.one("animationend", () => $rows.removeClass(`opendesk-enter-${motion}`));
	}

	function offer_modules(sidebar, app) {
		if (column_mode && column_shown(sidebar)) browse_column(sidebar, app);
		else if (header_picker || column_mode) open_picker(sidebar, app);
		else show_module_list(sidebar, app);
	}

	// Module Column -------------------------------------------------------------------------------

	const COLUMN_FOLDED = "opendesk-module-column-folded";

	// Whether the column is on screen: wherever the rail is drawn and the sidebar is.
	function column_shown(sidebar) {
		return (
			column_mode &&
			!frappe.is_mobile() &&
			!!sidebar.dock &&
			sidebar.dock.enabled &&
			!!sidebar.wrapper &&
			sidebar.wrapper.css("display") !== "none"
		);
	}

	function saved_fold() {
		try {
			return localStorage.getItem(COLUMN_FOLDED) === "1";
		} catch (e) {
			return false;
		}
	}

	function save_fold(folded) {
		try {
			localStorage.setItem(COLUMN_FOLDED, folded ? "1" : "0");
		} catch (e) {
			// Storage refused: the column keeps its width until the page reloads.
		}
	}

	// Made once, beside the rail, the first time the rail draws.
	function column_of(sidebar) {
		if (sidebar.opendesk_column) return sidebar.opendesk_column;
		if (!sidebar.dock || !sidebar.dock.$dock) return null;
		const $el = $(`<nav class="opendesk-module-column" aria-label="${__("Modules")}">
			<div class="opendesk-column-panel">
				<div class="opendesk-column-head">
					<span class="opendesk-column-mark"></span>
					<span class="opendesk-column-title"></span>
				</div>
				<div class="opendesk-column-rows"></div>
				<div class="opendesk-column-foot">
					<button class="btn-reset opendesk-column-button opendesk-column-manage" type="button"></button>
					<button class="btn-reset opendesk-column-button opendesk-column-fold" type="button"></button>
				</div>
			</div>
		</nav>`).insertAfter(sidebar.dock.$dock);
		const column = {
			$el,
			$panel: $el.find(".opendesk-column-panel"),
			folded: saved_fold(),
			// Open over the sidebar while folded.
			peek: false,
			// Another app, picked on the rail, and the route it was picked on.
			browsing: null,
			timer: null,
		};
		sidebar.opendesk_column = column;

		$el.find(".opendesk-column-fold").on(
			"click",
			guarded(() => {
				clearTimeout(column.timer);
				column.folded = !column.folded;
				column.peek = false;
				save_fold(column.folded);
				draw_column(sidebar);
			})
		);
		$el.find(".opendesk-column-manage").on(
			"click",
			guarded(() => {
				const app = column_app(sidebar);
				if (app) opendesk.rail.manage_modules(app.key);
			})
		);
		// Folded, the pointer on it opens it over the sidebar, after a moment so that crossing it
		// on the way to the sidebar does not; leaving puts it back, and any app it was showing.
		column.$panel
			.on(
				"mouseenter",
				guarded(() => {
					clearTimeout(column.timer);
					if (!column.folded || column.peek) return;
					column.timer = setTimeout(
						guarded(() => set_peek(sidebar, true)),
						250
					);
				})
			)
			.on(
				"mouseleave",
				guarded(() => {
					clearTimeout(column.timer);
					if (!column.peek) return;
					column.timer = setTimeout(
						guarded(() => leave_column(sidebar)),
						300
					);
				})
			);
		$(document).on(
			"pointerdown.opendesk-column",
			guarded((event) => {
				if (!column.peek && !column.browsing) return;
				if ($(event.target).closest(".opendesk-module-column, .dock").length) return;
				leave_column(sidebar);
			})
		);
		$(document).on(
			"keydown.opendesk-column",
			guarded((event) => {
				if (event.key === "Escape" && (column.peek || column.browsing))
					leave_column(sidebar);
			})
		);
		return column;
	}

	function set_peek(sidebar, peek) {
		const column = sidebar.opendesk_column;
		if (!column || column.peek === peek) return;
		clearTimeout(column.timer);
		column.peek = peek;
		draw_column(sidebar);
	}

	// Back to the open module's app, folded again if it was.
	function leave_column(sidebar) {
		const column = sidebar.opendesk_column;
		if (!column) return;
		clearTimeout(column.timer);
		const browsed = !!column.browsing;
		column.peek = false;
		column.browsing = null;
		draw_column(sidebar);
		if (browsed) light_rail(sidebar);
	}

	// The app whose modules the column shows: one picked on the rail, else the open module's.
	function column_app(sidebar) {
		const column = sidebar.opendesk_column;
		return (
			(column && column.browsing && column.browsing.app) ||
			rail_app_of(sidebar.current_module)
		);
	}

	function browse_column(sidebar, app) {
		const column = column_of(sidebar);
		if (!column) return;
		// A peek's pending close, from the pointer leaving the column for the rail, is overtaken.
		clearTimeout(column.timer);
		const open = rail_app_of(sidebar.current_module);
		column.browsing = app === open ? null : { app, route: frappe.get_route_str() };
		if (column.folded) column.peek = true;
		draw_column(sidebar);
		light_rail(sidebar);
	}

	function draw_column(sidebar) {
		const column = column_of(sidebar);
		if (!column) return;
		const shown = column_shown(sidebar);
		$("body").toggleClass("opendesk-column-on", shown);
		column.$el.toggleClass("hidden", !shown);
		if (!shown) return;
		const app = column_app(sidebar);
		const open = !column.folded || column.peek;
		column.$el
			.toggleClass("opendesk-column-folded", column.folded)
			.toggleClass("opendesk-column-peek", column.peek);

		column.$el.find(".opendesk-column-mark").html(app ? app_mark(app) : "");
		column.$el.find(".opendesk-column-title").text(app ? __(app.title) : "");

		const $rows = column.$el.find(".opendesk-column-rows").empty();
		const row = (label, icon, active, on_click, fallback) => {
			const $row = $(`<button class="btn-reset opendesk-column-row ${
				active ? "active" : ""
			}" type="button">
				<span class="opendesk-column-icon">${frappe.utils.icon(icon, "md")}</span>
				<span class="opendesk-column-label"></span>
			</button>`);
			$row.find(".opendesk-column-label").text(label);
			// Folded, the label is the row's tooltip and accessible name.
			if (!open) $row.attr({ title: label, "aria-label": label });
			if (active) $row.attr("aria-current", "page");
			$row.on("click", guarded(on_click, fallback));
			$rows.append($row);
		};
		if (app && app.frontend) {
			row(app.frontend.label, "external-link", false, () => {
				window.location.href = app.frontend.url;
			});
			$rows.append('<div class="opendesk-column-space"></div>');
		}
		(app ? modules_of(app) : []).forEach((entry, index) => {
			if (entry.category) {
				$('<div class="opendesk-column-category"></div>')
					.text(__(entry.category))
					.appendTo($rows);
			} else if (entry.space_before && index > 0) {
				$rows.append('<div class="opendesk-column-space"></div>');
			}
			row(
				__(entry.label),
				entry.icon || frappe.get_module_icon(entry.shell) || "folder",
				entry.shell === sidebar.current_module,
				() => {
					column.peek = false;
					column.browsing = null;
					sidebar.open_module(entry.shell);
					draw_column(sidebar);
				},
				() => sidebar.open_module(entry.shell)
			);
		});

		const fold = column.folded ? __("Expand modules") : __("Collapse modules");
		column.$el
			.find(".opendesk-column-fold")
			.attr({ title: fold, "aria-label": fold })
			.html(frappe.utils.icon(column.folded ? "chevrons-right" : "chevrons-left", "sm"));
		const manage = app ? __("Manage {0} Modules", [__(app.title)]) : "";
		column.$el
			.find(".opendesk-column-manage")
			.toggleClass("hidden", !app || !can_manage())
			.attr({ title: manage, "aria-label": manage })
			.html(frappe.utils.icon("settings-2", "sm"));
	}

	// Header Menu: the header's own menu, opened on `app`'s modules rather than the open
	// module's app. The rail lights `app` while it is up, and the open app again once it closes.
	function open_picker(sidebar, app) {
		// Beside a pinned rail a collapsed sidebar is hidden altogether, header and all, so it is
		// opened, as Frappe opens it for a Dock entry.
		if (!sidebar.sidebar_expanded && typeof sidebar.open === "function") sidebar.open();
		const header = sidebar.sidebar_header;
		if (header && !header.menu && typeof header.setup_menu === "function") header.setup_menu();
		const menu = header && header.menu;
		if (!menu) return;
		watch_picker(sidebar, menu);
		menu.close();
		sidebar.opendesk_picker_app = app;
		light_rail(sidebar);
		draw_picker_header(header, app);
		// After the click that asked for it has finished, or the menu takes that click for one
		// outside itself and closes again.
		setTimeout(
			guarded(() => {
				if (sidebar.opendesk_picker_app === app) menu.open();
			})
		);
	}

	// The header the menu hangs from names the app being picked from, until it closes -- again
	// whenever Frappe redraws the header meanwhile, as it does when a page settles (`refresh_header`).
	function draw_picker_header(header, app) {
		header.$header_title.text(__(app.title));
		header.$header_logo.html(app_mark(app));
		set_subtitle(header, __("Choose a module"));
	}

	// The header's menu is made once, by Frappe; its close is chained onto here, once, so the
	// picker forgets the app it was opened on whichever way it closes.
	function watch_picker(sidebar, menu) {
		if (menu.opendesk_watched) return;
		const on_close = menu.opts.on_close;
		const forget = guarded(() => {
			if (!sidebar.opendesk_picker_app) return;
			sidebar.opendesk_picker_app = null;
			sidebar.refresh_header();
			light_rail(sidebar);
		});
		menu.opts.on_close = (reason) => {
			if (on_close) on_close(reason);
			forget();
		};
		menu.opendesk_watched = true;
	}

	// Sidebar List: the list is drawn into the sidebar Frappe has built for the page, and remembers the route
	// it was opened on: once the route moves on, the list is put away.
	function show_module_list(sidebar, app) {
		// Beside a pinned rail a collapsed sidebar is hidden altogether, so it is opened, as
		// Frappe opens it for a Dock entry.
		if (!sidebar.sidebar_expanded && typeof sidebar.open === "function") sidebar.open();
		sidebar.opendesk_module_list = { app, route: frappe.get_route_str() };
		draw_module_rows(sidebar, app);
		draw_list_header(sidebar);
		refresh_rail(sidebar);
		animate_rows(sidebar, "back");
	}

	function leave_module_list(sidebar) {
		if (!sidebar.opendesk_module_list) return;
		sidebar.opendesk_module_list = null;
		if (sidebar.current_module) sidebar.setup(sidebar.current_module);
		refresh_rail(sidebar);
	}

	function refresh_rail(sidebar) {
		if (!sidebar.dock) return;
		sidebar.dock.rendered = null;
		sidebar.dock.render_entries();
	}

	// The app the rail lights: the one a picker or the column is showing, else the open module's.
	function lit_app(sidebar) {
		const list = sidebar.opendesk_module_list;
		const browsing = sidebar.opendesk_column && sidebar.opendesk_column.browsing;
		return (
			sidebar.opendesk_picker_app ||
			(browsing && browsing.app) ||
			(list ? list.app : rail_app_of(sidebar.current_module))
		);
	}

	// Moves the light without redrawing the tiles. The Header Menu and the Module Column change
	// what is lit on a pointerdown -- a menu closing, the column going back -- and a tile redrawn
	// between that pointerdown and its click is not there to take the click, so picking another app
	// while either is open would take two clicks.
	function light_rail(sidebar) {
		if (!sidebar.dock || !sidebar.dock.$items) return;
		const current = lit_app(sidebar);
		sidebar.dock.$items.find(".opendesk-rail-app").each((_, tile) => {
			const is_active = !!current && tile.dataset.appKey === current.key;
			$(tile).toggleClass("active", is_active);
			if (is_active) tile.setAttribute("aria-current", "page");
			else tile.removeAttribute("aria-current");
		});
	}

	function draw_module_rows(sidebar, app) {
		sidebar.empty();
		const $container = sidebar.$items_container;
		const add_row = (item) =>
			sidebar.add_item($container, {
				type: "Button",
				// A row with no link is only drawn when it is `standard`, as Frappe's own Search
				// and Notification rows are.
				standard: true,
				// `TypeButton` replaces the row's classes with these, so the class every
				// sidebar row is styled by is named again.
				class: "sidebar-item-container opendesk-module-row",
				...item,
			});

		if (app.frontend) {
			// Frappe's row template prints its label as HTML, and these are typed by whoever edits
			// a Desk App: escaped here, as every label this hands it is.
			add_row({
				label: frappe.utils.escape_html(app.frontend.label),
				icon: "external-link",
				onClick: () => (window.location.href = app.frontend.url),
			});
			sidebar.add_item($container, { type: "Spacer", label: "" });
		}

		modules_of(app).forEach((entry, index) => {
			if (entry.category) {
				$(`<div class="sidebar-item-container opendesk-module-category">
					<div class="standard-sidebar-item">
						<div class="item-anchor section-break">
							<span class="sidebar-item-label"></span>
						</div>
					</div>
				</div>`)
					.find(".sidebar-item-label")
					.text(__(entry.category))
					.end()
					.appendTo($container);
			} else if (entry.space_before && index > 0) {
				sidebar.add_item($container, { type: "Spacer", label: "" });
			}
			add_row({
				label: frappe.utils.escape_html(__(entry.label)),
				icon: entry.icon || frappe.get_module_icon(entry.shell) || "folder",
				onClick: guarded(
					() => open_module(sidebar, entry.shell, "forward"),
					() => sidebar.open_module(entry.shell)
				),
			});
			// The module the page is in, lit the way Frappe lights the current row.
			if (entry.shell === sidebar.current_module) {
				$container
					.find(".opendesk-module-row")
					.last()
					.find(".standard-sidebar-item")
					.addClass("active-sidebar");
			}
		});
	}

	// The header shows the app over its list: its mark, its name, and its module count under the
	// name in Frappe's own subtitle style. Its menu belongs to the module Frappe thinks it is
	// showing, which is not this list, so while the list is up a click on the header never reaches
	// it. For someone who may arrange the rail, the click opens Manage Modules for this app
	// instead -- the list's own editor, from the list itself. For everyone else the header is a
	// label. No chevron either way: it opens no menu.
	function draw_list_header(sidebar) {
		const header = sidebar.sidebar_header;
		const list = sidebar.opendesk_module_list;
		if (!header || !list) return;
		header.$header_title.text(list.app.title);
		header.$header_logo.html(app_mark(list.app));
		const count = modules_of(list.app).length;
		set_subtitle(header, count === 1 ? __("1 module") : __("{0} modules", [count]));
		const manageable = can_manage();
		header.wrapper
			.addClass("opendesk-module-list-header")
			.toggleClass("opendesk-module-list-header--manageable", manageable)
			.attr("title", manageable ? __("Manage {0} Modules", [__(list.app.title)]) : null);
		header.$drop_icon && header.$drop_icon.addClass("hidden");
		if (!header.opendesk_list_guard) {
			// Capture phase, so it runs before the menu's own listener on this element.
			header.wrapper.get(0).addEventListener(
				"click",
				guarded((event) => {
					const shown = sidebar.opendesk_module_list;
					if (!shown) return;
					event.stopImmediatePropagation();
					event.preventDefault();
					if (can_manage()) opendesk.rail.manage_modules(shown.app.key);
				}),
				true
			);
			header.opendesk_list_guard = true;
		}
	}

	function app_mark(app) {
		if (app.logo) {
			return frappe.utils.app_logo({ app_title: app.title, app_logo_url: app.logo }).icon;
		}
		if (app.icon) return frappe.utils.icon(app.icon, "md");
		return frappe.utils.desktop_icon(app.title, "gray", "md");
	}

	// Search, Notifications and other apps' tiles, at the foot of the rail. Built once, with the Dock.
	patch(Dock.prototype, "make", function (make_dock) {
		const result = make_dock();
		// Off, they stay at the top of the sidebar, where Frappe puts them.
		if (!features.rail_tools) return result;
		const $tools = $('<div class="opendesk-rail-tools"></div>').insertBefore(
			this.$dock.find(".dock-user")
		);
		const tool = (name, label, icon, extra_class, suffix = "") => {
			const $button = $(`<button
				class="dock-item opendesk-rail-tool ${extra_class}"
				data-tool="${name}"
				aria-label="${frappe.utils.escape_html(label)}"
			>
				<span class="dock-item-icon">${frappe.utils.icon(icon, "md")}</span>
				${suffix}
			</button>`).appendTo($tools);
			this.name_tile($button, label);
			return $button;
		};

		if (frappe.boot.desk_settings && frappe.boot.desk_settings.search_bar) {
			tool("search", __("Search"), "search", "navbar-modal-search-mobile").on(
				"click",
				guarded(() => this.close())
			);
		}
		if (
			frappe.boot.desk_settings &&
			frappe.boot.desk_settings.notifications &&
			frappe.session.user !== "Guest"
		) {
			// `sidebar-notification` is the panel's trigger, so a click on it does not count as a
			// click outside that closes the panel it is opening.
			tool(
				"notifications",
				__("Notifications"),
				"bell",
				"sidebar-notification",
				'<span class="notification-count opendesk-rail-count hidden" aria-live="polite"></span>'
			).on(
				"click",
				guarded(() => frappe.ui.sidebar_panels.toggle("notifications"))
			);
		}
		opendesk.rail.tools.forEach((spec) => {
			try {
				if (!spec || !spec.name || (spec.condition && !spec.condition())) return;
				const badge = spec.badge_class
					? `<span class="${frappe.utils.escape_html(
							spec.badge_class
					  )} opendesk-rail-count hidden" aria-live="polite"></span>`
					: "";
				const $button = tool(
					frappe.utils.escape_html(spec.name),
					spec.label || spec.name,
					spec.icon || "square",
					frappe.utils.escape_html(spec.class || ""),
					badge
				);
				// Another app's handler: its failure is that app's, and leaves the rail on.
				if (spec.on_click) {
					$button.on("click", () => {
						try {
							spec.on_click($button);
						} catch (e) {
							console.error(`opendesk: the rail tile ${spec.name} failed`, e);
						}
					});
				}
				if (spec.on_draw) spec.on_draw($button);
			} catch (e) {
				console.error(`opendesk: left the rail tile ${spec && spec.name} out`, e);
			}
		});
		return result;
	});

	// Whether this user may arrange the rail: the editors in `js/arrange.js` say.
	function can_manage() {
		const editors = window.opendesk && opendesk.rail;
		return !!(editors && editors.can_manage && editors.can_manage());
	}

	// The user menu: Manage Dock out, Manage Desk Apps in, where it was (`public/js/user_menu_rows.js`).
	// Manage Modules opens from the module list's header (`draw_list_header`), or is the header
	// menu's last row with the Header Menu picker (`picker_groups`).
	const manage_rail = {
		name: "opendesk-manage-desk-apps",
		label: __("Manage Desk Apps"),
		icon: "monitor",
		condition: can_manage,
		onclick: () => opendesk.rail.manage_rail(),
	};
	opendesk.user_menu.add((groups) =>
		broken
			? groups
			: groups.map((group) =>
					group && Array.isArray(group.options)
						? {
								...group,
								options: group.options.map((row) =>
									row && row.name === "workspace-selector" ? manage_rail : row
								),
						  }
						: group
			  )
	);

	// After an editor saves: the rail, each module's rail app, and the app entries Frappe's header
	// reads, as the server now resolves them -- then everything drawn from them.
	frappe.provide("opendesk.rail");
	opendesk.rail.apply = guarded(function ({ desk_apps, app_data, module_sidebars }) {
		rail_apps.splice(0, rail_apps.length, ...(desk_apps || []));
		// With any module the editor just made, which the page's copy has never seen. Placed in
		// its rail app as it arrives (`js/boot_arrangement.js`).
		if (module_sidebars) frappe.boot.module_sidebars = module_sidebars;
		opendesk.boot_arrangement.adopt(app_data);
		opendesk.boot_arrangement.place(rail_apps);

		const sidebar = frappe.app && frappe.app.sidebar;
		if (!sidebar) return;
		// What a picker or the column is showing is an app of the old rail: the same app on the
		// new one, or nothing if it is gone.
		const fresh = (app) => (app && rail_apps.find((a) => a.key === app.key)) || null;
		if (sidebar.opendesk_picker_app) {
			sidebar.opendesk_picker_app = fresh(sidebar.opendesk_picker_app);
		}
		const column = sidebar.opendesk_column;
		if (column && column.browsing) {
			const app = fresh(column.browsing.app);
			column.browsing = app ? { ...column.browsing, app } : null;
		}
		const list = sidebar.opendesk_module_list;
		if (list) {
			const app = fresh(list.app);
			app ? show_module_list(sidebar, app) : leave_module_list(sidebar);
		} else {
			sidebar.refresh_header();
		}
		refresh_rail(sidebar);
	});

	// Every page can switch apps, so the rail is drawn wherever the page lets Frappe draw a Dock,
	// whether or not the app on screen ships one.
	patch(Sidebar.prototype, "dock_enabled", () => true);

	// The site's mark at the top, leading where Frappe's app mark leads: the Apps screen. Only a
	// logo the site has set (`desk_apps.site_logo`); without one, the home icon rather than the
	// Frappe logo Frappe would fall back to.
	//
	// This and `render_entries` replace Frappe's methods rather than wrapping them: what they draw
	// is not Frappe's with something added, it is something else. So what Frappe adds to either
	// later is lost here without an error -- `test_frappe_seams` fingerprints both, and fails
	// when Frappe's change, so the change is read before it ships.
	patch(Dock.prototype, "render_logo", function () {
		const logo = frappe.boot.opendesk_site_logo;
		const title = __("Home");
		this.$header_logo.html(
			logo
				? frappe.utils.app_logo({ app_title: title, app_logo_url: logo }).icon
				: frappe.utils.icon("home", "md")
		);
		this.$header_title.text(title);
		this.$header.attr("aria-label", __("All apps"));
		if (!this.header_tooltip) {
			this.header_tooltip = new frappe.ui.Tooltip(this.$header[0], {
				text: __("All apps"),
				side: "right",
				delay: 0,
				offset: 10,
				class: "es-tooltip--plain",
			});
		}
	});

	// Apps instead of the open app's modules. Frappe calls this whenever what it would draw
	// changes, which includes moving to another module, so the lit app follows.
	patch(Dock.prototype, "render_entries", function () {
		this.tooltips.forEach((tip) => tip.destroy());
		this.tooltips = [];
		this.$items.empty();

		const sidebar = this.sidebar;
		const current = lit_app(sidebar);

		rail_apps.forEach((app) => {
			if (!choice_count(app)) return;
			const is_active = !!current && app.key === current.key;
			const label = app.title;
			const $item = $(`<button
				class="dock-item opendesk-rail-app ${is_active ? "active" : ""}"
				data-app-key="${frappe.utils.escape_html(app.key)}"
				aria-label="${frappe.utils.escape_html(label)}"
				${is_active ? 'aria-current="page"' : ""}
			>
				<span class="dock-item-icon">${app_mark(app)}</span>
				<span class="dock-item-label">${frappe.utils.escape_html(label)}</span>
			</button>`);
			this.name_tile($item, label);
			$item.on(
				"click",
				guarded(
					() => {
						this.close();
						open_app(sidebar, app);
					},
					() => frappe_open_app(sidebar, app)
				)
			);
			this.$items.append($item);
		});
		// The module column follows the rail: it is drawn whenever the rail is.
		if (column_mode) draw_column(sidebar);
	});

	// And whenever a page shows or hides the sidebar, which takes the column with it; and when the
	// window crosses 768px, where the column gives way to the header menu and comes back, the header
	// with it, since it names the app only where the column does not.
	if (column_mode) {
		let resize_timer = null;
		$(window).on("resize.opendesk-column", () => {
			clearTimeout(resize_timer);
			resize_timer = setTimeout(
				guarded(() => {
					const sidebar = frappe.app && frappe.app.sidebar;
					if (!sidebar || !sidebar.opendesk_column) return;
					const was_on = $("body").hasClass("opendesk-column-on");
					draw_column(sidebar);
					if ($("body").hasClass("opendesk-column-on") !== was_on)
						sidebar.refresh_header();
				}),
				150
			);
		});
		["apply_page_visibility", "toggle"].forEach((method) => {
			if (typeof Sidebar.prototype[method] !== "function") return;
			patch(Sidebar.prototype, method, function (original) {
				const result = original();
				draw_column(this);
				return result;
			});
		});
	}

	// Any rebuild of the sidebar is the real sidebar again.
	patch(Sidebar.prototype, "setup", function (setup) {
		this.opendesk_module_list = null;
		if (this.sidebar_header) clear_list_header(this.sidebar_header);
		return setup();
	});

	// Frappe re-resolves the sidebar on every route change but rebuilds it only when the answer
	// is a different module, which the list never changed. So once the route has moved on from
	// where the list was opened, the list is put away here.
	patch(Sidebar.prototype, "set_workspace_sidebar", function (set_workspace_sidebar) {
		const result = set_workspace_sidebar();
		const list = this.opendesk_module_list;
		if (list && frappe.get_route_str() !== list.route) leave_module_list(this);
		// The same for an app the module column was showing.
		const column = this.opendesk_column;
		if (column && column.browsing && frappe.get_route_str() !== column.browsing.route) {
			leave_column(this);
		}
		// A tile on the Apps screen was picked: its app's module list, now there is a sidebar.
		if (from_apps_screen) {
			const app = from_apps_screen;
			from_apps_screen = null;
			remember_pick(null);
			offer_modules(this, app);
		}
		return result;
	});

	// The Apps screen. Its tiles are links to each app's landing page, which Frappe takes to be
	// the app's first module (`Sidebar.app_landing_route`). The page is still that one, but for
	// an app with a choice to make, its modules are offered, as picking the app on the rail does
	// -- once the route has changed and the sidebar is built (`set_workspace_sidebar` above). A tile leading out of the desk, to a frontend, or for an
	// app with one thing to pick, is left alone.
	//
	// Some tiles link to `/app/...`, the desk's old address, which reloads the page on the way to
	// `/desk/...`. So the pick is also kept in this tab's session storage for a few seconds, and
	// the page it lands on takes it from there.
	const PICK = "opendesk-apps-screen-pick";
	let from_apps_screen = picked_before_reload();
	document.addEventListener(
		"click",
		guarded((event) => {
			from_apps_screen = null;
			if (!(event.target instanceof Element)) return;
			const link = event.target.closest(".desktop-container a[href]");
			if (!link) return;
			from_apps_screen = tile_app(link);
			remember_pick(from_apps_screen);
		}),
		true
	);

	function remember_pick(app) {
		try {
			if (app)
				sessionStorage.setItem(PICK, JSON.stringify({ key: app.key, at: Date.now() }));
			else sessionStorage.removeItem(PICK);
		} catch (e) {
			// Storage refused (a private window, say): a reloading tile simply opens its module.
		}
	}

	function picked_before_reload() {
		try {
			const saved = JSON.parse(sessionStorage.getItem(PICK) || "null");
			sessionStorage.removeItem(PICK);
			if (!saved || Date.now() - saved.at > 15000) return null;
			return rail_apps.find((app) => app.key === saved.key) || null;
		} catch (e) {
			return null;
		}
	}

	// The rail app an Apps screen tile leads into, when it should open on the module list.
	function tile_app(link) {
		const sidebar = frappe.app && frappe.app.sidebar;
		if (!sidebar || typeof sidebar.app_landing_route !== "function") return null;
		const path = (url) => new URL(url, window.location.origin).pathname.replace(/\/$/, "");
		const target = path(link.href);
		if (!/^\/(desk|app)(\/|$)/.test(target)) return null;
		const entry = (frappe.boot.app_data || []).find((candidate) => {
			if (!candidate.on_apps_screen) return false;
			const route = sidebar.app_landing_route(candidate);
			return route && path(route) === target;
		});
		const app = entry && rail_apps.find((candidate) => candidate.app_name === entry.app_name);
		return app && choice_count(app) > 1 ? app : null;
	}

	// Frappe makes the header, and redraws it, as pages settle and modules change, always through
	// here. Over the list it is the app; inside a module, the module over its app -- or, with the
	// Header Menu picker, the app over its module, as the levels run, Frappe's title moving to the
	// line under.
	patch(Sidebar.prototype, "refresh_header", function (refresh_header) {
		const result = refresh_header();
		const header = this.sidebar_header;
		if (this.opendesk_module_list) {
			draw_list_header(this);
		} else if (header && this.opendesk_picker_app) {
			draw_picker_header(header, this.opendesk_picker_app);
		} else if (header) {
			clear_list_header(header);
			const app = rail_app_of(this.current_module);
			if (column_mode && column_shown(this)) {
				// The column beside it names the app; the header names the module alone.
				set_subtitle(header, "");
			} else if (app && (header_picker || column_mode)) {
				const module_title = header.$header_title.text();
				header.$header_title.text(__(app.title));
				// A module called what its app is (Education's, say) is not named twice.
				set_subtitle(header, module_title === __(app.title) ? "" : module_title);
			} else {
				set_subtitle(header, app ? app.title : "");
			}
			mark_lone_row(this, header);
		}
		return result;
	});

	// A header menu of one row is no menu -- the Module Column leaves only Edit Sidebar in it, say.
	// The header then does what that row does, on a click (Enter and Space arrive as clicks too),
	// without the chevron, and names the row in its tooltip. Taken in the capture phase, so the
	// menu's own listener on the header never opens a menu of one.
	//
	// Only beside the Module Column: every other picker keeps the modules in this menu, so it is
	// never one row there, and the menu's rows are only read where they can be. Reading them runs
	// the site's own row conditions (Navbar Settings), and one that throws means a menu, not a
	// broken rail.
	function lone_row(header) {
		if (!column_mode || !column_shown(header.sidebar)) return null;
		try {
			return only_visible_row(header);
		} catch (e) {
			return null;
		}
	}

	function only_visible_row(header) {
		const rows = [];
		const take = (row) => {
			if (row && (!row.condition || row.condition())) rows.push(row);
		};
		(header.menu_items() || []).forEach((entry) => {
			if (entry && Array.isArray(entry.options)) entry.options.forEach(take);
			else take(entry);
		});
		return rows.length === 1 && !rows[0].submenu ? rows[0] : null;
	}

	function mark_lone_row(sidebar, header) {
		if (!column_mode) return;
		const row = lone_row(header);
		header.$drop_icon && header.$drop_icon.toggleClass("hidden", !!row);
		header.wrapper.attr("title", row ? row.label : null);
		if (header.opendesk_lone_guard) return;
		header.wrapper.get(0).addEventListener(
			"click",
			guarded((event) => {
				// The module list and the picker draw headers of their own.
				if (sidebar.opendesk_module_list || sidebar.opendesk_picker_app) return;
				const only = lone_row(header);
				if (!only) return;
				event.stopImmediatePropagation();
				event.preventDefault();
				if (only.onclick) only.onclick(event);
				else if (only.href && only.target) window.open(only.href, only.target);
				else if (only.href) window.location.assign(only.href);
			}),
			true
		);
		header.opendesk_lone_guard = true;
	}

	// Back to the header Frappe draws for a module.
	function clear_list_header(header) {
		header.wrapper
			.removeClass("opendesk-module-list-header opendesk-module-list-header--manageable")
			.removeAttr("title");
		header.$drop_icon && header.$drop_icon.removeClass("hidden");
	}

	// The line under the header's title, in Frappe's own `.header-subtitle` style. Frappe's header
	// has none of its own, so it is added the first time and dropped when there is nothing to say.
	function set_subtitle(header, text) {
		let $subtitle = header.wrapper.find(".title-container .header-subtitle");
		if (!text) {
			$subtitle.remove();
			return;
		}
		if (!$subtitle.length) {
			$subtitle = $('<div class="header-subtitle"></div>').appendTo(
				header.wrapper.find(".title-container")
			);
		}
		$subtitle.text(text);
	}

	// The header menu's switcher rows become the open app's module list: its frontend first, then
	// its modules under their Categories, a Spacer starting a new group.
	//
	// With the Header Menu picker the modules come under the app's name, then Manage Modules; and
	// opened from the rail on another app that is all it holds, since the rest of the menu
	// concerns the sidebar on screen, which is not that app's.
	patch(Header.prototype, "menu_items", function (menu_items) {
		const items = menu_items();
		const open_app = rail_app_of(this.sidebar.current_module);
		const app = this.sidebar.opendesk_picker_app || open_app;
		// A module no rail app holds (one its app's Dock hides, say) still gets the rail's apps
		// in place of Frappe's "Apps" row, which lists every `app_data` entry on the Apps screen
		// -- per-module tiles among them, when the Apps screen is arranged from the rail.
		if (!app) return without_app_switcher(items, app_switcher(this, this.sidebar));
		// The module column lists the modules, so the menu does not list them again.
		if (column_mode && column_shown(this.sidebar)) {
			return [
				...app_switcher(this, this.sidebar),
				...items.filter((group) => !is_switcher(group)),
			];
		}
		const modules =
			header_picker || column_mode
				? picker_groups(this.sidebar, app)
				: module_groups(this.sidebar, app);
		if (app !== open_app) return modules;
		return [
			...modules,
			...app_switcher(this, this.sidebar),
			...items.filter((group) => !is_switcher(group)),
		];
	});

	// The app's modules under its name, then Manage Modules for whoever may arrange the rail.
	function picker_groups(sidebar, app) {
		const groups = module_groups(sidebar, app);
		if (groups.length && !groups[0].group) groups[0].group = __(app.title);
		else groups.unshift({ group: __(app.title), options: [] });
		groups.push({
			group: "",
			options: [
				{
					name: "opendesk-manage-modules",
					label: __("Manage Modules"),
					icon: "settings-2",
					condition: can_manage,
					onclick: () => opendesk.rail.manage_modules(app.key),
				},
			],
		});
		return groups;
	}

	// Frappe's rows less its "Apps" row -- and its way out to the Apps screen, when the rail's own
	// switcher carries one -- then the rail's switcher.
	function without_app_switcher(items, switcher) {
		const dropped = new Set(["switch-app", ...(switcher.length ? ["all-apps"] : [])]);
		const kept = items
			.map((group) =>
				group && Array.isArray(group.options)
					? {
							...group,
							options: group.options.filter(
								(row) => !(row && dropped.has(row.name))
							),
					  }
					: group
			)
			.filter((group) => !group || !Array.isArray(group.options) || group.options.length);
		return [...kept, ...switcher];
	}

	// Frappe's switcher group, known by its rows rather than by where it sits: Modules, Apps, and
	// the way out to the Apps screen (`SidebarHeader.switcher_items`). A group that holds nothing
	// else is the switcher, whatever else Frappe puts in the menu or in what order.
	const SWITCHER_ROWS = new Set(["switch-module", "switch-app", "all-apps"]);
	function is_switcher(group) {
		const rows = (group && Array.isArray(group.options) && group.options) || [];
		return rows.length > 0 && rows.every((row) => row && SWITCHER_ROWS.has(row.name));
	}

	// Where the rail cannot be reached -- below 768px, where the sidebar is a drawer and the
	// rail is not drawn, or a touch screen with the rail floating out of reach -- the header
	// menu is the only way to another app, as Frappe's own switcher is there. So it carries the
	// rail's apps, then the way out to the Apps screen. Read on every open, as the menu's rows are.
	function app_switcher(header, sidebar) {
		const dock = sidebar.dock;
		const reachable =
			!frappe.is_mobile() &&
			!!dock &&
			dock.enabled &&
			(dock.is_pinned || Dock.pointer_can_reveal?.());
		if (reachable) return [];
		const apps = rail_apps
			.filter((app) => choice_count(app))
			.map((app) => ({
				name: `opendesk-rail-app-${app.key}`,
				label: __(app.title),
				onclick: guarded(
					() => open_app(sidebar, app),
					() => frappe_open_app(sidebar, app)
				),
			}));
		return [
			{
				group: "",
				options: [
					{
						name: "opendesk-switch-app",
						label: __("Apps"),
						icon: "layout-dashboard",
						submenu: [
							{ group: "", options: apps },
							{
								group: "",
								options:
									typeof header.all_apps_item === "function"
										? [header.all_apps_item()]
										: [],
							},
						],
					},
				],
			},
		];
	}

	function module_groups(sidebar, app) {
		const groups = [];
		let group = null;
		const start = (label) => {
			group = { group: label || "", options: [] };
			groups.push(group);
		};

		if (app.frontend) {
			start();
			group.options.push({
				name: "opendesk-rail-frontend",
				label: app.frontend.label,
				icon: "external-link",
				href: app.frontend.url,
			});
		}

		modules_of(app).forEach((entry, index) => {
			if (entry.category) {
				start(__(entry.category));
			} else if (!group || (entry.space_before && index > 0)) {
				start();
			}
			group.options.push({
				name: `opendesk-rail-module-${entry.shell}`,
				label: __(entry.label),
				icon: entry.icon || frappe.get_module_icon(entry.shell),
				// The Header Menu's rows are the only place modules are listed, so the one on
				// screen is marked there.
				selected: (header_picker || column_mode) && entry.shell === sidebar.current_module,
				onclick: guarded(
					() => open_module(sidebar, entry.shell, "fade"),
					() => sidebar.open_module(entry.shell)
				),
			});
		});
		return groups;
	}
})();
