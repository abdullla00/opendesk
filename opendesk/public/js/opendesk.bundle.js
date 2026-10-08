// Everything this app adds to the desk's scripts, in one entry: `app_include_js` names this file.
// Each import below draws itself only where its Open Desk Settings switch says so.
//
// The browser halves sit beside their server halves under `open_desk/js/`. Only entry files have
// to be under public/ -- esbuild globs there for `*.bundle.js` -- and an entry may import from
// anywhere in the app.

// Before anything that adds to the user menu: see the file.
import "./user_menu_rows";
// Before the rail, which hands it the modules to place.
import "../../open_desk/js/boot_arrangement";
import "../../open_desk/js/rail";
import "../../open_desk/js/user_menu";
import "../../open_desk/js/arrange";
