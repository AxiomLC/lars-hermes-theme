/**
 * Lars — Executive Div 7 Master plugin (Hermes desktop app).
 *
 * Div platform: 7 pages under one shell — Exec Div 7 home + 6 Division pages.
 * Div 7 is the template: staggered click-to-expand boxes, a lower-right
 * voice/mic module (graphic only for now), and a thin right-hand utilities
 * rail fed by live Hermes APIs (host.status / host.state / focusedUsage).
 *
 * STATES: every page persists its state (collapsed menu, expanded boxes,
 * scroll position) in ctx.storage (namespaced to this plugin). The core
 * sidebar "Lars" row points at /lars which RESOLVES to the last-visited page —
 * clicking Lars in core Hermes returns you to where you were, not to a static
 * home. Leaving via the mic "Expand" (core session chat) and clicking Lars
 * again restores that same state.
 *
 * Door: <home>/desktop-plugins/lars/plugin.js  (folder name == id)
 * Plain ESM, no build step. Only these imports resolve:
 * @hermes/plugin-sdk, react, react/jsx-runtime.
 *
 * Routes are one segment (no "/"): /lars /lars-comms /lars-clients
 * /lars-records /lars-production /lars-debug /lars-crm.
 *
 * NOTE on the logo: disk plugins load via Blob URL, so a sibling logo.png
 * CANNOT be referenced by relative path. The logo below is an inline SVG
 * placeholder; swapping in a real image needs either an HTTPS url, a data:
 * URI, or moving the plugin to a bundled/unified package.
 */

import { atom, host, icons, PALETTE_AREA, ROUTES_AREA, SIDEBAR_NAV_AREA, useValue } from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'

const ID = 'lars' // must match the folder name

// ── The 7 Divisions ──────────────────────────────────────────────────────────
// `edge` = per-Div accent (thin glow on the menu chip).
const DIVS = [
  { num: '7', label: 'Div 7 Exec', path: '/lars', placeholder: 'Div 7', edge: '#2563eb' }, // dark blue
  { num: '1', label: 'Div 1 Comms', path: '/lars-comms', placeholder: 'Div 1', edge: '#d4a017' }, // gold
  { num: '2', label: 'Div 2 Clients', path: '/lars-clients', placeholder: 'Div 2', edge: '#64748b' }, // slate
  { num: '3', label: 'Div 3 Records', path: '/lars-records', placeholder: 'Div 3', edge: '#ec4899' }, // pink
  { num: '4', label: 'Div 4 Code Prod', path: '/lars-production', placeholder: 'Div 4', edge: '#22c55e' }, // green
  { num: '5', label: 'Div 5 Debug', path: '/lars-debug', placeholder: 'Div 5', edge: '#a855f7' }, // violet
  { num: '6', label: 'Div 6 CRM', path: '/lars-crm', placeholder: 'Div 6', edge: '#eab308' } // yellow
]

// Exec Div 7 home staggered boxes (click to EXPAND, no nav).
const HOME_BOXES = [
  { id: 'stats', label: 'Div Stats', w: '220px', h: '110px' },
  { id: 'social', label: 'Social Posts / Comments', w: '180px', h: '90px' },
  { id: 'gi', label: 'GI Gross Income', w: '200px', h: '120px' },
  { id: 'comms', label: 'Crucial Comms', w: '240px', h: '100px' },
  { id: 'n8n', label: 'n8n Flow Stats', w: '170px', h: '90px' },
  { id: 'stocks', label: 'Custom Stocks', w: '190px', h: '110px' },
  { id: 'browser', label: 'Browser Panel', w: '210px', h: '100px' }
]

// Inline SVG logo placeholder (hexagon mark). Swap via https/data URI later.
const LOGO_SVG =
  'data:image/svg+xml;utf8,' +
  '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34">' +
  '<polygon points="17,3 30,11 30,25 17,31 4,25 4,11" fill="%232563eb" stroke="%2340f3ff" stroke-width="1.2"/>' +
  '<text x="17" y="24" font-size="15" font-family="sans-serif" fill="%23ffffff" text-anchor="middle">7</text></svg>'

// ── Utilities rail: live data (verified against SDK) ─────────────────────────
// host.status()  → version, release_date, active_sessions, gateway state
// host.state     → model, profile, gateway socket, focusedUsage (live tokens)
// Research (2026-09-24): NO existing Hermes desktop plugin does this. The only
// known attempt is draft PR NousResearch/hermes-agent#91204
// ("system.resources" RPC: CPU/RAM/disk/uptime) — never merged, and its
// companion plugin repo (agentik-os/hermes-account-resource-footer) is 404.
// The web dashboard has /api/system/stats but that's the browser surface —
// NOT reachable from a desktop renderer plugin. So CPU/RAM/cron/uptime need a
// Python plugin_api.py backend (ctx.rest) and carry a "β" marker for now —
// never fabricated values.
let statusSnapshot = null // filled by host.status(); never user-set

// Jarvis palette + fonts lifted from Itsme23476/jarvis-hermes-dashboard
// (ui/styles.css, verified above): cyan/amber on near-black, JetBrains Mono
// display font. This is the plugin-layer (expanded) theme; the core-wide
// DesktopTheme is a separate artifact we build next.
const JV = {
  bg: '#02070c',
  bg2: '#061722',
  panel: 'rgba(5,18,28,.64)',
  edge: 'rgba(57,232,255,.24)',
  edge2: 'rgba(57,232,255,.55)',
  cyan: '#40f3ff',
  cyan2: '#16b8d4',
  ink: '#e8fbff',
  mut: '#83b7c4',
  dim: '#47717f',
  amber: '#ffb648',
  red: '#ff5d6c',
  green: '#39f5a6',
  violet: '#a884ff',
  disp: '"Chakra Petch",system-ui,sans-serif',
  mono: '"JetBrains Mono",ui-monospace,Menlo,monospace'
}

function UtilityChip({ icon, label, value, glow }) {
  return jsxs('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      padding: '2px 5px',
      borderRadius: '3px',
      border: `1px solid ${JV.edge}`,
      background: 'rgba(2,7,12,0.55)',
      color: 'var(--ui-text-secondary)',
      fontSize: '10px',
      lineHeight: '12px',
      textShadow: glow ? `0 0 6px ${JV.cyan}` : 'none'
    },
    children: [
      jsx('span', { style: { fontSize: '9px', color: JV.dim, textTransform: 'uppercase', letterSpacing: '0.04em' }, children: label }),
      jsx('span', { style: { fontSize: '11px', color: glow ? JV.cyan : JV.ink, textShadow: glow ? `0 0 5px ${JV.cyan}` : 'none' }, children: value })
    ]
  })
}

function UtilitiesRail() {
  const model = useValue(host.state.model)
  const profile = useValue(host.state.profile)
  const gateway = useValue(host.state.gateway)
  const usage = useValue(host.state.focusedUsage)

  const st = statusSnapshot
  const pct =
    usage && typeof usage.context_percent === 'number'
      ? `${Math.round(usage.context_percent)}%`
      : usage && typeof usage.context_used === 'number'
        ? `${Math.round(usage.context_used / 1000)}k`
        : '—'

  return jsxs('div', {
    style: {
      width: '64px',
      height: '100%',
      overflowY: 'auto',
      padding: '5px',
      display: 'flex',
      flexDirection: 'column',
      gap: '3px',
      background: 'transparent'
    },
    children: [
      jsx('div', { style: { fontSize: '8px', color: JV.dim, letterSpacing: '0.08em' }, children: 'UTIL' }),
      jsx(UtilityChip, { icon: icons.Cpu, label: 'cpu', value: 'β' }),
      jsx(UtilityChip, { icon: icons.Clock, label: 'rel', value: st ? (st.release_date || '—') : '…' }),
      jsx(UtilityChip, { icon: icons.Globe, label: 'sess', value: st ? String(st.active_sessions) : '…', glow: true }),
      jsx(UtilityChip, { icon: icons.Activity, label: 'gw', value: gateway === 'open' ? 'on' : gateway, glow: gateway === 'open' }),
      jsx(UtilityChip, { icon: icons.Terminal, label: 'model', value: model || '—' }),
      jsx(UtilityChip, { icon: icons.GitBranch, label: 'profile', value: profile || '—' }),
      jsx(UtilityChip, { icon: icons.Zap, label: 'ctx', value: pct, glow: true }),
      // Backend-gated stats (need plugin_api.py): β marker, not fabricated.
      jsx(UtilityChip, { icon: icons.Cpu, label: 'ram', value: 'β' }),
      jsx(UtilityChip, { icon: icons.Box, label: 'disk', value: 'β' }),
      jsx(UtilityChip, { icon: icons.Clock, label: 'crn', value: 'β' })
    ]
  })
}

// ── JarvisMic — dynamic voice module (lower-right of Div 7) ──────────────────
// Dark-glass reactor: two counter-rotating dashed rings, three colored arcs
// lunging over a pulsing glowing orb, plus live waveform bars (CSS-animated).
// Animations run through an injected <style> tag — pages are sandbox-free, so
// this is allowed. FINAL WIRING: the orb/waveform will be driven by real audio
// (vm.live events + /api/audio/transcribe + /api/audio/speak), hung on
// host.onEvent + ctx.rest once we build the Python backend half.
function JarvisMic({ div }) {
  const micCSS =
    '@keyframes ljSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}}' +
    '@keyframes ljReverse{from{transform:rotate(0)}to{transform:rotate(-360deg)}}' +
    '@keyframes ljOrbPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}' +
    '@keyframes ljBlink{0%,100%{opacity:.22}50%{opacity:1}}' +
    '@keyframes ljWave{0%,100%{height:22%}30%{height:78%}60%{height:46%}80%{height:92%}}'

  // 7 waveform bars, each with its own staggered animation delay.
  const bars = [0, 2, 4, 6, 8, 10, 12].map(d =>
    jsx('span', {
      key: d,
      style: {
        width: '2px',
        borderRadius: '1px',
        background: JV.cyan,
        boxShadow: `0 0 5px ${JV.cyan}`,
        animation: `ljWave 1.1s ease-in-out infinite`,
        animationDelay: `${d * 0.09}s`,
        transformOrigin: 'bottom',
        display: 'inline-block'
      }
    })
  )

  const wavePanel = jsxs('div', {
    key: 'wave',
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      gap: '2px',
      height: '14px',
      width: '34px',
      justifyContent: 'center'
    },
    children: bars
  })

  return jsxs('div', {
    key: 'mic',
    style: {
      position: 'absolute',
      right: '14px',
      bottom: '14px',
      width: '92px',
      height: '110px',
      background: JV.panel,
      border: `1px solid ${JV.edge2}`,
      borderRadius: '12px',
      boxShadow: `0 0 24px ${JV.cyan}22`,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '6px',
      fontFamily: JV.mono,
      cursor: 'pointer',
      zIndex: 2
    },
    children: [
      jsx('style', { children: micCSS }),
      // Reactor: two counter-rotating dashed rings around a pulsing orb.
      jsxs('svg', {
        width: '44',
        height: '44',
        viewBox: '0 0 44 44',
        children: [
          jsx('circle', { cx: '22', cy: '22', r: '19', fill: 'none', stroke: JV.edge, strokeWidth: '1' }),
          jsx('circle', {
            cx: '22', cy: '22', r: '15',
            fill: 'none', stroke: JV.cyan, strokeWidth: '1.2',
            strokeDasharray: '2 4',
            style: { transformOrigin: '22px 22px', animation: 'ljSpin 6s linear infinite' }
          }),
          jsx('circle', {
            cx: '22', cy: '22', r: '11',
            fill: 'none', stroke: JV.amber, strokeWidth: '1',
            strokeDasharray: '1.4 3.4',
            style: { transformOrigin: '22px 22px', animation: 'ljReverse 4.4s linear infinite' }
          }),
          jsx('circle', {
            cx: '22', cy: '22', r: '6.4',
            fill: JV.cyan,
            style: { transformOrigin: '22px 22px', animation: 'ljOrbPulse 2.6s ease-in-out infinite' }
          }),
          jsx('circle', { cx: '22', cy: '22', r: '5.2', fill: 'none', stroke: JV.ink, strokeWidth: '1' })
        ]
      }),
      jsx('div', { style: { fontSize: '10px', color: JV.ink, textShadow: `0 0 6px ${JV.cyan}` }, children: 'Lars' }),
      wavePanel,
      jsx('button', {
        type: 'button',
        title: 'Open full chat with Lars in the core session window (native voice)',
        onClick: () => {
          const sess = host.state.focusedStoredSessionId ? host.state.focusedStoredSessionId.get() : null
          if (sess) host.openSession(sess)
          else host.navigate('/')
        },
        style: {
          background: 'transparent',
          border: `1px solid ${JV.edge}`,
          borderRadius: '3px',
          color: JV.mut,
          fontSize: '8px',
          letterSpacing: '0.06em',
          cursor: 'pointer',
          padding: '1px 6px'
        },
        children: 'EXPAND'
      })
    ]
  })
}

// ── Shared page chrome ───────────────────────────────────────────────────────
// Atoms are created ONCE in register() and passed in — never inside the
// component (a fresh atom per render would reset state on every keystroke).
function LarsPage({ collapsedAtom, expandedAtom, activePath, div, store }) {
  const collapsed = useValue(collapsedAtom)
  const expanded = useValue(expandedAtom)
  let scrollEl = null

  const isHome = div.path === '/lars'

  const menuItems = DIVS.map(d => {
    return jsx('button', {
      key: d.num,
      type: 'button',
      title: d.num === '7' ? 'Executive Div 7 · home' : d.label,
      onClick: () => {
        store.set('lastPage', d.path)
        host.navigate(d.path)
      },
      style: {
        width: '100%',
        textAlign: collapsed ? 'center' : 'left',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        // Thin per-Div glow (2 of 4 edges), kept on the collapsed chip.
        boxShadow: `2px 3px 4px 0 ${d.edge}99`,
        background: 'transparent',
        color: d.path === activePath ? 'var(--ui-text-primary)' : 'var(--ui-text-secondary)',
        cursor: 'pointer'
      },
      children: collapsed ? d.num : d.label
    })
  })

  // Div 7 content: staggered boxes, click to expand (persisted, no nav).
  const homeBoxes = HOME_BOXES.map(b => {
    const on = expanded.includes(b.id)
    return jsx('button', {
      key: b.id,
      type: 'button',
      title: on ? 'Collapse' : 'Expand',
      onClick: () => expandedAtom.set(on ? expanded.filter(x => x !== b.id) : [...expanded, b.id]),
      style: {
        width: on ? 'calc(100% - 12px)' : b.w,
        height: on ? '240px' : b.h,
        borderRadius: '6px',
        border: `1px solid ${div.edge}66`,
        background: 'rgba(2,7,12,0.5)',
        color: 'var(--ui-text-primary)',
        textAlign: 'left',
        padding: '6px 8px',
        fontSize: '11px',
        boxShadow: '0 0 14px rgba(64,243,255,0.22)',
        cursor: 'pointer'
      },
      children: b.label
    })
  })

  const toggleBtn = jsx('button', {
    key: 'toggle',
    type: 'button',
    title: collapsed ? 'Expand menu' : 'Collapse menu',
    onClick: () => collapsedAtom.set(!collapsed),
    style: {
      textAlign: 'center',
      padding: '2px 0',
      background: 'transparent',
      border: 'none',
      color: 'var(--ui-text-secondary)',
      cursor: 'pointer'
    },
    children: collapsed ? jsx(icons.ChevronRight, { size: 14 }) : jsx(icons.ChevronLeft, { size: 14 })
  })

  // Logo + title sit ABOVE the toggle in the left rail.
  const brand = jsxs('div', {
    key: 'brand',
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '2px',
      paddingBottom: '4px'
    },
    children: [
      jsx('img', { src: LOGO_SVG, alt: 'Lars', style: { width: '30px', height: '30px' } }),
      collapsed
        ? null
        : jsx('div', { style: { fontSize: '13px', fontWeight: '700', color: 'var(--ui-text-primary)', letterSpacing: '0.08em' }, children: 'Lars' })
    ]
  })

  // Voice/mic module (Div 7): Jarvis-style dynamic reactor graphic.
  // Graphic + animation only for now — final wiring (real STT/TTS) noted at
  // the bottom of this file. Expand → core Hermes session chat.
  const micModule = jsx(JarvisMic, { div })

  return jsxs('div', {
    key: 'page',
    style: { display: 'flex', height: '100%', width: '100%', overflow: 'hidden' },
    children: [
      // Left menu rail: brand, toggle, Div items, glow-colored.
      jsxs('div', {
        key: 'rail',
        style: {
          // Auto-fit to the widest menu label; collapsed to a narrow strip.
          width: collapsed ? '44px' : 'auto',
          minWidth: collapsed ? '40px' : '0',
          height: '100%',
          overflowY: 'auto',
          padding: '8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        },
        children: [brand, toggleBtn, ...menuItems]
      }),
      // Content region.
      jsx('div', {
        key: 'content',
        style: {
          flex: 1,
          height: '100%',
          overflow: 'auto',
          padding: '16px',
          position: 'relative',
          background: 'transparent'
        },
        ref: el => {
          scrollEl = el
          if (el) {
            el._lastScroll = 0
            const seed = store.get(`pageState.${div.path}`, {})
            if (typeof seed.scroll === 'number') el.scrollTop = seed.scroll
          }
        },
        onScroll: e => {
          const el = e.currentTarget
          // Persist scroll position (coalesced — only when moved > 40px) so a
          // return to this page restores it.
          if (el && Math.abs(el.scrollTop - (el._lastScroll || 0)) > 40) {
            el._lastScroll = el.scrollTop
            const cur = store.get(`pageState.${div.path}`, {})
            cur.scroll = el.scrollTop
            store.set(`pageState.${div.path}`, cur)
          }
        },
        children: jsxs('div', {
          key: 'inner',
          style: {
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '10px',
            paddingTop: '4px'
          },
          children: isHome
            ? homeBoxes
            : [jsx('div', { style: { color: 'var(--ui-text-secondary)', fontSize: '14px' }, children: div.placeholder })]
        })
      }),
      // Div 7 extra layers: mic (bottom-right) + utilities rail (right edge).
      isHome ? micModule : null,
      jsx(UtilitiesRail, {})
    ]
  })
}

// ── Plugin ───────────────────────────────────────────────────────────────────
export default {
  id: ID,
  name: 'Lars',
  description: 'Lars platform — Executive Div 7 home + 6 Division pages, shared states.',
  defaultEnabled: true,
  register(ctx) {
    // One-shot + periodic status snapshot for the utilities rail.
    const refreshStatus = () => {
      if (typeof host.status === 'function') {
        host.status()
          .then(s => {
            if (s) statusSnapshot = s
          })
          .catch(() => {
            /* gateway not up — rail keeps placeholders */
          })
      }
    }
    refreshStatus()
    ctx.setInterval(refreshStatus, 30000)

    // Collapse state: one atom for the whole plugin, seeded from storage.
    const collapsedAtom = atom(ctx.storage.get('menuCollapsed', false))
    collapsedAtom.listen(v => ctx.storage.set('menuCollapsed', v))

    // Per-page expanded-box state: one atom per page (Div 7 only for now).
    const expandedAtoms = {}
    for (const div of DIVS) {
      const seed = ctx.storage.get(`pageState.${div.path}`, {})
      const a = atom(Array.isArray(seed.expanded) ? seed.expanded : [])
      a.listen(v => {
        const cur = ctx.storage.get(`pageState.${div.path}`, {})
        cur.expanded = v
        ctx.storage.set(`pageState.${div.path}`, cur)
      })
      expandedAtoms[div.path] = a
    }

    // Sidebar nav row "next to Kanban" (order 50). /lars is a RESOLVER: it
    // renders the last-visited page instead of a fixed home.
    ctx.register({
      id: 'nav',
      area: SIDEBAR_NAV_AREA,
      order: 50,
      data: { codicon: 'rocket', label: 'Lars', path: '/lars' }
    })

    // ⌘K palette command → last-visited Lars page too.
    ctx.register({
      id: 'open',
      area: PALETTE_AREA,
      data: {
        id: 'lars.open',
        label: 'Open Lars (return to state)',
        keywords: ['lars', 'div 7', 'executive'],
        run: () => host.navigate(ctx.storage.get('lastPage', '/lars'))
      }
    })

    // Seven Division pages. The /lars route resolves lastPage so core-sidebar
    // and palette entry points come back to the previous state.
    for (const div of DIVS) {
      const isResolver = div.path === '/lars'
      ctx.register({
        id: `page-${div.num}`,
        area: ROUTES_AREA,
        data: { path: div.path },
        render: () => {
          const active = isResolver ? ctx.storage.get('lastPage', '/lars') : div.path
          const resolved = DIVS.find(d => d.path === active) ?? div
          return jsx(LarsPage, {
            collapsedAtom,
            expandedAtom: expandedAtoms[resolved.path],
            activePath: resolved.path,
            div: resolved,
            store: ctx.storage
          })
        }
      })
    }
  }
}