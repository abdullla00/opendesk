// A browser smoke test for Open Desk: the rail, its module list and tools, the user menu, Manage
// Rail and Manage Modules, and the Apps screen, on a running site, as one user.
//
// It only reads. Every editor it opens is closed without saving, and it changes no setting: what it
// checks is whatever the site has switched on (Open Desk Settings), and a feature switched off is
// reported as skipped. Run it through `run.sh`, which provides Playwright; see its header.
//
// `test_frappe_seams.py` checks that the names Open Desk hangs on are still in Frappe's source.
// This checks that they still behave: that the rail draws, opens and navigates, and that nothing
// throws on the way.
"use strict";

const { chromium } = require("playwright");

const BASE = (process.argv[2] || process.env.OPENDESK_SMOKE_URL || "").replace(
  /\/$/,
  ""
);
const USER = process.env.OPENDESK_SMOKE_USER || "Administrator";
const PASSWORD = process.env.OPENDESK_SMOKE_PASSWORD;
// Or an existing session's cookie, for a site whose password you would rather not type. The run
// logs out at the end, which ends that session too.
const SID = process.env.OPENDESK_SMOKE_SID;
const HEADED = process.env.OPENDESK_SMOKE_HEADED === "1";

if (!BASE || !(PASSWORD || SID)) {
  console.error(
    "usage: OPENDESK_SMOKE_PASSWORD=... (or OPENDESK_SMOKE_SID=...) [OPENDESK_SMOKE_USER=...] run.sh http://site.localhost:8000"
  );
  process.exit(2);
}

const MENU_ROWS = '[role="menu"] [role="menuitem"]';
const results = [];
const pass = (name, detail = "") =>
  results.push({ status: "pass", name, detail });
const fail = (name, detail = "") =>
  results.push({ status: "fail", name, detail });
const skip = (name, detail = "") =>
  results.push({ status: "skip", name, detail });

async function check(name, fn) {
  try {
    const detail = await fn();
    if (detail && detail.skip) skip(name, detail.skip);
    else pass(name, typeof detail === "string" ? detail : "");
  } catch (e) {
    fail(name, (e && e.message ? e.message : String(e)).split("\n")[0]);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function settle(page, ms = 1500) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(ms);
}

async function close_dialogs(page) {
  for (let i = 0; i < 3 && (await page.locator(".modal.show").count()); i++) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }
}

(async () => {
  const browser = await chromium.launch({
    channel: "chrome",
    headless: !HEADED,
  });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();
  const page_errors = [];
  const console_errors = [];
  page.on("pageerror", (e) => page_errors.push(e.message.split("\n")[0]));
  page.on("console", (m) => {
    if (m.type() === "error")
      console_errors.push(m.text().split("\n")[0].slice(0, 160));
  });

  let features = {};
  try {
    await check("logs in", async () => {
      if (SID) {
        await context.addCookies([{ name: "sid", value: SID, url: BASE }]);
        return "with the session given";
      }
      const response = await context.request.post(`${BASE}/api/method/login`, {
        form: { usr: USER, pwd: PASSWORD },
      });
      assert(response.ok(), `login answered ${response.status()}`);
      return USER;
    });

    await check("desk boots with Open Desk", async () => {
      await page.goto(`${BASE}/desk/user`);
      await settle(page, 2500);
      features = await page.evaluate(
        () => (window.frappe && frappe.boot.opendesk_features) || null
      );
      assert(
        features,
        "no frappe.boot.opendesk_features: is Open Desk installed and built?"
      );
      return Object.entries(features)
        .map(([key, on]) => `${key} ${on ? "on" : "off"}`)
        .join(", ");
    });

    // ---------------------------------------------------------------------------------- rail
    await check("rail draws the apps", async () => {
      if (!features.navigation_rail)
        return { skip: "Override Navigation Rail is off" };
      const state = await page.evaluate(() => ({
        on: document.body.classList.contains("opendesk-rail-on"),
        tiles: document.querySelectorAll(".dock .opendesk-rail-app").length,
        apps: (frappe.boot.desk_apps || []).length,
      }));
      assert(
        state.on,
        "body is not marked opendesk-rail-on: the rail did not install"
      );
      assert(state.tiles > 0, "no app tiles on the rail");
      return `${state.tiles} tiles for ${state.apps} apps`;
    });

    await check("rail foot has Search and Notifications", async () => {
      if (!features.navigation_rail)
        return { skip: "Override Navigation Rail is off" };
      if (!features.rail_tools)
        return { skip: "Move Search and Notifications to Rail is off" };
      const tools = await page.$$eval(
        ".opendesk-rail-tools [data-tool]",
        (els) => els.map((el) => el.dataset.tool)
      );
      assert(tools.includes("search"), `no search tile (${tools.join(", ")})`);
      return tools.join(", ");
    });

    await check(
      "picking an app opens its module list, and a module opens it",
      async () => {
        if (!features.navigation_rail)
          return { skip: "Override Navigation Rail is off" };
        // An app with something to choose: more than one module, or modules and a frontend.
        const title = await page.evaluate(() => {
          const app = (frappe.boot.desk_apps || []).find(
            (a) =>
              (a.modules || []).filter(
                (m) => frappe.boot.module_sidebars[m.shell]
              ).length > 1
          );
          return app && app.title;
        });
        if (!title) return { skip: "no app with more than one module" };
        await page
          .locator(`.dock .opendesk-rail-app[aria-label="${title}"]`)
          .click();
        await page.waitForTimeout(800);
        const rows = await page.locator(".opendesk-module-row").count();
        assert(rows > 1, `${title}: the module list has ${rows} rows`);
        const before = page.url();
        await page.locator(".opendesk-module-row").last().click();
        await settle(page);
        const listed = await page.evaluate(
          () => !!frappe.app.sidebar.opendesk_module_list
        );
        assert(!listed, "the module list stayed up after picking a module");
        return `${title}: ${rows} rows, then ${
          before === page.url() ? "same page" : "a module page"
        }`;
      }
    );

    await check("the header menu lists the open app's modules", async () => {
      if (!features.navigation_rail)
        return { skip: "Override Navigation Rail is off" };
      await page.locator(".body-sidebar .sidebar-header").first().click();
      await page.waitForTimeout(500);
      const rows = await page.$$eval(MENU_ROWS, (els) => els.length);
      await page.keyboard.press("Escape");
      assert(rows > 0, "the header menu is empty");
      return `${rows} rows`;
    });

    // ---------------------------------------------------------------------------- user menu
    await check(
      "Help and the site's tools moved into the user menu",
      async () => {
        if (!features.user_menu)
          return { skip: "Move Help and Site Tools to User Menu is off" };
        await page.locator(".body-sidebar .sidebar-header").first().click();
        await page.waitForTimeout(400);
        const header = await page.$$eval(MENU_ROWS, (els) =>
          els.map((el) => el.textContent.trim())
        );
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);
        await page
          .locator(".dock .dock-user, .body-sidebar .sidebar-user")
          .first()
          .click();
        await page.waitForTimeout(400);
        const user = await page.$$eval(MENU_ROWS, (els) =>
          els.map((el) => el.textContent.trim())
        );
        await page.keyboard.press("Escape");
        assert(!header.includes("Help"), "Help is still in the header menu");
        assert(user.includes("Logout"), "the user menu did not open");
        return `user menu: ${user.length} rows${
          user.includes("Help") ? ", Help among them" : ""
        }`;
      }
    );

    // ------------------------------------------------------------------------------ editors
    const can_manage = await page
      .evaluate(
        () =>
          !!(
            window.opendesk &&
            opendesk.rail &&
            opendesk.rail.can_manage &&
            opendesk.rail.can_manage()
          )
      )
      .catch(() => false);

    await check("Manage Desk Apps opens and lists every app", async () => {
      if (!features.navigation_rail && !features.apps_screen)
        return { skip: "the rail and the Apps screen are off" };
      if (!can_manage) return { skip: `${USER} may not edit Desk Apps` };
      await page.evaluate(() => opendesk.rail.manage_rail());
      await page.waitForSelector(".modal.show .ws-arrangement-item", {
        timeout: 15000,
      });
      const rows = await page
        .locator(".modal.show .ws-arrangement-item")
        .count();
      let detail = `${rows} rows`;
      if (features.apps_screen) {
        const buttons = await page
          .locator(".modal.show .opendesk-screen-mode")
          .count();
        assert(buttons > 0, "no row has an Apps Screen setting");
        if (features.navigation_rail) {
          await page
            .locator(
              ".modal.show .opendesk-preview-switch button[data-view=screen]"
            )
            .click();
          await page.waitForTimeout(400);
        }
        const tiles = await page
          .locator(".modal.show .opendesk-screen-tile")
          .count();
        assert(tiles > 0, "the Apps screen preview drew no tiles");
        detail += `, ${buttons} Apps Screen settings, ${tiles} preview tiles`;
      }
      await close_dialogs(page);
      return detail;
    });

    await check(
      "Manage Modules opens from the module list header",
      async () => {
        if (!features.navigation_rail)
          return { skip: "Override Navigation Rail is off" };
        if (!can_manage) return { skip: `${USER} may not edit Desk Apps` };
        const title = await page.evaluate(() => {
          const app = (frappe.boot.desk_apps || []).find(
            (a) =>
              (a.modules || []).filter(
                (m) => frappe.boot.module_sidebars[m.shell]
              ).length > 1
          );
          return app && app.title;
        });
        if (!title) return { skip: "no app with more than one module" };
        await page
          .locator(`.dock .opendesk-rail-app[aria-label="${title}"]`)
          .click();
        await page.waitForTimeout(800);
        await page.locator(".body-sidebar .sidebar-header").first().click();
        await page.waitForSelector(".modal.show .ws-arrangement-item", {
          timeout: 15000,
        });
        const rows = await page
          .locator(".modal.show .ws-arrangement-item")
          .count();
        await close_dialogs(page);
        return `${title}: ${rows} rows`;
      }
    );

    // --------------------------------------------------------------------------- Apps screen
    await check("Apps screen draws and offers Manage Desk Apps", async () => {
      await page.goto(`${BASE}/desk`);
      await settle(page, 2000);
      const state = await page.evaluate(() => ({
        page: frappe.boot.desktop_page,
        tiles: document.querySelectorAll(".desktop-container .desktop-icon")
          .length,
        expected: (frappe.boot.app_data || []).filter((a) => a.on_apps_screen)
          .length,
      }));
      if (state.page !== "Apps")
        return { skip: `Desktop Settings shows ${state.page}` };
      assert(
        state.tiles === state.expected,
        `${state.tiles} tiles for ${state.expected} entries`
      );
      let detail = `${state.tiles} tiles`;
      if ((features.navigation_rail || features.apps_screen) && can_manage) {
        await page.locator(".desktop-avatar").click();
        await page.waitForTimeout(400);
        const rows = await page.$$eval(MENU_ROWS, (els) =>
          els.map((el) => el.textContent.trim())
        );
        await page.keyboard.press("Escape");
        assert(
          rows.some((row) => /^Manage Desk Apps$/.test(row)),
          `no Manage Desk Apps in the avatar menu (${rows.join(", ")})`
        );
        detail += ", Manage Desk Apps in the avatar menu";
      }
      return detail;
    });

    await check(
      "an Apps screen tile with a choice opens the module list",
      async () => {
        if (!features.navigation_rail)
          return { skip: "Override Navigation Rail is off" };
        const title = await page.evaluate(() => {
          const tiles = [
            ...document.querySelectorAll(
              ".desktop-container .desktop-icon .icon-title"
            ),
          ];
          const apps = frappe.boot.desk_apps || [];
          for (const tile of tiles) {
            const app = apps.find((a) => a.title === tile.textContent.trim());
            const href = tile.getAttribute("href") || "";
            const choices =
              app &&
              (app.modules || []).filter(
                (m) => frappe.boot.module_sidebars[m.shell]
              ).length + (app.frontend ? 1 : 0);
            if (choices > 1 && /^\/(desk|app)(\/|$)/.test(href))
              return app.title;
          }
          return null;
        });
        if (!title) return { skip: "no desk tile for an app with a choice" };
        await page
          .locator(".desktop-container .desktop-icon .icon-title", {
            hasText: title,
          })
          .first()
          .click();
        await settle(page, 2000);
        const listed = await page.evaluate(
          () => !!frappe.app.sidebar.opendesk_module_list
        );
        assert(listed, `${title}: landed without the module list`);
        return title;
      }
    );

    await check("no script errors", async () => {
      assert(!page_errors.length, page_errors.slice(0, 3).join(" | "));
      return console_errors.length
        ? `${
            console_errors.length
          } console errors (not failures): ${console_errors
            .slice(0, 2)
            .join(" | ")}`
        : "";
    });
  } finally {
    await close_dialogs(page).catch(() => {});
    // Log out, so the run leaves no session behind.
    await context.request.get(`${BASE}/api/method/logout`).catch(() => {});
    await browser.close();
  }

  const marks = { pass: "✓", fail: "✗", skip: "–" };
  for (const r of results)
    console.log(
      `${marks[r.status]} ${r.name}${r.detail ? `  (${r.detail})` : ""}`
    );
  const failed = results.filter((r) => r.status === "fail").length;
  console.log(
    `\n${results.length - failed} of ${results.length} passed or skipped${
      failed ? `, ${failed} failed` : ""
    }`
  );
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
