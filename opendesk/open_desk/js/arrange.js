// The rail's two editors, in Frappe's own arrangement editor.
//
// `frappe.ui.ArrangementEditor` is the one editor Frappe 16.50 has for "an ordered list of entries
// more than one party can arrange" -- Manage Dock and Edit Sidebar are both built on it. It holds
// the list, the drag, the eye, the preview, the layer switch and the save; a surface supplies what
// its entries are and where they are read from and written to. These are two more surfaces:
//
//   Manage Desk Apps     the apps on the rail, in order; the eye takes one off it (Hide from Rail).
//                   Each row opens that app's Manage Modules and says how the app shows on the
//                   Apps screen, and the preview shows either the rail or the Apps screen. Add
//                   makes a new app, whose modules are drafted from its row and saved with it.
//   Manage Modules  one app's module list: order, Category and Spacer rows, and the eye, which
//                   takes a module off this app's list (an installed app's own module then goes
//                   to Other). Add puts a module, a new module, a heading or a gap on it. A new
//                   module is made on Save, so filling a new app never leaves the editor. A
//                   module is called what its sidebar calls it, so only headings are renamed here.
//
// Both write Desk App records, through `opendesk.open_desk.arrange`, which says how.
// There is one layer, the site's ("For everyone"): Desk Apps are site records.
//
// The editor is not in the desk bundle (Frappe loads it on demand, as Manage Dock does), so the
// two classes are defined once it has loaded. Off unless the rail or the Apps screen is switched
// on; with only the Apps screen, it is about the Apps screen alone.
//
// Manage Desk Apps also opens from the Apps screen's own avatar menu, through the entry point
// Frappe's Apps screen offers apps (`DesktopPage.add_menu_item`, handed over with the
// `desktop_screen` event it fires as it sets up).
(function () {
	const features = (frappe.boot && frappe.boot.opendesk_features) || {};
	if (!features.navigation_rail && !features.apps_screen) return;

	frappe.provide("opendesk.rail");

	const METHOD = "opendesk.open_desk.arrange";
	let editors = null;

	function load() {
		if (editors) return Promise.resolve(editors);
		return frappe.require("arrangement_editor.bundle.js").then(() => {
			if (!frappe.ui.ArrangementEditor) throw new Error("ArrangementEditor is missing");
			editors = define();
			return editors;
		});
	}

	function failed(e) {
		console.error("opendesk: could not open the editor", e);
		frappe.ui.toast({
			message: __("Could not open the editor. Please refresh the page."),
			type: "error",
		});
	}

	opendesk.rail.manage_rail = () =>
		load()
			.then(({ RailEditor }) => new RailEditor())
			.catch(failed);

	// `on_saved` runs once the editor has saved (Manage Desk Apps refreshes its row from it).
	opendesk.rail.manage_modules = (app_key, { on_saved } = {}) =>
		load()
			.then(({ ModulesEditor }) => {
				// The base class builds the dialog in its constructor, so the app it is about is
				// handed over before that runs.
				ModulesEditor.next = { key: app_key, on_saved };
				return new ModulesEditor();
			})
			.catch(failed);

	// Manage Modules for an app Manage Desk Apps has added but not saved: `{title, rows, on_done}`.
	// Nothing is stored; Save hands the rows back (`on_done`), and Manage Desk Apps' own Save makes the
	// app and its modules together.
	opendesk.rail.draft_modules = (draft) =>
		load()
			.then(({ ModulesEditor }) => {
				ModulesEditor.next = { draft };
				return new ModulesEditor();
			})
			.catch(failed);

	// Whether this user may write the records both editors save to.
	opendesk.rail.can_manage = () =>
		!!frappe.model.can_write && frappe.model.can_write("Desk App");

	// What the editor is called, in both menus and over its dialog: it arranges the Desk Apps, on
	// the rail and on the Apps screen.
	const MANAGE_LABEL = "Manage Desk Apps";

	$(document).on("desktop_screen", (event, data) => {
		const desktop = data && data.desktop;
		if (!desktop || typeof desktop.add_menu_item !== "function") return;
		if (!opendesk.rail.can_manage()) return;
		// Frappe translates the label; a second call with the same one adds nothing.
		desktop.add_menu_item({
			icon: "layout-grid",
			label: MANAGE_LABEL,
			order: 25,
			onclick: () => opendesk.rail.manage_rail(),
		});
	});

	// After a save: the rail redraws itself (`opendesk.rail.apply`); without it, the boot takes
	// the new arrangement here. Either way an Apps screen on screen is drawn again from it.
	function apply_saved(payload) {
		// The workspaces as the server has them now, with any a new module brought: the desk's
		// router finds a page by these, so without them a new module's Home is "not found".
		// Frappe builds its lookups from the boot's copy, so it is handed over and rebuilt by Frappe.
		if (
			payload.workspaces &&
			frappe.app &&
			typeof frappe.app.setup_workspaces === "function"
		) {
			frappe.boot.workspaces = payload.workspaces;
			frappe.app.setup_workspaces();
		}
		if (opendesk.rail.apply) {
			opendesk.rail.apply(payload);
		} else if (opendesk.boot_arrangement && opendesk.boot_arrangement.adopt) {
			if (payload.module_sidebars) frappe.boot.module_sidebars = payload.module_sidebars;
			opendesk.boot_arrangement.adopt(payload.app_data);
		}
		const route = frappe.get_route();
		const page = frappe.pages && frappe.pages.desktop && frappe.pages.desktop.desktop_page;
		if (["desktop", ""].includes(route[0]) && page && typeof page.update === "function") {
			page.update();
		}
	}

	function define() {
		const Base = frappe.ui.ArrangementEditor;

		// The letter tile Frappe draws for something with no mark of its own. Frappe's editor sizes
		// the icons in its rows but not this tile's box, which then takes the Apps screen's size;
		// the class lets `rail.scss` hold it to the rows' 18px.
		function letter_tile(label) {
			return `<span class="opendesk-arrange-letter">${frappe.utils.desktop_icon(
				label,
				"gray",
				"sm",
				"Solid"
			)}</span>`;
		}

		// An app's mark, as the rail draws it: its logo, else its icon, else a letter tile.
		function app_mark(entry) {
			if (entry.logo) {
				return `<img src="${frappe.utils.escape_html(
					entry.logo
				)}" alt="" class="opendesk-arrange-logo">`;
			}
			return entry.icon ? frappe.utils.icon(entry.icon, "md") : letter_tile(entry.label);
		}

		// How an app can show on the Apps screen: the Desk App's Apps Screen options, in order.
		const SCREEN_MODES = [
			["Default", __("Default")],
			["One Icon", __("One Icon")],
			["Icon per Module", __("Icon per Module")],
			["App and Module Icons", __("App and Module Icons")],
			["Hidden", __("Hidden")],
		];

		// A tile as the Apps screen preview draws it: a picture, then its name under it.
		function screen_tile(tile) {
			const picture = tile.logo
				? `<img src="${frappe.utils.escape_html(tile.logo)}" alt="">`
				: tile.icon
				? frappe.utils.icon(tile.icon, "md")
				: letter_tile(tile.label);
			return `<div class="opendesk-screen-tile">
				<span class="opendesk-screen-picture">${picture}</span>
				<span class="opendesk-screen-label">${frappe.utils.escape_html(__(tile.label))}</span>
			</div>`;
		}

		class RailEditor extends Base {
			get layers() {
				return {
					site: {
						read: `${METHOD}.get_rail`,
						save: `${METHOD}.save_rail`,
						label: () => __("For everyone"),
						saved: () => __("Rail updated for everyone"),
					},
				};
			}

			// The one layer there is is the site's, so the editor opens on it.
			prepare() {
				this.can_curate_site = true;
				this.next_new = 0;
			}

			title() {
				return __(MANAGE_LABEL);
			}

			can_add() {
				return true;
			}

			// A new app is only an entry until Save, which makes it; a cross takes it out before.
			is_own_add(key) {
				return !!this.entries.get(key).new;
			}

			add() {
				if (!this.loaded) return;
				const dialog = new frappe.ui.Dialog({
					title: __("New Desk App"),
					fields: [
						{
							fieldname: "title",
							fieldtype: "Data",
							label: __("Title"),
							description: __(
								"What the rail's tooltip and the sidebar header call it."
							),
						},
						{
							fieldname: "icon",
							fieldtype: "Icon",
							label: __("Icon"),
							description: __("A logo can be set on the Desk App afterwards."),
						},
					],
					primary_action_label: __("Add"),
					primary_action: ({ title, icon }) => {
						title = (title || "").trim();
						if (!title) {
							frappe.msgprint(__("A new app needs a title."));
							return;
						}
						const taken = [...this.entries.values()].some(
							(entry) => entry.label.toLowerCase() === title.toLowerCase()
						);
						if (taken) {
							frappe.msgprint(__("There is already an app called {0}.", [title]));
							return;
						}
						const key = `new:${this.next_new++}`;
						this.entries.set(key, {
							label: title,
							icon: icon || null,
							roles: [],
							apps_screen: "Default",
							screen: {},
							module_count: 0,
							// Its module list, drafted from its row until Manage Desk Apps saves.
							draft_rows: [],
							new: true,
						});
						this.order.push(key);
						this.render_panes();
						dialog.hide();
					},
				});
				dialog.show();
			}

			copy() {
				return {
					list_head: __("Apps"),
					add_label: __("New Desk App"),
					list_sub: __(
						"Drag to reorder. The eye takes an app off the rail. A new app shows on the rail once it has modules."
					),
					reset_title: __("Put every app back on the rail."),
					list_empty: __("There are no apps"),
					preview_head: __("Preview"),
					preview_sub: __("The rail as this arrangement leaves it."),
					preview_empty: __("Nothing on the rail"),
					load_error: __("Could not load the rail. Please try again."),
				};
			}

			async read() {
				const apps = await frappe.xcall(this.layer_config.read);
				this.entries = new Map();
				apps.forEach((app) =>
					this.entries.set(app.key, {
						label: app.title,
						icon: app.icon,
						logo: app.logo,
						roles: app.roles || [],
						module_count: app.module_count || 0,
						// For an app Frappe lists nowhere: what it holds and draws once shown, since
						// while hidden its modules are counted under Other.
						own_module_count: app.own_module_count || 0,
						own_screen: app.own_screen || {},
						saved_hidden: !!app.hidden,
						apps_screen: app.apps_screen || "Default",
						// Frappe does not list it as somewhere to go, so its modules are in Other
						// until it is shown.
						unlisted: !!app.unlisted,
						// The tiles each setting would draw, worked out by the server by the rule
						// the Apps screen itself is arranged by.
						screen: app.screen || {},
					})
				);
				this.arrange(
					apps.map((app) => app.key),
					apps.filter((app) => app.hidden).map((app) => app.key)
				);
			}

			entry_icon(entry) {
				return app_mark(entry);
			}

			// The preview shows the rail, or the Apps screen as this arrangement leaves it -- the
			// one that is switched on, or either when both are.
			render() {
				this.view = this.view || (features.navigation_rail ? "rail" : "screen");
				super.render();
				if (!features.navigation_rail || !features.apps_screen) return;
				const $switch = $(`<span class="opendesk-preview-switch">
					<button class="btn btn-xs" data-view="rail">${__("Rail")}</button>
					<button class="btn btn-xs" data-view="screen">${__("Apps screen")}</button>
				</span>`).appendTo(this.$body.find(".ws-pane-preview .ws-pane-head"));
				$switch.find("button").on("click", (event) => {
					this.view = $(event.currentTarget).data("view");
					this.render_panes();
				});
			}

			render_preview() {
				this.$body
					.find(".opendesk-preview-switch button")
					.each((_, button) =>
						$(button).toggleClass("btn-primary", $(button).data("view") === this.view)
					);
				this.$body
					.find(".ws-pane-preview .ws-pane-sub")
					.text(
						this.view === "screen"
							? __("The Apps screen as this arrangement leaves it.")
							: this.copy().preview_sub
					);
				if (this.view !== "screen") return super.render_preview();
				const tiles = this.selection.flatMap((key) => this.tiles(key));
				this.$preview.empty();
				if (!tiles.length) {
					this.$preview.append(
						`<div class="ws-empty text-muted">${__(
							"Nothing on the Apps screen"
						)}</div>`
					);
					return;
				}
				this.$preview.append(
					`<div class="opendesk-screen-preview">${tiles.map(screen_tile).join("")}</div>`
				);
			}

			// The tiles an app draws on the Apps screen with its setting. A new app, which the
			// server has not seen, draws one tile under its own name, as an app of the site's
			// own does by default.
			tiles(key) {
				const entry = this.entries.get(key);
				if (entry.unlisted && !this.hidden.has(key)) {
					return entry.own_screen[entry.apps_screen] || [];
				}
				if (!entry.new) return entry.screen[entry.apps_screen] || [];
				const mode = entry.apps_screen;
				const own = ["Default", "One Icon", "App and Module Icons"].includes(mode)
					? [{ label: entry.label, icon: entry.icon }]
					: [];
				const modules = ["Icon per Module", "App and Module Icons"].includes(mode)
					? entry.draft_rows
							.filter((row) => row.kind === "module" && !row.hidden)
							.map((row) => ({ label: row.module }))
					: [];
				return [...own, ...modules];
			}

			// The line under an app's name: its modules, as a link opening Manage Modules for it over
			// this editor, then that only some roles see it, when they do. A saved app's Manage Modules saves itself and the row is
			// refreshed from it; a new one's drafts its rows here, to be saved with this editor.
			// How many modules a row holds as the arrangement on screen leaves it: an app Frappe
			// lists nowhere holds its own once shown, and Other gives them up.
			module_count(key) {
				const entry = this.entries.get(key);
				if (entry.unlisted) return this.hidden.has(key) ? 0 : entry.own_module_count;
				if (key !== "app:Other") return entry.module_count;
				let given_up = 0;
				this.entries.forEach((other, other_key) => {
					if (other.unlisted && !this.hidden.has(other_key))
						given_up += other.own_module_count;
				});
				return Math.max(entry.module_count - given_up, 0);
			}

			sub_line(key) {
				const entry = this.entries.get(key);
				const count = this.module_count(key);
				const $line = $('<span class="opendesk-row-sub"></span>');
				$(
					`<button class="btn-reset opendesk-row-modules" title="${frappe.utils.escape_html(
						__("Manage this app's modules")
					)}"></button>`
				)
					.text(
						count
							? count === 1
								? __("1 module")
								: __("{0} modules", [count])
							: __("Add modules")
					)
					.on("click", () => this.open_modules(key))
					.appendTo($line);
				const note = (text, title) =>
					$('<span class="opendesk-row-note"></span>')
						.text(text)
						.attr("title", title)
						.appendTo($line);
				if (entry.roles.length) note(__("Some roles"), entry.roles.join(", "));
				return $line;
			}

			open_modules(key) {
				const entry = this.entries.get(key);
				// Shown here but not saved yet: its modules are still Other's on the server, which is
				// what Manage Modules would edit.
				if (entry.unlisted && entry.saved_hidden !== this.hidden.has(key)) {
					frappe.show_alert({
						message: __("Save first, then manage {0}'s modules.", [entry.label]),
						indicator: "orange",
					});
					return;
				}
				if (!entry.new) {
					opendesk.rail.manage_modules(key, { on_saved: () => this.refresh_rows() });
					return;
				}
				opendesk.rail.draft_modules({
					title: entry.label,
					rows: entry.draft_rows,
					on_done: (rows) => {
						entry.draft_rows = rows;
						entry.module_count = rows.filter(
							(row) => row.kind === "module" && !row.hidden
						).length;
						this.render_panes();
					},
				});
			}

			// After an app's modules were saved over this editor: what the server now says about each
			// app's modules and tiles, without touching the order, visibility or settings on screen.
			async refresh_rows() {
				const apps = await frappe.xcall(this.layer_config.read);
				apps.forEach((app) => {
					const entry = this.entries.get(app.key);
					if (!entry || entry.new) return;
					entry.module_count = app.module_count || 0;
					entry.screen = app.screen || {};
					entry.own_module_count = app.own_module_count || 0;
					entry.own_screen = app.own_screen || {};
				});
				this.render_panes();
			}

			// Each row's Apps Screen setting, as a button opening the choices. An app off the
			// rail is off the Apps screen too, so its row has no setting until it is back.
			decorate_item($el, key) {
				// The name over its line of detail, in one column where the name was.
				const $label = $el.find(".ws-item-label").first();
				$('<span class="opendesk-row-text"></span>')
					.insertBefore($label)
					.append($label)
					.append(this.sub_line(key));
				// Off the rail only because Frappe lists it nowhere: where its Apps Screen setting
				// would be, greyed, where its modules are.
				if (this.entries.get(key).unlisted && this.hidden.has(key)) {
					$('<span class="opendesk-screen-mode opendesk-in-other"></span>')
						.text(__("in Other"))
						.attr(
							"title",
							__(
								"Frappe does not list this app as somewhere to go, so its modules are under Other. Show it to give it a place of its own."
							)
						)
						.appendTo($el);
					return;
				}
				if (!features.apps_screen || this.hidden.has(key)) return;
				const entry = this.entries.get(key);
				const label = (SCREEN_MODES.find(([mode]) => mode === entry.apps_screen) || [])[1];
				const $button = $(
					`<button class="btn btn-xs opendesk-screen-mode" title="${frappe.utils.escape_html(
						__("How this app shows on the Apps screen")
					)}">${frappe.utils.icon("layout-grid", "xs")}<span></span></button>`
				);
				$button.find("span").text(label || entry.apps_screen);
				$el.append($button);
				new frappe.ui.Dropdown({
					trigger: $button,
					align: "end",
					options: [
						{
							group: __("Apps screen"),
							options: SCREEN_MODES.map(([mode, mode_label]) => ({
								name: `opendesk-screen-${mode}`,
								label: mode_label,
								selected: entry.apps_screen === mode,
								onclick: () => {
									entry.apps_screen = mode;
									this.render_panes();
								},
							})),
						},
					],
				});
			}

			hide_tooltip(key, hidden) {
				return hidden ? __("Put back on the rail") : __("Take off the rail");
			}

			reset() {
				this.hidden = new Set();
				this.render_panes();
			}

			save_args() {
				return {
					items: JSON.stringify(
						this.arranged_rows((key, hidden) => {
							const entry = this.entries.get(key);
							const apps_screen = entry.apps_screen;
							return entry.new
								? {
										key,
										hidden,
										apps_screen,
										new: true,
										title: entry.label,
										icon: entry.icon,
										modules: entry.draft_rows,
								  }
								: { key, hidden, apps_screen };
						})
					),
				};
			}

			apply(payload) {
				apply_saved(payload);
			}
		}

		class ModulesEditor extends Base {
			get layers() {
				return {
					site: {
						read: `${METHOD}.get_app_modules`,
						save: `${METHOD}.save_app_modules`,
						label: () => __("For everyone"),
						saved: () => __("Modules updated for everyone"),
					},
				};
			}

			prepare() {
				const next = ModulesEditor.next || {};
				ModulesEditor.next = null;
				// A draft is an app Manage Desk Apps has not saved yet: its rows come from there and go back.
				this.draft = next.draft || null;
				this.on_saved = next.on_saved;
				this.app_key = next.key;
				// A new app with no modules is not on the rail yet; its title is read with its rows.
				this.app = (frappe.boot.desk_apps || []).find((a) => a.key === this.app_key);
				this.can_curate_site = true;
				this.next_marker = 0;
			}

			title() {
				// Dialog titles are written as HTML, so a record's title is escaped.
				if (this.draft) {
					return __("Manage {0} Modules", [frappe.utils.escape_html(this.draft.title)]);
				}
				return this.app
					? __("Manage {0} Modules", [frappe.utils.escape_html(__(this.app.title))])
					: __("Manage Modules");
			}

			copy() {
				return {
					list_head: __("Modules"),
					add_label: __("Add"),
					list_sub: this.is_other
						? __(
								"Drag to reorder. Other holds every module no app claims, so nothing is taken off it here: add a module to another app instead."
						  )
						: this.installed
						? __(
								"Drag to reorder. The eye takes a module off this app's list, and it goes to Other."
						  )
						: __(
								"Drag to reorder. The eye takes a module off this app, back to the app it came from."
						  ),
					reset_title: __("Put every module back on this app's list."),
					list_empty: __("This app has no modules"),
					preview_head: __("Preview"),
					preview_sub: __("The module list as this arrangement leaves it."),
					preview_empty: __("No modules"),
					load_error: __("Could not load the modules. Please try again."),
				};
			}

			async read() {
				const data = this.draft
					? { title: this.draft.title, installed_app: null, rows: this.draft.rows || [] }
					: await frappe.xcall(this.layer_config.read, { key: this.app_key });
				this.data_title = data.title;
				if (!this.app) {
					this.dialog.set_title(
						__("Manage {0} Modules", [frappe.utils.escape_html(__(data.title))])
					);
				}
				// An installed app's: taking a module off sends it to Other. Other's: it cannot.
				this.installed = !!data.installed_app;
				this.is_other = data.installed_app === "Other";
				this.entries = new Map();
				const order = [];
				const hidden = [];
				data.rows.forEach((row) => {
					const key = this.key_for(row);
					this.entries.set(key, this.entry_for(row));
					order.push(key);
					if (row.hidden) hidden.push(key);
				});
				this.arrange(order, hidden);
			}

			key_for(row) {
				if (row.kind === "module") return `module:${row.module}`;
				return `${row.kind}:${this.next_marker++}`;
			}

			entry_for(row) {
				if (row.kind === "spacer") return { kind: "spacer", label: __("Spacer") };
				if (row.kind === "category") return { kind: "category", label: row.label };
				return {
					kind: "module",
					module: row.module,
					label: row.label || row.module,
					icon: row.icon,
					new: !!row.new,
				};
			}

			// A new module in plain sight, beside Add, as well as among Add's types.
			extra_pane_actions() {
				if (!frappe.model.can_create("Module Def")) return [];
				return [
					{
						label: __("New Module"),
						title: __("Make a module of this site's own, saved with this list"),
						onClick: () =>
							frappe.prompt(
								{
									fieldname: "name",
									fieldtype: "Data",
									label: __("Module Name"),
									reqd: 1,
								},
								({ name }) => this.place_new_module((name || "").trim()),
								__("New Module"),
								__("Add")
							),
					},
				];
			}

			// A draft's Save gives its rows back to Manage Desk Apps; a saved app's saves as usual.
			async save() {
				if (!this.draft) {
					await super.save();
					if (this.on_saved) this.on_saved();
					return;
				}
				if (!this.loaded) return;
				this.sync_order();
				this.draft.on_done(JSON.parse(this.save_args().items));
				this.dialog.hide();
			}

			entry_icon(entry) {
				if (entry.kind !== "module") return "";
				return entry.icon ? frappe.utils.icon(entry.icon, "md") : letter_tile(entry.label);
			}

			item_classes(key) {
				const kind = this.entries.get(key).kind;
				return kind === "module" ? "" : `opendesk-arrange-${kind}`;
			}

			// Headings, gaps and modules not made yet are this list's own: a cross removes one, where
			// a module has the eye.
			is_own_add(key) {
				const entry = this.entries.get(key);
				return entry.kind !== "module" || !!entry.new;
			}

			// Other has nowhere further to send a module, so its list is ordered and labelled only.
			visibility_button(key) {
				if (this.is_other) return $();
				return super.visibility_button(key);
			}

			hide_tooltip(key, hidden) {
				if (hidden) return __("Put back on this app's list");
				return this.installed
					? __("Take off this app's list (it goes to Other)")
					: __("Take off this app");
			}

			// A pencil on headings. A module is renamed in its own sidebar (Edit Sidebar).
			decorate_item($el, key) {
				const entry = this.entries.get(key);
				if (entry.kind !== "category") return;
				$(
					`<button class="ws-item-eye opendesk-arrange-rename" title="${__(
						"Rename"
					)}">${frappe.utils.icon("edit", "sm")}</button>`
				)
					.on("click", () => this.rename(key))
					.appendTo($el);
			}

			rename(key) {
				const entry = this.entries.get(key);
				frappe.prompt(
					{
						fieldname: "label",
						fieldtype: "Data",
						label: __("Heading"),
						default: entry.label,
						reqd: 1,
					},
					({ label }) => {
						entry.label = label.trim();
						this.render_panes();
					},
					__("Rename")
				);
			}

			preview_item(key) {
				const entry = this.entries.get(key);
				if (entry.kind === "spacer") return $('<div class="opendesk-arrange-gap"></div>');
				if (entry.kind === "category") {
					return $('<div class="ws-preview-item opendesk-arrange-heading"></div>').text(
						entry.label
					);
				}
				return super.preview_item(key);
			}

			can_add() {
				return true;
			}

			add() {
				if (!this.loaded) return;
				const dialog = new frappe.ui.Dialog({
					title: __("Add to {0}", [
						frappe.utils.escape_html(
							__(this.app ? this.app.title : this.data_title || "")
						),
					]),
					fields: [
						{
							fieldname: "kind",
							fieldtype: "Select",
							label: __("Type"),
							options: [
								{ value: "module", label: __("Module") },
								...(frappe.model.can_create("Module Def")
									? [{ value: "new_module", label: __("New module") }]
									: []),
								{ value: "category", label: __("Category heading") },
								{ value: "spacer", label: __("Spacer") },
							],
							default: "module",
						},
						{
							fieldname: "module",
							fieldtype: "Link",
							options: "Module Def",
							label: __("Module"),
							// Its "Create a new Module Def" would open the form and lose this
							// editor; "New module" above makes one here instead.
							only_select: 1,
							depends_on: "eval:doc.kind == 'module'",
						},
						{
							fieldname: "module_name",
							fieldtype: "Data",
							label: __("Module Name"),
							description: __(
								"A new module of this site's own, made when you save. Its sidebar starts with a Home page."
							),
							depends_on: "eval:doc.kind == 'new_module'",
						},
						{
							fieldname: "label",
							fieldtype: "Data",
							label: __("Heading"),
							depends_on: "eval:doc.kind == 'category'",
						},
					],
					primary_action_label: __("Add"),
					primary_action: (values) => {
						if (this.place(values)) dialog.hide();
					},
				});
				dialog.show();
			}

			// New rows go at the end of the list; a module already on it is put back if it was
			// taken off, and otherwise left where it is. What each type needs is checked here
			// rather than with `mandatory_depends_on`, which can read the type from before it was
			// changed.
			place({ kind, module, module_name, label }) {
				label = (label || "").trim();
				if (kind === "new_module")
					return this.place_new_module((module_name || "").trim());
				if (kind === "module" && !module) {
					frappe.msgprint(__("Pick a module."));
					return false;
				}
				if (kind === "category" && !label) {
					frappe.msgprint(__("A category needs a heading."));
					return false;
				}
				if (kind === "module") {
					const key = `module:${module}`;
					if (this.entries.has(key)) {
						if (this.hidden.has(key)) {
							this.hidden.delete(key);
							this.render_panes();
							return true;
						}
						frappe.show_alert({
							message: __("{0} is already on this list", [module]),
							indicator: "orange",
						});
						return false;
					}
					const sidebar = frappe.utils.sidebar_for_module(module);
					this.entries.set(key, {
						kind,
						module,
						label: (sidebar && sidebar.label) || module,
						icon: sidebar && sidebar.header_icon,
					});
					this.order.push(key);
				} else {
					const key = this.key_for({ kind });
					this.entries.set(key, this.entry_for({ kind, label }));
					this.order.push(key);
				}
				this.render_panes();
				return true;
			}

			// A module that does not exist yet, at the end of the list, made when the editor saves.
			place_new_module(name) {
				if (!name) {
					frappe.msgprint(__("A new module needs a name."));
					return false;
				}
				const taken =
					this.entries.has(`module:${name}`) ||
					Object.entries(frappe.boot.module_sidebars || {}).some(
						([shell, sidebar]) =>
							shell === name || (sidebar && sidebar.module === name)
					);
				if (taken) {
					frappe.msgprint(
						__("There is already a module called {0}. Add it as a Module instead.", [
							frappe.utils.escape_html(name),
						])
					);
					return false;
				}
				const key = `module:${name}`;
				this.entries.set(key, { kind: "module", module: name, label: name, new: true });
				this.order.push(key);
				this.render_panes();
				return true;
			}

			// A module not made yet says so beside its name.
			item_extras(key) {
				return this.entries.get(key).new
					? `<span class="ws-item-chip text-muted">${__("New")}</span>`
					: "";
			}

			reset() {
				this.hidden = new Set();
				this.render_panes();
			}

			save_args() {
				const rows = this.arranged_rows((key, hidden) => {
					const entry = this.entries.get(key);
					return {
						kind: entry.kind,
						module: entry.module || null,
						label: entry.kind === "category" ? entry.label : null,
						new: !!entry.new,
						hidden,
					};
				});
				return { key: this.app_key, items: JSON.stringify(rows) };
			}

			apply(payload) {
				apply_saved(payload);
			}
		}

		return { RailEditor, ModulesEditor };
	}
})();
