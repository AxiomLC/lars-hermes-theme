/**
 * Lars — Div 7 Master "HomePage" (override "/").
 *
 * Rendered as a NORMAL page in the route outlet (like the bundled Kanban
 * plugin) — NOT a position:fixed overlay. The page fills the main content
 * region beside the core nav; its own left rail (Lars menu) is a flex child.
 *
 * All styling uses inline style objects (no injected <style> tag — that was
 * brittle and didn't apply through the shadcn DS). Every element uses
 * React.createElement (no JSX — the bundle is not compiled).
 *
 * Implements specs/layout-master.md as far as a single in-outlet page can:
 *   - left rail = custom vertical Lars menu (7/1/2/3/4/5/6/Settings)
 *   - Settings expands the full core Hermes menu (links to core routes)
 *   - top of content = brand "Lars" / "personal Hermes genius" + toggles
 *   - chat dock bottom-right / utility strip; three chat modes via corner btn
 *   - staggered placeholder card grid in the content area
 */
(function () {
  "use strict";

  const SDK = window.__HERMES_PLUGIN_SDK__;
  const PLUGINS = window.__HERMES_PLUGINS__;
  if (!SDK || !PLUGINS) return;

  const { React } = SDK;
  const h = React.createElement;
  const { Card, CardContent, CardTitle, Badge, Button, Select, SelectOption } = SDK.components;
  const { useState } = SDK.hooks;
  const { cn } = SDK.utils;

  const NAMES = {
    div7: "Lars", div1: "Comms", div2: "Clients", div3: "Records",
    div4: "Production", div5: "Debug", div6: "Public",
  };
  const HUES = { div7: "#1e3a8a", div1: "#c8a03c", div3: "#d46a8a", div4: "#16a34a", div6: "#eab308" };
  // Order of the Lars menu (no 2 & 5 spec'd yet → Coming Soon)
  const MENU = [
    { key: "div7",  n: "7", label: "Lars" },
    { key: "div1",  n: "1", label: "Comms" },
    { key: "div2",  n: "2", label: "Clients", soon: true },
    { key: "div3",  n: "3", label: "Records" },
    { key: "div4",  n: "4", label: "Production" },
    { key: "div5",  n: "5", label: "Debug", soon: true },
    { key: "div6",  n: "6", label: "Public" },
  ];
  const CORE = [
    "Sessions", "Chat", "Skills", "Jobs", "MCP", "Memory", "Config",
    "Keys", "Plugins", "Analytics", "Files", "Channels", "Docs", "Logs",
  ];

  /** One staggered placeholder box. */
  function Box(props) {
    const { key, label, hue, long } = props;
    const edge = hue ? { boxShadow: "inset 0 0 0 2px " + hue } : null;
    const base = {
      background: "rgba(7,24,36,.72)",
      border: "1px solid rgba(64,243,255,.24)",
      borderRadius: "1rem",
      boxShadow: "0 0 30px -18px rgba(64,243,255,.8)",
      padding: "18px 16px",
      minHeight: long ? 120 : 88,
      cursor: "pointer",
    };
    return h(Card, { style: base },
      h(CardTitle, { style: { fontSize: ".9rem", color: "#e8fbff", letterSpacing: ".06em" } }, label || key),
      h(CardContent, { style: { fontSize: ".6rem", color: "#83b7c4", marginTop: 4 } }, key),
      edge ? h("div", { style: Object.assign({ position: "absolute", inset: 0, pointerEvents: "none", borderRadius: "1rem" }, edge) }) : null,
    );
  }

  /** Thin utility strip (chips of stats). */
  function Strip(props) {
    const cells = props.cells;
    const chip = (label, val, ok) =>
      h("div", { style: { display: "flex", alignItems: "center", gap: 4, fontFamily: "ui-monospace", fontSize: 10 } },
        h("span", { style: { width: 7, height: 7, borderRadius: "50%", background: ok ? "#39f5a6" : "#ffb648" } }),
        h("span", { style: { color: "#83b7c4" } }, label + ":" + val));
    return h("div", {
      style: {
        display: "flex", flexWrap: "wrap", gap: 4, padding: "3px 8px",
        background: "rgba(5,18,28,.72)", color: "#e8fbff",
      },
    }, cells.map((c) => chip(c.k, c.v, c.ok)));
  }

  function HomePage() {
    const [active, setActive] = useState("div7");
    const [coreOpen, setCoreOpen] = useState(false);
    const [chatMode, setChatMode] = useState("twentyfive");

    // left rail — Lars vertical menu
    const menuItems = MENU.map(function (m) {
      const isActive = active === m.key;
      return h("button", {
        onClick: function () { setActive(m.key); },
        style: {
          display: "block", width: "100%", textAlign: "left", background: "transparent",
          border: 0, boxShadow: "0 0 10px -8px rgba(64,243,255,.4)",
          padding: "7px 10px", borderRadius: 6, cursor: "pointer",
          color: isActive ? "#40f3ff" : "#e8fbff", fontWeight: 600, fontSize: 14,
        },
      }, m.n + " " + m.label + (isActive ? " ◂" : ""));
    });
    // Settings → expands core Hermes menu
    menuItems.push(
      h("button", {
        onClick: function () { setCoreOpen(!coreOpen); },
        style: { display: "block", width: "100%", textAlign: "left", background: "transparent", border: 0, padding: "7px 10px", borderRadius: 6, cursor: "pointer", color: "#e8fbff", fontWeight: 600, fontSize: 14 },
      }, "Settings" + (coreOpen ? " ▴" : " ▾")),
    );
    if (coreOpen) {
      menuItems.push(
        h("div", { style: { paddingLeft: 10 } },
          CORE.map(function (c) {
            return h("a", { href: "/" + c.toLowerCase(), style: { display: "block", color: "#83b7c4", fontSize: 12, textDecoration: "none", padding: "2px 6px" } }, c);
          })),
      );
    }

    // staggered card grid: 1 top, 4, 3, 2
    const grid = [
      [h(Box, { key: "Commander", label: "Lars · Div 7", hue: HUES.div1, long: true })],
      [h(Box, { key: "div1", label: "Comms", hue: HUES.div1 }),
       h(Box, { key: "div3", label: "Records", hue: HUES.div3 }),
       h(Box, { key: "div4", label: "Production", hue: HUES.div4 }),
       h(Box, { key: "div6", label: "Public", hue: HUES.div6 })],
      [h(Box, { key: "div2", label: "Clients" }),
       h(Box, { key: "div5", label: "Debug" }),
       h(Box, { key: "div7", label: "Lars", hue: HUES.div7 })],
      [h(Box, { key: "A" }), h(Box, { key: "B" })],
    ];

    // Chat modes
    const modeName = { off: "off", twentyfive: "25%", full: "full" };
    const cycleChat = function () { const o = ["off","twentyfive","full"]; setChatMode(o[(o.indexOf(chatMode)+1)%3]); };

    const chatVisible = chatMode !== "off";
    const chatWidth = chatMode === "twentyfive" ? "25%" : "100%";
    const chatPanel = chatVisible ? h("div", {
      style: {
        position: "fixed", right: 0, bottom: 0, top: 0, width: chatWidth, zIndex: 40,
        background: "rgba(5,18,28,.88)", borderLeft: "1px solid rgba(64,243,255,.24)",
        display: "flex", flexDirection: "column", padding: 10,
      },
    },
      h("div", { style: { fontWeight: 700, color: "#40f3ff", letterSpacing: ".1em", fontSize: 15 } }, "Lars"),
      h("div", { style: { color: "#83b7c4", fontSize: 11 } }, "model: default · 12,304 tok"),
      h("div", { style: { flex: 1, overflowY: "auto", color: "#83b7c4", fontSize: 12, padding: 6 } },
        "— last sessions —", h("br"), "guide round", h("br"), "cfgs sync", h("br"), "n8n flows"),
      h("textarea", { placeholder: "Type / talk to Lars…", style: { background: "transparent", border: 0, color: "#e8fbff", fontFamily: "ui-monospace", fontSize: 13, resize: "none" } }),
      h("div", { style: { color: "#ffb648", textAlign: "center", fontSize: 12 } }, "●  mic"),
    ) : null;

    const strip = h(Strip, { cells: [
      { k: "cpu", v: "37%", ok: true }, { k: "ram", v: "81%", ok: false },
      { k: "thr", v: "3", ok: true }, { k: "cron", v: "5", ok: true },
      { k: "hm", v: "0.21.3", ok: true }, { k: "lars", v: "0.1", ok: true },
      { k: "ttft", v: "1.8s", ok: true }, { k: "tok", v: "42k", ok: true },
    ] });

    return h("div", { style: { display: "flex", height: "100%", minHeight: "100vh" } },
      // LEFT RAIL (Lars menu)
      h("div", { style: { width: 190, background: "rgba(5,18,28,.85)", padding: "12px 10px", display: "flex", flexDirection: "column", overflowY: "auto" } },
        h("div", { style: { letterSpacing: ".14em", textTransform: "uppercase", color: "#40f3ff", fontSize: 11, marginBottom: 10 } }, "Lars · Div 7"),
        ...menuItems),
      // MAIN content
      h("div", { style: { flex: 1, minWidth: 0, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column" } },
        strip,
        h("div", { style: { fontSize: 11, color: "#47717f", letterSpacing: ".1em", marginTop: 8 } }, "NEXT: " + NAMES[active]),
        grid.map(function (row) {
          return h("div", { style: { display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10 } }, row);
        }),
        // brand block
        h("div", { style: { marginTop: 20, textAlign: "center" } },
          h("span", { style: { color: "#e8fbff", fontWeight: 700, letterSpacing: ".12em", fontSize: 16 } }, "Lars"),
          h("span", { style: { color: "#83b7c4", fontSize: 11, marginLeft: 8 } }, "personal Hermes genius"))),
      // Chat dock (fixed right) + corner toggle
      chatPanel,
      h("button", {
        onClick: cycleChat,
        style: { position: "fixed", right: 4, bottom: 4, zIndex: 45, minWidth: 24, height: 24, borderRadius: 6, background: "rgba(5,18,28,.85)", border: "1px solid rgba(64,243,255,.24)", color: "#40f3ff", cursor: "pointer" },
      }, chatMode === "off" ? "▣" : (chatMode === "full" ? "▷" : "◱")),
    );
  }

  // Register for the manifest name "lars" (matches manifest name + plugins.enabled).
  if (window.__HERMES_PLUGINS__.register) {
    window.__HERMES_PLUGINS__.register("lars", HomePage);
  }
})();