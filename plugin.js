/**
 * Lars — Executive Div 7 Master plugin (Hermes desktop app).
 *
 * Div platform: 7 pages under one shell — Exec Div 7 home + 6 Division pages.
 * Div 7 is the template: staggered click-to-expand boxes, a lower-right
 * voice/mic module (graphic only for now).
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
 *
 * NOTE (utilities rail removed 2026-09-24): the UtilitiesRail was stripped from
 * this build pending the resource monitor (see Utility-Monitor.md). The
 * gateway-mounted plugin_api.py backend REMAINS (plugins/lars/dashboard/) —
 * used for titlebar /stats and /voice-log.
 * Voice/mic (JarvisMic) kept as graphic placeholder per plan.
 */

import { atom, host, icons, Contribute, TITLEBAR_AREAS, PALETTE_AREA, ROUTES_AREA, SIDEBAR_NAV_AREA, useQuery, useValue } from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'

const ID = 'lars' // must match the folder name
let pluginCtx = null // set in register(); used by TitlebarUtils for ctx.rest

// ── The 7 Divisions ──────────────────────────────────────────────────────────
// `edge` = per-Div accent (thin glow on the menu chip).
const DIVS = [
  { num: '7', label: 'Div 7 Exec', path: '/lars', placeholder: 'Div 7', edge: '#2563eb' }, // dark blue
  { num: '1', label: 'Div 1 Comms', path: '/lars-comms', placeholder: 'Div 1', edge: '#d4a017' }, // gold
  { num: '2', label: 'Div 2 Clients', path: '/lars-clients', placeholder: 'Div 2', edge: '#a855f7' }, // violet
  { num: '3', label: 'Div 3 Records', path: '/lars-records', placeholder: 'Div 3', edge: '#ec4899' }, // pink
  { num: '4', label: 'Div 4 Code Prod', path: '/lars-production', placeholder: 'Div 4', edge: '#22c55e' }, // green
  { num: '5', label: 'Div 5 Debug', path: '/lars-debug', placeholder: 'Div 5', edge: '#64748b' }, // slate
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

// Real Lars logo (from main lars-logo.png), downscaled + embedded as data URI.
// Disk plugins load via Blob URL so relative paths can't resolve — data URI is the way.
const LOGO_DATA = 'data:image/png;base64,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'

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

// ── VoiceLink v2 — all-in-page voice engine (Pocket format) + native RPC brain ─
// Ported from AxiomLC/lars-pocket-tts (proven semi-streaming):
//   Web Speech STT + 2 s silence turn-taking + echo defence → sentence chunker →
//   Pocket TTS :8001 (streamed WAV) → gapless Web Audio playback → barge-in/re-arm.
// Brain: NATIVE desktop session — no API server, no helper server:
//   host.request RPC (session.most_recent/resume/create, prompt.submit,
//   session.interrupt, session.close) against profile 'lars2', deltas via the
//   gateway event stream (message.delta/message.interim/message.complete).
// Visuals unchanged — same interface as the old link: start/stop/startCapture/
// typed/log/state ('deaf'|'hot'|'user'|'lars').
const PROFILE = 'lars2'
const TTS_URL = 'http://127.0.0.1:8000/tts'
const TTS_VOICE = 'jean'
// Fire-and-forget diagnostic mirror — everything the transcript sees also lands
// in Hermes' own plugins/lars/voice-events.log via the gateway-mounted
// plugin_api backend (POST /voice-log, capped at the last 100 entries).
// Readable by Hermes agents (plain file) or: GET /api/plugins/lars/voice-log.
function diag(src, msg) {
  try {
    if (!pluginCtx || !pluginCtx.rest) return
    pluginCtx.rest('/voice-log', {
      method: 'POST', body: { src, level: /\.err$|^err$/.test(src) ? 'error' : 'info', msg: String(msg).slice(0, 500) }
    }).catch(() => {})
  } catch (e) {}
}

const CFG = {
  SILENCE_MS: 2000,        // silence before an utterance is sent
  STT_LANG: 'en-US',
  BARGE_GRACE_MS: 500,     // ignore mic speech right after our audio starts
  BARGE_MIN_NOVEL: 2,      // heard words not in our own reply text → real user
  BARGE_WORDS: new Set(['stop', 'wait', 'cancel', 'pause', 'hold', 'no', 'quiet', 'enough']),
  TAIL_MS: 1800,           // echo-tail filter after our playback ends
  FIRST_SENTENCE_MIN: 8, SENTENCE_MIN: 24, FIRST_CLAUSE_MIN: 40,
  // ---- STT fallback tuning (voice2/stt_local.py, faster-whisper 'base') ----
  STT_URL: 'http://127.0.0.1:8107/transcribe',
  STT_ON_LEVEL: 0.030,     // mic peak amplitude above this = user speaking (mic sensitivity; raise if false-positives)
  SILENCE_MS: 2000,        // ← user-speech end timeout: silence this long commits the utterance (was 2000; tweak here)
  STT_MIN_AUDIO_MS: 400,   // shorter than this is noise, discard
  BARGE_RMS: 0.060,        // while Lars speaks: peak above this for N polls = barge-in (echo risk knob; keep > STT_ON_LEVEL)
  BARGE_POLLS: 4,          // consecutive ~21 ms polls above BARGE_RMS required
}

const SpeechRecognitionCtor = null // Web Speech removed: Google endpoint unreachable from Electron renderer — STT is now local whisper via :8107

function setupMicTrack() {
  return navigator.mediaDevices.getUserMedia({ audio: {
    channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true
  }})
}

function makeChunker(pushSentence) {
  let buffer = '', isFirst = true
  function findCut() {
    if (isFirst) {
      const m = buffer.slice(0, 64).match(/[.!?](\s|$)/)
      if (m && buffer.slice(0, m.index + 1).trim().length >= CFG.FIRST_SENTENCE_MIN)
        return m.index + 1
      const comma = buffer.indexOf(',')
      if (comma >= 0 && comma + 1 >= CFG.FIRST_CLAUSE_MIN) return comma + 1
      return null
    }
    const m = buffer.slice(0, 160).match(/[.!?](\s|$)/g)
    if (m) {
      const end = buffer.indexOf(m[m.length - 1]) + 1
      if (buffer.slice(0, end).trim().length >= CFG.SENTENCE_MIN) return end
    }
    return null
  }
  return {
    push(t) {
      buffer += t
      let cut
      while ((cut = findCut())) {
        const sentence = buffer.slice(0, cut).trim()
        buffer = buffer.slice(cut)
        isFirst = false
        if (sentence) pushSentence(sentence)
      }
    },
    flush() { if (buffer.trim()) { pushSentence(buffer.trim()); buffer = '' } }
  }
}

function cleanForSpeech(t) {
  return t
    .replace(/\[[^\]]*\]|\([^)]*\)|\{[^}]*\}/g, ' ')   // brackets/parens/braces
    .replace(/https?:\/\/\S+/g, ' ')                    // URLs
    .replace(/[*_`#>|]+/g, ' ')                          // markdown
    .replace(/\s+/g, ' ').trim()
}

function createVoiceLink(stateAtom, onText) {
  const L = { ctxM: null, track: null, rec: null, listening: false,
              buf: [], silenceTimer: null, transcript: [], speakingStart: 0,
              lastSpeechEnd: 0, log: [], sessionId: null, liveId: null,
              gen: 0, llmActive: false, ctxP: null, srcs: [], nextAt: 0 }
  L.setState = s => stateAtom.set(s)
  const bump = () => { try { onVersionBump() } catch (e) { /* wired at register */ } }
  let onVersionBump = () => {}
  L._setBump = f => { onVersionBump = f }

  const say = (role, text) => {
    if (!text) return
    L.log.push({ role, text, t: Date.now() })
    if (L.log.length > 50) L.log.shift()
    onVersionBump()
    diag('voice.' + role, text)
  }
  L.addLog = say

  // ---- audio playback (Pocket Speaker, compact) ----
  L.cancelPlayback = () => {
    L.gen++
    L.srcs.forEach(s => { try { s.stop() } catch (e) {} })
    L.srcs = []
    L.nextAt = 0
  }
  const getOutCtx = () => {
    if (!L.ctxP) L.ctxP = new AudioContext()
    if (L.ctxP.state === 'suspended') L.ctxP.resume()
    return L.ctxP
  }
  const schedule = (ctx, samples, rate, myGen) => {
    const buf = ctx.createBuffer(1, samples.length, rate)
    buf.getChannelData(0).set(samples)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    const startAt = Math.max(ctx.currentTime + 0.03, L.nextAt)
    src.start(startAt)
    L.nextAt = startAt + buf.duration
    L.srcs.push(src)
    src.onended = () => {
      L.srcs = L.srcs.filter(x => x !== src)
      if (!L.srcs.length && myGen === L.gen) {
        L.lastSpeechEnd = performance.now()
        L.setState('hot')
        say('sys', 'lars done speaking')
        L.startListening().catch(() => {})
      }
    }
  }
  async function speakOne(text, myGen) {
    const form = new FormData()
    form.append('text', text)
    if (TTS_VOICE) form.append('voice_url', TTS_VOICE)
    const resp = await fetch(TTS_URL, { method: 'POST', body: form })
    if (!resp.ok) throw new Error('tts ' + resp.status)
    const reader = resp.body.getReader()
    const dec = new TextDecoder()
    let pending = new Uint8Array(0), headerDone = false, rate = 24000, header = new Uint8Array(0)
    const out = getOutCtx()
    for (;;) {
      if (myGen !== L.gen) { try { await reader.cancel() } catch (e) {} return }
      const { done, value } = await reader.read()
      if (done) break
      if (!headerDone) {
        header = new Uint8Array([...header, ...value])
        const h = header.length
        if (h >= 44 && header[0] === 0x52 && header[1] === 0x49) { // 'RIFF'
          rate = header[24] | (header[25] << 8) | (header[26] << 16) | (header[27] << 24)
          headerDone = true
          pending = header.subarray(h - (h % 2) >= 44 ? h % 2 : 0)
          pending = header.subarray(44)
        }
        if (!headerDone) continue
      } else pending = new Uint8Array([...pending, ...value])
      const usable = pending.length - (pending.length % 2)
      if (usable > 4800) {
        const i16 = new Int16Array(pending.buffer.slice(0, usable))
        const f32 = new Float32Array(i16.length)
        for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768
        schedule(out, f32, rate, myGen)
        pending = pending.slice(usable)
      }
    }
  }
  // speak sentences sequentially, gapless
  const speakQueue = []
  let draining = false
  async function drain() {
    if (draining) return
    draining = true
    while (speakQueue.length) {
      const text = speakQueue.shift()
      const myGen = L.gen
      try { await speakOne(text, myGen) } catch (e) { say('err', 'tts: ' + e.message) }
      if (myGen !== L.gen) { speakQueue.length = 0; break }
    }
    draining = false
  }
  L.speak = text => { speakQueue.push(text); drain() }

  // ---- brain: native desktop session RPC (profile lars2) ----
  async function ensureSession() {
    // adopt the desktop's focused lars2 session when one is open (voice ⇄ typed continuity)
    try {
      const fp = host.state.focusedSessionProfile ? host.state.focusedSessionProfile.get() : ''
      const fsid = host.state.focusedStoredSessionId ? host.state.focusedStoredSessionId.get() : null
      if (fp === PROFILE && fsid) { L.sessionId = fsid; diag('session', 'adopted focused ' + fsid) }
    } catch (e) {}
    if (L.sessionId) {
      try {
        const r = await host.request('session.resume', { session_id: L.sessionId, profile: PROFILE, lazy: true })
        L.liveId = r.session_id
        return L.liveId
      } catch (e) { L.sessionId = null }   // stale stored id → recreate
    }
    try {
      const mr = await host.request('session.most_recent', { profile: PROFILE })
      const stored = mr && (mr.stored_session_id || mr.session_id)
      if (stored) {
        const r = await host.request('session.resume', { session_id: stored, profile: PROFILE, lazy: true })
        L.sessionId = stored; L.liveId = r.session_id
        return L.liveId
      }
    } catch (e) {}
    const c = await host.request('session.create', { profile: PROFILE, title: 'Voice — ' + new Date().toISOString().slice(0, 16), source: 'voice' })
    L.sessionId = c.stored_session_id || c.session_id
    L.liveId = c.session_id
    return L.liveId
  }

  L.turnActive = false
  async function submitTurn(userText) {
    if (!userText.trim() || L.turnActive) return
    L.cancelEverything()
    const myGen = L.gen
    L.turnActive = true
    L.llmActive = true
    L.deltaLoggedTurn = false
    say('user', userText)
    L.setState('user')
    // NOTE: mic/VAD stays live through the turn — it powers barge-in while
    // Lars speaks. Capture is suppressed by the llmActive branch in poll().
    const chunker = makeChunker(sentence => {
      if (myGen !== L.gen) return
      const clean = cleanForSpeech(sentence)
      if (!clean) return
      say('lars', clean)
      if (!L.speakingStart) { L.speakingStart = performance.now(); L.setState('lars') }
      L.speak(clean)
    })
    let full = '', firstDelta = false
    let placementDone = false
    try {
      const sid = await ensureSession()
      const res = await host.request('prompt.submit', { session_id: sid, profile: PROFILE, text: userText, surface: 'voice' })
      diag('brain', 'prompt.submit -> ' + JSON.stringify(res).slice(0, 200))
      // stream deltas until run finishes; host.onEvent listeners below feed handleEvent()
      L.pendingTurn = { chunker, myGen }
    } catch (e) {
      say('err', 'brain: ' + (e.message || e))
      L.setState('hot')
      L.turnActive = false; L.llmActive = false
      return
    }
  }

  // gateway event handlers (registered via ctx.onEvent at plugin register)
  L.handleGatewayEvent = ev => {
    const sid = ev.session_id || ev.payload?.session_id || ''
    const payload = ev.payload || ev
    const type = ev.type || ev.method || ''
    // TEMP debug: first delta/complete per turn + orphans, into voice-events.log
    if (type === 'message.delta' || type === 'message.interim' || type === 'message.complete') {
      if (L.liveId && sid && sid !== L.liveId) {
        if (type === 'message.complete') diag('voice.sys', 'evt other-session sid=' + sid.slice(-8))
        return
      }
      if (type === 'message.complete' && !L.pendingTurn) diag('voice.sys', 'complete but no pendingTurn')
      if ((type === 'message.delta' || type === 'message.interim') && !L.pendingTurn) diag('voice.sys', type + ' but no pendingTurn')
    }
    if (L.liveId && sid && sid !== L.liveId) return   // not our session's turn
    if (type === 'message.delta' || type === 'message.interim') {
      const t = (payload && (payload.text || payload.delta)) || ''
      if (!t || !L.pendingTurn) return
      if (payload.already_streamed && type === 'message.interim') return
      const { chunker, myGen } = L.pendingTurn
      if (myGen !== L.gen) return
      if (!L.deltaLoggedTurn) { L.deltaLoggedTurn = true; diag('voice.sys', 'delta ok') }
      firstDeltaSeen = true
      fullBuf += t
      chunker.push(t)
      armFinishGuard()
    } else if (type === 'message.complete') {
      const full = (payload && payload.text) || ''
      if (L.pendingTurn && full && !deltaGotEnough()) {
        // deltas absent → speak the full reply as fallback
        const { chunker, myGen } = L.pendingTurn
        if (myGen === L.gen && fullBuf.trim().length < full.trim().length) { chunker.push(full.slice(fullBuf.length)); fullBuf = full }
      }
      finishTurn()
    }
  }
  let fullBuf = '', firstDeltaSeen = false
  const deltaGotEnough = () => fullBuf.trim().length > 0 && (peekRunDone || false)
  let peekRunDone = false
  function finishTurn() {
    if (!L.pendingTurn) return
    peekRunDone = true
    const { chunker } = L.pendingTurn
    chunker.flush()
    L.pendingTurn = null
    L.turnActive = false
    L.llmActive = false
    // attach-per-turn hygiene (old-module lesson): release the live lease so the
    // desktop composer and this voice turn never fight over "chat open elsewhere".
    if (L.liveId) host.request('session.close', { session_id: L.liveId, profile: PROFILE }).catch(() => {})
    L.setState(L.srcs.length ? 'lars' : 'hot')
  }

  // fallback: if no message.complete arrives within N s of last delta, end turn
  let finishGuardId = null
  const armFinishGuard = () => {
    if (finishGuardId) window.clearTimeout(finishGuardId)
    finishGuardId = window.setTimeout(() => { if (L.pendingTurn && fullBuf.trim()) finishTurn() }, 5000)
  }

  L.cancelEverything = () => {
    L.cancelPlayback()
    L.pendingTurn = null
    L.turnActive = false
    L.llmActive = false
  }

  // ---- STT: local faster-whisper fallback + VAD silence commit + barge-in ----
  // Pipeline: mic stream → RMS VAD → capture Float32 PCM while user speaks →
  // after CFG.SILENCE_MS of silence, resample to 16 kHz, encode WAV, POST to
  // CFG.STT_URL (voice2/stt_local.py) → text → commitUtterance.
  L.startListening = async () => {
    if (L.listening) return
    let track
    try { track = await setupMicTrack() } catch (e) { say('err', 'mic: permission denied'); return }
    L.track = track
    try { L.ctxM = L.ctxM || new AudioContext(); if (L.ctxM.state === 'suspended') await L.ctxM.resume() } catch (e) {}
    const ctxM = L.ctxM
    const src = ctxM.createMediaStreamSource(track)
    const an = ctxM.createAnalyser(); an.fftSize = 1024
    src.connect(an)                    // analyse only — never to destination (no echo loop)
    L.analyser = an
    L.vadBuf = new Float32Array(an.fftSize)
    L.roll = []; L.cap = []; L.capSpeech = false; L.silMs = 0; L.bargeRun = 0
    L.listening = true
    if (!L.llmActive) L.setState('hot')
    const POLL_MS = (an.fftSize / ctxM.sampleRate) * 1000   // ~21 ms window per poll
    const finalize = async () => {
      const ch = L.cap; const sr = ctxM.sampleRate
      L.cap = []; L.capSpeech = false; L.silMs = 0
      const durMs = ch.length * POLL_MS
      if (durMs < CFG.STT_MIN_AUDIO_MS) return            // too short = noise
      const total = ch.reduce((n, b) => n + b.length, 0)
      if (!total) return
      try {
        // resample 48 kHz → 16 kHz for whisper (OfflineAudioContext does it in one shot)
        const samples = new Float32Array(total); let o = 0
        for (const b of ch) { samples.set(b, o); o += b.length }
        const big = ctxM.createBuffer(1, samples.length, sr)
        big.getChannelData(0).set(samples)
        const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(samples.length * 16000 / sr)), 16000)
        const s2 = off.createBufferSource(); s2.buffer = big; s2.connect(off.destination); s2.start()
        const small = await off.startRendering()
        const pcm = small.getChannelData(0)
        // encode 16-bit PCM WAV
        const wav = new ArrayBuffer(44 + pcm.length * 2)
        const v = new DataView(wav)
        const str = (i, s) => { for (let i2 = 0; i2 < s.length; i2++) v.setUint8(i + i2, s.charCodeAt(i2)) }
        str(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ')
        v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
        v.setUint32(24, 16000, true); v.setUint32(28, 16000 * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
        str(36, 'data'); v.setUint32(40, pcm.length * 2, true)
        for (let i = 0; i < pcm.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true)
        const resp = await fetch(CFG.STT_URL, { method: 'POST', signal: myGenAbort(), headers: { 'Content-Type': 'audio/wav' }, body: wav })
        if (!resp.ok) throw new Error('stt http ' + resp.status)
        const j = await resp.json()
        const text = (j.text || '').trim()
        if (text && !L.turnActive) submitTurn(text)
        else if (text) L.bufferedText = text   // turn already live (race) — don't double-log
        else say('sys', 'stt heard nothing (too quiet?)')
      } catch (e) { say('err', 'stt: ' + (e.message || e)) }
    }
    const poll = () => {
      if (!L.listening) return
      an.getFloatTimeDomainData(L.vadBuf)
      let peak = 0
      for (let i = 0; i < L.vadBuf.length; i++) { const a = L.vadBuf[i] < 0 ? -L.vadBuf[i] : L.vadBuf[i]; if (a > peak) peak = a }
      // Live mic level for the orb react-o-meter (0..~1 after normalize)
      L.level = Math.min(1, peak * 6)
      if (L.llmActive || L.srcs.length) {
        // barge-in channel: sustained energetic speech while Lars is talking
        L.levelWho = 'lars'
        L.roll = []
        if (peak > CFG.BARGE_RMS) {
          L.bargeRun++
          if (L.bargeRun >= CFG.BARGE_POLLS && performance.now() - L.speakingStart > CFG.BARGE_GRACE_MS) { L.bargeRun = 0; L.bargeIn() }
        } else L.bargeRun = 0
      } else {
        // hot-mic capture: ring buffer + utterance recording + SILENCE_MS commit
        L.levelWho = L.capSpeech ? 'user' : ''
        L.roll.push(new Float32Array(L.vadBuf)); if (L.roll.length > 14) L.roll.shift()
        if (peak > CFG.STT_ON_LEVEL && !L.capSpeech) {
          L.capSpeech = true; L.silMs = 0
          L.cap = L.roll.map(b => new Float32Array(b))   // include pre-roll so word onsets survive
          L.roll = []
        }
        if (L.capSpeech) {
          L.cap.push(new Float32Array(L.vadBuf))
          if (L.cap.length * POLL_MS > 20000) { finalize(); }        // safety cut at 20 s
          else if (peak > CFG.STT_ON_LEVEL) L.silMs = 0
          else {
            L.silMs += POLL_MS
            if (L.silMs >= CFG.SILENCE_MS) finalize()
          }
        }
      }
      L.vadTimer = window.setTimeout(poll, POLL_MS)
    }
    poll()
  }
  // helper used by finalize: abort stale STT posts when a new turn starts
  const myGenAbort = () => {
    try { const c = new AbortController(); L.sttAcs = L.sttAcs || []; L.sttAcs.push(c)
          if (L.sttAcs.length > 4) L.sttAcs.shift(); return c.signal } catch (e) { return undefined }
  }
  L.stopListening = () => {
    L.listening = false
    if (L.vadTimer) { window.clearTimeout(L.vadTimer); L.vadTimer = null }
    if (L.track) { L.track.getTracks().forEach(t => t.stop()); L.track = null }
    if (L.ctxM) { try { L.ctxM.close() } catch (e) {} L.ctxM = null }
    L.cap = []; L.capSpeech = false
  }

  function maybeBarge(heard) {
    if (!L.llmActive || !heard) return false
    const now = performance.now()
    if (now - L.speakingStart < CFG.BARGE_GRACE_MS) return false
    const spokenSet = new Set((L.spokenWords || []).slice(-60))
    const heardWords = heard.toLowerCase().split(/\s+/).filter(Boolean)
    const buttons = heardWords.some(w => CFG.BARGE_WORDS.has(w))
    const novel = heardWords.filter(w => w.length > 2 && !spokenSet.has(w)).length
    if (buttons || novel >= CFG.BARGE_MIN_NOVEL) {
      L.spokenWords = heardWords
      L.bargeIn()
      return true
    }
    return false
  }

  // barge-in: flush TTS + interrupt the agent turn; keep listening
  L.bargeIn = () => {
    console.log('[lars-voice] barge-in')
    diag('voice.sys', 'barge-in')
    L.cancelPlayback()
    if (L.liveId) host.request('session.interrupt', { session_id: L.liveId, profile: PROFILE }).catch(() => {})
    L.pendingTurn = null; L.turnActive = false; L.llmActive = false
    L.setState('hot')
    if (!L.listening) L.startListening().catch(() => {})
  }
  L.spokenWords = []

  function commitUtterance(text) {
    if (!text || L.turnActive) return
    submitTurn(text)
  }

  // ---- live cycle ----
  L.start = () => {
    if (L.open) return
    L.open = true
    L.setState('hot')
    L.startListening().catch(() => {})
  }
  L.open = false
  L.stop = () => {
    L.open = false
    L.cancelEverything()
    L.stopListening()
    L.setState('deaf')
  }
  L.startCapture = async () => { /* Web Speech owns the mic — retained for interface compat */ L.startListening().catch(() => {}) }
  L.stopCapture = () => { L.stopListening() }
  L.typed = text => { if (text) submitTurn(text) }

  return L
}

// ── JarvisMic — dynamic voice module (lower-right of Div 7) ──────────────────
// Dark-glass reactor: two counter-rotating dashed rings, three colored arcs
// lunging over a pulsing glowing orb, plus live waveform bars (CSS-animated).
// Animations run through an injected <style> tag — pages are sandbox-free, so
// this is allowed. PLACEHOLDER: orb/waveform will be driven by the local voice
// service per Voice-AI-README.md (rev 2) once built — AudioWorklet PCM capture,
// WebSocket to :8000, streamed TTS playback. EXPAND → core Hermes session chat.
// Icon buttons — inline SVG (no SDK icon import risk), borderless per spec.
// +30% (2026-09-27): mic 16→21, kbd 17→22. MicIcon takes `on` → green tint.
function MicIcon({ on }) {
  const c = on ? JV.green : JV.mut
  return jsxs('svg', {
    width: '21', height: '21', viewBox: '0 0 24 24',
    style: on ? { filter: `drop-shadow(0 0 4px ${JV.green})` } : undefined,
    children: [
      jsx('rect', { x: '9', y: '3', width: '6', height: '11', rx: '3', fill: c }),
      jsx('path', { d: 'M5 11a7 7 0 0 0 14 0', stroke: c, strokeWidth: '1.6', fill: 'none', strokeLinecap: 'round' }),
      jsx('line', { x1: '12', y1: '18', x2: '12', y2: '21', stroke: c, strokeWidth: '1.6', strokeLinecap: 'round' })
    ]
  })
}

function KbdIcon() {
  return jsxs('svg', {
    width: '22', height: '22', viewBox: '0 0 24 24',
    children: [
      jsx('rect', { x: '2', y: '6', width: '20', height: '12', rx: '2', fill: 'none', stroke: JV.mut, strokeWidth: '1.5' }),
      jsx('line', { x1: '6', y1: '10', x2: '6', y2: '10', stroke: JV.mut, strokeWidth: '2', strokeLinecap: 'round' }),
      jsx('line', { x1: '10', y1: '10', x2: '10', y2: '10', stroke: JV.mut, strokeWidth: '2', strokeLinecap: 'round' }),
      jsx('line', { x1: '14', y1: '10', x2: '14', y2: '10', stroke: JV.mut, strokeWidth: '2', strokeLinecap: 'round' }),
      jsx('line', { x1: '18', y1: '10', x2: '18', y2: '10', stroke: JV.mut, strokeWidth: '2', strokeLinecap: 'round' }),
      jsx('line', { x1: '7', y1: '14', x2: '17', y2: '14', stroke: JV.mut, strokeWidth: '1.6', strokeLinecap: 'round' })
    ]
  })
}

function JarvisMic({ posAtom, panelAtom, stateAtom, voiceLink, transcriptAtom }) {
  const micCSS =
    '@keyframes ljSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}}' +
    '@keyframes ljReverse{from{transform:rotate(0)}to{transform:rotate(-360deg)}}' +
    '@keyframes ljOrbPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}'

  const pos = useValue(posAtom)
  const panel = useValue(panelAtom)
  // Voice state: 'deaf' | 'hot' | 'user' (mic hears user → green) | 'lars' (speaking → violet).
  const vstate = useValue(stateAtom)
  const hot = vstate === 'hot' || vstate === 'user' || vstate === 'lars'

  // Audio-reactive orb: a 60 ms interval (started once) reads the engine's
  // live mic level (voiceLink.level / .levelWho, set in the VAD poll) and
  // drives the two state halos + core pulse directly on DOM ids — no React
  // re-renders. Idle: both halos off, core hollow and static.
  if (!window._ljPulseIv || window._ljPulseVoice !== voiceLink) {
    if (window._ljPulseIv) window.clearInterval(window._ljPulseIv)
    window._ljPulseVoice = voiceLink
    window._ljPulseIv = setInterval(() => {
      try {
        const vg = document.getElementById('ljHaloU')
        const vv = document.getElementById('ljHaloL')
        const core = document.getElementById('ljCore')
        if (!vg || !vv || !core) return
        const who = (voiceLink && voiceLink.levelWho) || ''
        const lvl = Math.min(1, (voiceLink && voiceLink.level) || 0)
        const setScale = s => core.setAttribute('transform', `translate(24 24) scale(${s}) translate(-24 -24)`)
        if (!voiceLink || !voiceLink.listening) {
          vg.setAttribute('opacity', '0')
          vv.setAttribute('opacity', '0')
          setScale(1)
          return
        }
        if (who === 'lars') {
          // Lars voice isn't in the mic analyser — synthetic speaking pulse
          const p = (Math.sin(performance.now() / 220) + 1) / 2
          vg.setAttribute('opacity', '0')
          vv.setAttribute('opacity', String(0.15 + 0.75 * p))
          setScale(1 + 0.3 * p)
        } else {
          if (who === 'user' && lvl > 0) {
            vg.setAttribute('opacity', String(0.25 + 0.7 * lvl))
          } else {
            vg.setAttribute('opacity', '0')
          }
          vv.setAttribute('opacity', '0')
          setScale(who === 'user' ? 1 + 0.3 * lvl : 1)
        }
      } catch (e) { /* orb not mounted this render */ }
    }, 60)
  }

  // Glow per state (2026-09-27): user talking → green, Lars talking → dark
  // purple, off/hot-listening → plain (the green tint lives on the mic icon).
  const glow =
    vstate === 'user' ? `0 0 30px ${JV.green}77`
    : vstate === 'lars' ? `0 0 30px ${JV.violet}88`
    : `0 0 24px ${JV.cyan}22`

  // Cosmetics 2026-09-27 (NOTES.md): bars removed, outer solid ring removed,
  // ring speeds -50%, core = dark purple/black, graphic +30% (53→69px).
  // Module: position:fixed + zIndex 9999 (floats over page items, layout-inert),
  // rendered on EVERY custom page (persists across Div nav), draggable orb
  // (position stored), TYPE toggles a 25vw panel (transcript + entry box).

  const orbDrag = {
    // Pointer-drag via element capture (no hooks — state rides on the DOM node,
    // same pattern as the scroll persistence below).
    onPointerDown: e => {
      const el = e.currentTarget
      const rect = el.getBoundingClientRect()
      el._drag = { px: e.clientX, py: e.clientY, x: rect.left, y: rect.top }
      el.setPointerCapture(e.pointerId)
    },
    onPointerMove: e => {
      const el = e.currentTarget
      const d = el._drag
      if (!d) return
      const nx = d.x + (e.clientX - d.px)
      const ny = d.y + (e.clientY - d.py)
      posAtom.set({
        x: Math.max(4, Math.min(window.innerWidth - 120, nx)),
        y: Math.max(4, Math.min(window.innerHeight - 60, ny))
      })
    },
    onPointerUp: e => { delete e.currentTarget._drag },
    style: { cursor: 'grab', touchAction: 'none' }
  }

  const iconBtn = {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: '4px',
    display: 'inline-flex',
    alignItems: 'center'
  }

  // Panel mode: transcript (live) + type box → same session as voice.
  // transcriptAtom is a version counter; entries live on voiceLink.log.
  useValue(transcriptAtom)
  const entries = (voiceLink && voiceLink.log) || []
  // Auto-scroll transcript to newest (bottom) on every render bump and on open.
  setTimeout(() => {
    const el = document.getElementById('ljTranscript')
    if (el) el.scrollTop = el.scrollHeight
  }, 0)
  const transcript = jsxs('div', {
    id: 'ljTranscript',
    style: {
      flex: 1,
      width: '100%',
      overflowY: 'auto',
      border: `1px solid ${JV.edge}`,
      borderRadius: '6px',
      background: 'rgba(2,7,12,0.55)',
      padding: '8px',
      fontSize: '11px',
      color: JV.mut
    },
    children: (entries || []).length
      ? entries.map((e, i) => jsxs('div', {
          key: i,
          style: { marginBottom: '4px', color: e.role === 'user' ? 'rgba(64,200,255,1)' : e.role === 'err' ? JV.amber : JV.ink },
          children: [
            jsx('span', { style: { color: JV.dim, marginRight: '4px' },
              children: e.role === 'user' ? 'you:' : e.role === 'err' ? 'err:' : 'lars:' }),
            e.text
          ]
        }))
      : 'Voice core wired — talk or type. Transcript shows here.'
  })

  const typeBox = jsx('input', {
    type: 'text',
    placeholder: 'Type to Lars… (Enter sends)',
    onKeyDown: e => {
      if (e.key === 'Enter' && e.currentTarget.value.trim()) {
        voiceLink.typed(e.currentTarget.value.trim())
        e.currentTarget.value = ''
      }
    },
    style: {
      width: '100%',
      background: 'rgba(2,7,12,0.55)',
      border: `1px solid ${JV.edge}`,
      borderRadius: '6px',
      color: JV.ink,
      fontSize: '11px',
      fontFamily: JV.mono,
      padding: '6px 8px',
      outline: 'none'
    }
  })

  return jsxs('div', {
    key: 'mic',
    style: {
      position: 'fixed',
      ...(pos ? { left: pos.x + 'px', top: pos.y + 'px' } : { right: '14px', bottom: '14px' }),
      width: panel ? '25vw' : '132px',
      height: panel ? '82vh' : '196px',
      background: 'transparent',
      border: 'none',
      borderRadius: '22px',
      boxShadow: 'none',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '8px',
      fontFamily: JV.mono,
      zIndex: 9999
    },
    children: [
      jsx('style', { children: micCSS }),
      // Reactor (donor-style, Itsme23476): faint base ring, dashed counter-
      // rotating rings, 3 comet arcs (cyan/amber/violet), tick dial, glowing
      // core. DRAG HANDLE. State glow rides on the orb, not the box.
      jsxs('div', { ...orbDrag, style: { ...orbDrag.style, position: 'relative', display: 'inline-flex' }, children: [
        jsxs('svg', {
          id: 'ljOrb',
          width: '112',
          height: '112',
          viewBox: '-4 -4 56 56',
          style: { filter: glow },
          children: [
            jsx('defs', {
              children: [
                jsx('radialGradient', {
                  id: 'ljCoreGg',
                  children: [
                    jsx('stop', { offset: '0%', stopColor: JV.green, stopOpacity: '0.5' }),
                    jsx('stop', { offset: '100%', stopColor: JV.green, stopOpacity: '0' })
                  ]
                }),
                jsx('radialGradient', {
                  id: 'ljCoreGv',
                  children: [
                    jsx('stop', { offset: '0%', stopColor: JV.violet, stopOpacity: '0.55' }),
                    jsx('stop', { offset: '100%', stopColor: JV.violet, stopOpacity: '0' })
                  ]
                })
              ]
            }),
            // faint solid base ring (outermost) — 2× thickness (1.4 → 2.8)
            jsx('circle', {
              cx: '24', cy: '24', r: '20.6',
              fill: 'none', stroke: JV.cyan, strokeOpacity: '0.14', strokeWidth: '2.8'
            }),
            // dashed slow rings (counter-rotating) — the "orbiting dots".
            // Gap from the base ring tripled: 19 → 15.8 (gap 20.6→4.8 ... kept
            // separation between the two dash rings: 15.8 / 12.6)
            jsx('circle', {
              cx: '24', cy: '24', r: '15.8',
              fill: 'none', stroke: JV.cyan, strokeOpacity: '0.35', strokeWidth: '0.7',
              strokeDasharray: '2 10',
              style: { transformOrigin: '24px 24px', animation: 'ljSpin 42s linear infinite' }
            }),
            jsx('circle', {
              cx: '24', cy: '24', r: '12.6',
              fill: 'none', stroke: JV.cyan, strokeOpacity: '0.3', strokeWidth: '0.6',
              strokeDasharray: '1 8',
              style: { transformOrigin: '24px 24px', animation: 'ljReverse 30s linear infinite' }
            }),
            // comet arcs — 3 lengths/thicknesses, bright cyan/teal (Utility-text color)
            // biggest arc ghosted
            jsx('circle', {
              cx: '24', cy: '24', r: '21',
              fill: 'none', stroke: 'rgba(64,200,255,0.37)', strokeWidth: '1.6',
              strokeLinecap: 'round', strokeDasharray: '14 118',
              style: { transformOrigin: '24px 24px', animation: 'ljSpin 12s linear infinite' }
            }),
            jsx('circle', {
              cx: '24', cy: '24', r: '18',
              fill: 'none', stroke: 'rgba(64,200,255,0.42)', strokeWidth: '1.1',
              strokeLinecap: 'round', strokeDasharray: '8 105',
              style: { transformOrigin: '24px 24px', animation: 'ljReverse 8s linear infinite' }
            }),
            jsx('circle', {
              cx: '24', cy: '24', r: '16',
              fill: 'none', stroke: 'rgba(64,200,255,0.45)', strokeWidth: '0.8',
              strokeLinecap: 'round', strokeDasharray: '6 95',
              style: { transformOrigin: '24px 24px', animation: 'ljSpin 17s linear infinite' }
            }),
            // radiator fan: 70 hairline lines on the inside edge of the outer
            // ring band, pointing inward — tips stop at the inner of the two
            // dashed orbits BEFORE the deepest one (tips at r≈16.2), so the
            // dash ring at 15.8 rides at the teeth's edge and the deeper
            // orbits stay clear. Same transparency as the ring (0.14).
            jsx('g', {
              opacity: '0.14',
              children: Array.from({ length: 70 }, (_, i) =>
                jsx('line', {
                  x1: (24 + Math.cos((i / 70) * Math.PI * 2) * 20.2).toFixed(2),
                  y1: (24 + Math.sin((i / 70) * Math.PI * 2) * 20.2).toFixed(2),
                  x2: (24 + Math.cos((i / 70) * Math.PI * 2) * 16.2).toFixed(2),
                  y2: (24 + Math.sin((i / 70) * Math.PI * 2) * 16.2).toFixed(2),
                  stroke: JV.cyan, strokeWidth: '0.35'
                }, 'f' + i))
            }),
            // state halos: green (user) / violet (Lars) — start AT the core ring
            // and fade out to the first orbiting dot-ring (r=12.6).
            // Opacity 0 idle — driven live by the pulse loop below.
            jsx('circle', { id: 'ljHaloU', cx: '24', cy: '24', r: '12.6', fill: 'url(#ljCoreGg)', opacity: '0' }),
            jsx('circle', { id: 'ljHaloL', cx: '24', cy: '24', r: '12.6', fill: 'url(#ljCoreGv)', opacity: '0' }),
            // solid core disc — JV.cyan @ same transparency as the outermost
            // ring (0.14), pulsing via scale; +30% (5.4 → 7.0)
            jsx('circle', { id: 'ljCore', cx: '24', cy: '24', r: '7.0',
              fill: JV.cyan, fillOpacity: '0.14' })
          ]
        }),
        jsx('div', {
          style: {
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: '13px',
            fontWeight: '700',
            letterSpacing: '0.14em',
            color: 'rgba(232,251,255,0.29)',
            textShadow: 'none',
            pointerEvents: 'none'
          },
          children: 'L.A.R.S'
        })
      ] }),
      // Mic + keyboard icon buttons (borderless, row).
      jsxs('div', {
        style: { display: 'flex', gap: '10px', marginTop: '2px', alignItems: 'center' },
        children: [
          jsx('button', {
                      type: 'button',
                      title: 'Talk — toggle hot mic (2 s silence = Lars replies; mic keeps streaming; idle → off; mic icon re-arms)',
                      onClick: () => {
                                              console.log(`[lars-voice] mic click, vstate=${vstate}`)
                                              if (vstate === 'deaf') {
                                                voiceLink.start()
                                                voiceLink.startCapture()   // async; listen sent on stream ready
                                              } else {
                                                voiceLink.stop()
                                              }
                      },
                      style: iconBtn,
                      children: jsx(MicIcon, { on: hot })
                    }),
          jsx('button', {
            type: 'button',
            title: 'Re-arm mic — restart the listener if it went stale',
            onClick: () => {
              voiceLink.stop()
              setTimeout(() => voiceLink.start(), 150)
            },
            style: iconBtn,
            children: jsxs('svg', {
              width: '18', height: '18', viewBox: '0 0 24 24',
              children: [
                jsx('path', { d: 'M4 12a8 8 0 0 1 13.6-5.7M20 12a8 8 0 0 1-13.6 5.7', stroke: JV.cyan, strokeWidth: '1.6', fill: 'none', strokeLinecap: 'round' }),
                jsx('path', { d: 'M18 3v4h-4M6 21v-4h4', stroke: JV.cyan, strokeWidth: '1.6', fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' })
              ]
            })
          }),
          jsx('button', {
            type: 'button',
            title: 'Type — toggle chat panel (25% width)',
            onClick: () => panelAtom.set(!panel),
            style: iconBtn,
            children: jsx(KbdIcon, {})
          })
        ]
      }),
      // Panel content (TYPE mode): transcript + entry box.
      panel
        ? jsxs('div', {
            style: { display: 'flex', flexDirection: 'column', gap: '6px', width: '100%', flex: 1, marginTop: '6px', minHeight: 0 },
            children: [transcript, typeBox]
          })
        : null
    ]
  })
}

// ── Titlebar utilities (desktop params + resource use) ──────────────────────
// Left: Profile, Model, Ver, OS, Gateway, Agents, Sessions, Uptime
// Right: "Hermes Resource Use:" + CPU, RAM, HDD
// No cron — user removed. 5s poll on sysstats.
// Helpers for chip rendering
function chip(label, value, accent) {
  return jsxs('span', {
    key: label,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '3px',
      padding: '1px 5px',
      borderRadius: '3px',
      border: `1px solid ${JV.edge}`,
      background: 'rgba(2,7,12,0.55)'
    },
    children: [
      jsx('span', { style: { color: JV.dim }, children: label }),
      jsx('span', { style: { color: JV.cyan, textShadow: `0 0 5px ${JV.cyan}` }, children: value })
    ]
  })
}

function TitlebarUtils() {
  const model = useValue(host.state.model)
  const profile = useValue(host.state.profile)
  const gateway = useValue(host.state.gateway)

  const sysQ = useQuery({
    queryKey: ['lars-sysstats'],
    queryFn: () => (pluginCtx ? pluginCtx.rest('/stats', { timeoutMs: 4000 }) : Promise.reject(new Error('no ctx'))),
    refetchInterval: 5000,
    retry: false
  })
  const sys = sysQ.data && sysQ.data.ok ? sysQ.data : null

  // Extract OS short name from e.g. "Windows 10" → "Windows"
  const osName = sys ? (sys.os || '').split(/\s/)[0] || sys.os : 'β'

  const desktopChips = [
    chip('Lars model', sys ? sys.lars_model : 'β'),
    chip('Ver', sys ? sys.hermes : 'β'),
    chip('OS', osName),
    chip('Gateway', gateway === 'open' ? 'Connected' : gateway || '…'),
    chip('Agents', '—'), // TODO: wire from host.request()
    chip('Sessions', '—'), // TODO: wire from host.request()
    chip('Uptime', sys ? `${sys.proc_uptime_s}s` : 'β')
  ]

  const resourceChips = [
    chip('CPU', sys ? `${sys.cpu_percent}%` : 'β'),
    chip('RAM', sys ? `${Math.round(sys.ram_mb)}MB` : 'β'),
    chip('HDD', sys ? `${Math.round(sys.hdd_mb)}MB` : 'β')
  ]

  return jsxs('div', {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
      fontFamily: JV.mono,
      fontSize: '9px',
      color: JV.mut,
      letterSpacing: '0.05em',
      whiteSpace: 'nowrap'
    },
    children: [
      jsx('div', {
        style: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'nowrap' },
        children: desktopChips
      }),
      jsxs('div', {
        style: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'nowrap' },
        children: [
          jsx('span', { style: { color: JV.dim, fontSize: '9px', marginRight: '3px' }, children: 'Resources:' }),
          ...resourceChips
        ]
      })
    ]
  })
}

// ── Shared page chrome ───────────────────────────────────────────────────────
// Atoms are created ONCE in register() and passed in — never inside the
// component (a fresh atom per render would reset state on every keystroke).
function LarsPage({ collapsedAtom, expandedAtom, posAtom, panelAtom, stateAtom, voiceLink, transcriptAtom, activePath, div, store }) {
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
      jsx('img', { src: LOGO_DATA, alt: 'Lars', style: { height: '44px', width: 'auto', objectFit: 'contain' } }),
      collapsed
        ? null
        : jsx('div', { style: { fontSize: '13px', fontWeight: '700', color: 'var(--ui-text-primary)', letterSpacing: '0.08em' }, children: 'Lars' })
    ]
  })

  // Voice/mic module: floats on EVERY custom page (fixed overlay, persists
      // across Div nav). Lars shell level.
      const micModule = jsx(JarvisMic, { posAtom, panelAtom, stateAtom, voiceLink, transcriptAtom })

  // Own the app titlebar while Div 7 is up: contribution into titleBar slots
    // makes pageOwnsTitlebar true → the app's fixed clusters hide, ours render.
    // Mount-scoped via <Contribute> — leaves with the page.
    const titlebarChrome = isHome
      ? jsxs('div', { key: 'titlebar', children: [
          jsx(Contribute, { area: TITLEBAR_AREAS.left, id: 'lars:titlebar-brand', children:
            jsx('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' }, children: [
              jsx('img', { src: LOGO_DATA, alt: 'Lars', style: { height: '30px', width: 'auto', objectFit: 'contain' } }),
              jsx('span', { style: { fontSize: '13px', fontWeight: '700', color: 'var(--ui-text-primary)', letterSpacing: '0.08em' }, children: 'Lars' })
            ]})
          }),
          jsx(Contribute, { area: TITLEBAR_AREAS.right, id: 'lars:titlebar-utils', children: jsx(TitlebarUtils, {}) })
        ]})
      : null

  return jsxs('div', {
    key: 'page',
    style: { display: 'flex', height: '100%', width: '100%', overflow: 'hidden' },
    children: [
      // Mounts titleBar.left/right projections (renders into the app titlebar).
      titlebarChrome,
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
        children: [toggleBtn, ...menuItems]
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
      // Div 7 extra layer: mic — floats on EVERY custom page now.
            micModule
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
    pluginCtx = ctx
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

          // Mic module: draggable position + TYPE panel toggle (persisted).
          const posAtom = atom(ctx.storage.get('micPos', null))
          posAtom.listen(v => ctx.storage.set('micPos', v))
          const panelAtom = atom(ctx.storage.get('micPanel', false))
              panelAtom.listen(v => ctx.storage.set('micPanel', v))
              // Voice state — NOT persisted (a reload = deaf, wake re-arms via "Hey Lars").
              const stateAtom = atom('deaf')
              // Transcript + voice link (created ONCE here — survives page nav).
              // Plain closure array (no atom .get dependency); transcriptAtom
              // holds a version counter just to trigger re-render.
              const transcriptAtom = atom(0)
              const transcriptLog = []
              const voiceLink = createVoiceLink(stateAtom, (role, text) => {
                if (!text) return
                transcriptLog.push({ role, text, t: Date.now() })
                if (transcriptLog.length > 50) transcriptLog.shift()
                const cur = typeof transcriptAtom.get === 'function' ? transcriptAtom.get() : 0
                transcriptAtom.set(cur + 1)
              })
              voiceLink.log = transcriptLog
              // Native gateway event stream → voice turn deltas (message.delta,
              // message.interim, message.complete; subsystem events filtered inside).
              host.onEvent('*', ev => { try { voiceLink.handleGatewayEvent(ev) } catch (e) {} })

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
                      posAtom,
                                  panelAtom,
                                  stateAtom,
                                  voiceLink,
                                  transcriptAtom,
                      activePath: resolved.path,
            div: resolved,
            store: ctx.storage
          })
        }
      })
    }
  }
}
