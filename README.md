### Open Desk

Desk navigation for Frappe 16.50 and later, each part behind its own switch in
Open Desk Settings:

- **Override Navigation Rail.** Frappe's Dock lists apps instead of the open
  app's modules. A site groups modules into apps of its own, or rearranges an
  installed app's, with **Desk App** records (or Manage Desk Apps and Manage Modules
  from the user menu). Modules no Desk App claims stay under their installed
  app; those of apps Frappe lists nowhere are under Other.
- **Move Search and Notifications to Rail.** With the rail, Search,
  Notifications and other apps' tiles move from the top of the sidebar to the
  foot of the rail.
- **Override Desktop Icons.** Frappe's Apps screen (`/desk`) arranged in rail
  order: Frappe's default, one icon, an icon per module, the app and its
  modules, or none -- set per app in Manage Desk Apps (also in the Apps screen's
  avatar menu). Only where Desktop Settings shows the Apps screen; Frappe's
  older Desktop Icons grid, which it is retiring, is left as Frappe draws it.
- **Move Help and Site Tools to User Menu.** The site's Navbar Settings rows and
  Help move from the sidebar header's menu into the user menu.

Other apps can add tiles at the foot of the rail through `opendesk.rail.tools`;
see `opendesk/open_desk/js/rail.js`.

### Installation

```bash
cd $PATH_TO_YOUR_BENCH
bench get-app $URL_OF_THIS_REPO --branch main
bench install-app opendesk
```

### Tests

A browser smoke test against a running site: the rail, its module list, the user menu, Manage
Rail and Manage Modules, and the Apps screen. It only reads, checks whatever the site has
switched on, and logs out at the end. It drives your installed Chrome; Playwright is installed
once into `~/.cache/opendesk-smoke`.

```bash
OPENDESK_SMOKE_PASSWORD=admin tests/smoke/run.sh http://demo.localhost:8000
```

Site-less, over Frappe's source and plain data:

```bash
cd sites && ../env/bin/python -m unittest opendesk.open_desk.test_frappe_seams \
  opendesk.open_desk.test_desk_apps opendesk.open_desk.test_apps_screen \
  opendesk.open_desk.test_module_tiles
```
