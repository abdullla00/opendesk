// Copyright (c) 2026, Peter and contributors
// For license information, please see license.txt

frappe.ui.form.on("Desk App", {
	setup(frm) {
		frm.installed_app_options = frappe.xcall(
			"opendesk.open_desk.doctype.desk_app.desk_app.installed_app_options"
		);
	},

	refresh(frm) {
		// Autocomplete reads its options only when it first draws, which is
		// usually before the call above answers, so they are handed to the
		// control itself as well as to its docfield.
		frm.installed_app_options.then((options) => {
			frm.fields_dict.installed_app.df.options = options;
			frm.fields_dict.installed_app.set_data?.(options);
		});
	},

	// A record standing for an installed app is usually called what the app is,
	// so an empty title takes the app's; one already typed is left alone.
	installed_app(frm) {
		frm.installed_app_options.then((options) => {
			const option = options.find((o) => o.value === frm.doc.installed_app);
			if (option && !frm.doc.title) frm.set_value("title", option.label);
		});
	},
});
