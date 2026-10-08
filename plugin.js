/**
 * Lars — Executive Div 7 Master plugin (Hermes desktop app).
 *
 * 7 pages under one shell. Plain ESM, no build step; folder name == id.
 * Door: <home>/desktop-plugins/lars/plugin.js. Only these imports resolve:
 * @hermes/plugin-sdk, react, react/jsx-runtime (everything else fails —
 * sandbox, Blob-URL loading, relative files don't resolve).
 * Routes: /lars /lars-comms /lars-clients /lars-records /lars-production
 * /lars-debug /lars-crm. State persists per page in ctx.storage; the core
 * sidebar "Lars" row resolves to the last-visited page.
 * Gateway-mounted backend: plugins/lars/dashboard/plugin_api.py (/stats +
 * /voice-log). Voice (JarvisMic) → engine below + voice2/.
 */

import { atom, host, icons, Contribute, TITLEBAR_AREAS, PALETTE_AREA, ROUTES_AREA, SIDEBAR_NAV_AREA, useQuery, useValue } from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'

const ID = 'lars' // must match the folder name
let pluginCtx = null // set in register(); used by TitlebarUtils for ctx.rest

// ═══ 1. STYLE SCHEMA (LARS_STYLE) — palette/fonts lifted from Itsme23476/jarvis-hermes-dashboard ═══
const LARS_STYLE = {
  bg: '#02070c',            // near-black deep navy — page/app background
  bg2: '#061722',           // dark slate blue — raised surfaces
  panel: 'rgba(5,18,28,.64)', // navy glass 64% — panel fills
  edge: 'rgba(57,232,255,.24)', // cyan hairline — box borders
  edge2: 'rgba(57,232,255,.55)', // bright cyan hairline — hover/active borders
  cyan: '#40f3ff',          // electric cyan — primary accent, glows
  cyan2: '#16b8d4',         // teal — dim accent
  ink: '#e8fbff',           // pale ice-white — main text
  mut: '#83b7c4',           // steel cyan — secondary text (idle menu items)
  dim: '#47717f',           // dark steel — faint labels (chip keys)
  amber: '#ffb648',         // warm gold — warnings/accent arcs
  red: '#ff5d6c',           // coral red — errors
  green: '#39f5a6',         // mint green — ok/user-mic
  violet: '#a884ff',        // soft violet — Lars-speaking glow
  disp: '"Aptos Light","Segoe UI Light",system-ui,sans-serif', // MS default font (Win 11) — headings/sections/menu
  sans: '"Tahoma",Verdana,sans-serif',            // Windows system sans — normal paragraph text
  narrow: '"Bahnschrift Light","Bahnschrift",Arial,sans-serif', // condensed — specs / data / param displays
  mono: '"Consolas","Courier New",monospace'    // mono alias (typebox, code-y inputs)
}
// Fonts are Windows built-ins (Consolas/Colonna/Tahoma/Arial Narrow) — no
// network fetch needed. Cross-OS fallbacks only (Courier New/Verdana/Arial).

// ═══ 2. DIVISIONS + HOME PAGE LAYOUT ═══
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

// ═══ 3. EXEC HOME STAGGERED BOXES (click to EXPAND, no nav) ═══
const HOME_BOXES = [
  { id: 'stats', label: 'Div Stats', w: '220px', h: '110px' },
  { id: 'social', label: 'Social Posts / Comments', w: '180px', h: '90px' },
  { id: 'gi', label: 'GI Gross Income', w: '200px', h: '120px' },
  { id: 'comms', label: 'Crucial Comms', w: '240px', h: '100px' },
  { id: 'n8n', label: 'n8n Flow Stats', w: '170px', h: '90px' },
  { id: 'stocks', label: 'Custom Stocks', w: '190px', h: '110px' },
  { id: 'browser', label: 'Browser Panel', w: '210px', h: '100px' }
]

// ═══ 4. BRAND MARK — glyph logo (Colonna MT "L", cyan glow, amber under-shadow) ═══
// Single glyph; emoji planet removed. No image assets needed.
function LogoMark(small) {
  const pxw = small ? 32 : 56   // container width (planet overhangs the L)
  const px = small ? 31 : 52    // glyph size (+30%)
  return jsx('span', {
    style: { position: 'relative', display: 'inline-block', width: pxw + 'px', height: px + 'px', lineHeight: '1' },
    children: [
      // the L — fills the container, vertically centered
      jsx('span', {
        style: {
          position: 'absolute', left: '0', top: '50%', transform: 'translateY(-50%)',
          fontFamily: '"Colonna MT", serif',
          fontSize: px + 'px',
          color: LARS_STYLE.cyan2,
          textShadow: `-2.5px 2.5px 4px rgba(168,85,247,0.85), 0 0 6px ${LARS_STYLE.cyan}77, 0 0 16px ${LARS_STYLE.cyan}33`,
          filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.7))',
          lineHeight: '0.85'
        },
        children: 'L'
      })
    ]
  })
}

// ═══ 5. VOICE ENGINE CONFIG ═══
// Ported from AxiomLC/lars-pocket-tts (proven semi-streaming): Web Speech STT +
// 2 s silence turn-taking + echo defence → sentence chunker → Pocket TTS
// streamed WAV → gapless Web Audio → barge-in/re-arm.
// Brain: NATIVE desktop session — no API server, no helper server: host.request
// RPC (session.most_recent/resume/create, prompt.submit, session.interrupt,
// session.close) against PROFILE, deltas via gateway event stream
// (message.delta/interim/complete). Interface unchanged:
// start/stop/startCapture/typed/log/state ('deaf'|'hot'|'user'|'lars').
const PROFILE = 'lars2'
const TTS_URL = 'http://127.0.0.1:8000/tts'
const TTS_VOICE = 'jean'

// VOICE_KNOBS — the voice engine's behavior tuning (edit + reload plugins).
const VOICE_KNOBS = {
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
  STT_MIN_AUDIO_MS: 400,   // shorter than this is noise, discard
  BARGE_RMS: 0.060,        // while Lars speaks: peak above this for N polls = barge-in (echo risk knob; keep > STT_ON_LEVEL)
  BARGE_POLLS: 4,          // consecutive ~21 ms polls above BARGE_RMS required
}

// ═══ 6. DIAG — fire-and-forget log mirror to Hermes' voice-events.log ═══
// Transcript-visible events land in ~\AppData\Local\hermes\plugins\lars\voice-events.log
// via the gateway-mounted plugin_api backend (POST /voice-log, last-100 cap).
// Readable by Hermes agents (plain file) or GET /api/plugins/lars/voice-log.
function diag(src, msg) {
  try {
    if (!pluginCtx || !pluginCtx.rest) return
    pluginCtx.rest('/voice-log', {
      method: 'POST', body: { src, level: /\.err$|^err$/.test(src) ? 'error' : 'info', msg: String(msg).slice(0, 500) }
    }).catch(() => {})
// ═══ 7. MIC HELPERS + STREAMING CHUNKER ═══
  } catch (e) {}
}

const SpeechRecognitionCtor = null // Web Speech removed: Google endpoint unreachable from Electron renderer — STT is now local whisper via :8107

// (font note removed — all scheme fonts are Windows built-ins, see LARS_STYLE)

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
      if (m && buffer.slice(0, m.index + 1).trim().length >= VOICE_KNOBS.FIRST_SENTENCE_MIN)
        return m.index + 1
      const comma = buffer.indexOf(',')
      if (comma >= 0 && comma + 1 >= VOICE_KNOBS.FIRST_CLAUSE_MIN) return comma + 1
      return null
    }
    const m = buffer.slice(0, 160).match(/[.!?](\s|$)/g)
    if (m) {
      const end = buffer.indexOf(m[m.length - 1]) + 1
      if (buffer.slice(0, end).trim().length >= VOICE_KNOBS.SENTENCE_MIN) return end
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
  // after VOICE_KNOBS.SILENCE_MS of silence, resample to 16 kHz, encode WAV, POST to
  // VOICE_KNOBS.STT_URL (voice2/stt_local.py) → text → commitUtterance.
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
      if (durMs < VOICE_KNOBS.STT_MIN_AUDIO_MS) return            // too short = noise
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
        const resp = await fetch(VOICE_KNOBS.STT_URL, { method: 'POST', signal: myGenAbort(), headers: { 'Content-Type': 'audio/wav' }, body: wav })
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
        if (peak > VOICE_KNOBS.BARGE_RMS) {
          L.bargeRun++
          if (L.bargeRun >= VOICE_KNOBS.BARGE_POLLS && performance.now() - L.speakingStart > VOICE_KNOBS.BARGE_GRACE_MS) { L.bargeRun = 0; L.bargeIn() }
        } else L.bargeRun = 0
      } else {
        // hot-mic capture: ring buffer + utterance recording + SILENCE_MS commit
        L.levelWho = L.capSpeech ? 'user' : ''
        L.roll.push(new Float32Array(L.vadBuf)); if (L.roll.length > 14) L.roll.shift()
        if (peak > VOICE_KNOBS.STT_ON_LEVEL && !L.capSpeech) {
          L.capSpeech = true; L.silMs = 0
          L.cap = L.roll.map(b => new Float32Array(b))   // include pre-roll so word onsets survive
          L.roll = []
        }
        if (L.capSpeech) {
          L.cap.push(new Float32Array(L.vadBuf))
          if (L.cap.length * POLL_MS > 20000) { finalize(); }        // safety cut at 20 s
          else if (peak > VOICE_KNOBS.STT_ON_LEVEL) L.silMs = 0
          else {
            L.silMs += POLL_MS
            if (L.silMs >= VOICE_KNOBS.SILENCE_MS) finalize()
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
    if (now - L.speakingStart < VOICE_KNOBS.BARGE_GRACE_MS) return false
    const spokenSet = new Set((L.spokenWords || []).slice(-60))
    const heardWords = heard.toLowerCase().split(/\s+/).filter(Boolean)
    const buttons = heardWords.some(w => VOICE_KNOBS.BARGE_WORDS.has(w))
    const novel = heardWords.filter(w => w.length > 2 && !spokenSet.has(w)).length
    if (buttons || novel >= VOICE_KNOBS.BARGE_MIN_NOVEL) {
      L.spokenWords = heardWords
      L.bargeIn()
      return true
    }
    return false
  }
// ═══ 8. VOICE ENGINE (createVoiceLink) — STT capture / TTS stream / brain RPC ═══

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
// ═══ 9. INLINE SVG ICONS (no SDK icon import risk — borderless per spec) ═══
// +30% (2026-09-27): mic 16→21, kbd 17→22. MicIcon takes `on` → green tint.
function MicIcon({ on }) {
  const c = on ? LARS_STYLE.green : LARS_STYLE.mut
  return jsxs('svg', {
    width: '21', height: '21', viewBox: '0 0 24 24',
    style: on ? { filter: `drop-shadow(0 0 4px ${LARS_STYLE.green})` } : undefined,
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
      jsx('rect', { x: '2', y: '6', width: '20', height: '12', rx: '2', fill: 'none', stroke: LARS_STYLE.mut, strokeWidth: '1.5' }),
      jsx('line', { x1: '6', y1: '10', x2: '6', y2: '10', stroke: LARS_STYLE.mut, strokeWidth: '2', strokeLinecap: 'round' }),
      jsx('line', { x1: '10', y1: '10', x2: '10', y2: '10', stroke: LARS_STYLE.mut, strokeWidth: '2', strokeLinecap: 'round' }),
      jsx('line', { x1: '14', y1: '10', x2: '14', y2: '10', stroke: LARS_STYLE.mut, strokeWidth: '2', strokeLinecap: 'round' }),
      jsx('line', { x1: '18', y1: '10', x2: '18', y2: '10', stroke: LARS_STYLE.mut, strokeWidth: '2', strokeLinecap: 'round' }),
      jsx('line', { x1: '7', y1: '14', x2: '17', y2: '14', stroke: LARS_STYLE.mut, strokeWidth: '1.6', strokeLinecap: 'round' })
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
    vstate === 'user' ? `0 0 30px ${LARS_STYLE.green}77`
    : vstate === 'lars' ? `0 0 30px ${LARS_STYLE.violet}88`
    : `0 0 24px ${LARS_STYLE.cyan}22`

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
      border: `1px solid ${LARS_STYLE.edge}`,
      borderRadius: '6px',
      background: 'rgba(2,7,12,0.55)',
      padding: '8px',
      fontSize: '11px',
      fontFamily: LARS_STYLE.sans, // transcript body = Tahoma
      color: LARS_STYLE.mut
    },
    children: (entries || []).length
      ? entries.map((e, i) => jsxs('div', {
          key: i,
          style: { marginBottom: '4px', color: e.role === 'user' ? 'rgba(64,200,255,1)' : e.role === 'err' ? LARS_STYLE.amber : LARS_STYLE.ink },
          children: [
            jsx('span', { style: { color: LARS_STYLE.dim, marginRight: '4px' },
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
      border: `1px solid ${LARS_STYLE.edge}`,
      borderRadius: '6px',
      color: LARS_STYLE.ink,
      fontSize: '11px',
      fontFamily: LARS_STYLE.narrow, // typebox = Arial Narrow (specs input)
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
      fontFamily: LARS_STYLE.mono,
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
                    jsx('stop', { offset: '0%', stopColor: LARS_STYLE.green, stopOpacity: '0.5' }),
                    jsx('stop', { offset: '100%', stopColor: LARS_STYLE.green, stopOpacity: '0' })
                  ]
                }),
                jsx('radialGradient', {
                  id: 'ljCoreGv',
                  children: [
                    jsx('stop', { offset: '0%', stopColor: LARS_STYLE.violet, stopOpacity: '0.55' }),
                    jsx('stop', { offset: '100%', stopColor: LARS_STYLE.violet, stopOpacity: '0' })
                  ]
                })
              ]
            }),
            // faint solid base ring (outermost) — 2× thickness (1.4 → 2.8)
            jsx('circle', {
              cx: '24', cy: '24', r: '20.6',
              fill: 'none', stroke: LARS_STYLE.cyan, strokeOpacity: '0.21', strokeWidth: '2.8'
            }),
            // dashed slow rings (counter-rotating) — the "orbiting dots".
            // Gap from the base ring tripled: 19 → 15.8 (gap 20.6→4.8 ... kept
            // separation between the two dash rings: 15.8 / 12.6)
            jsx('circle', {
              cx: '24', cy: '24', r: '15.8',
              fill: 'none', stroke: LARS_STYLE.cyan, strokeOpacity: '0.52', strokeWidth: '0.7',
              strokeDasharray: '2 10',
              style: { transformOrigin: '24px 24px', animation: 'ljSpin 42s linear infinite' }
            }),
            jsx('circle', {
              cx: '24', cy: '24', r: '12.6',
              fill: 'none', stroke: LARS_STYLE.cyan, strokeOpacity: '0.45', strokeWidth: '0.6',
              strokeDasharray: '1 8',
              style: { transformOrigin: '24px 24px', animation: 'ljReverse 30s linear infinite' }
            }),
            // comet arcs — 3 lengths/thicknesses, dim amber (LARS_STYLE.amber #ffb648)
            // biggest arc ghosted
            jsx('circle', {
              cx: '24', cy: '24', r: '21',
              fill: 'none', stroke: 'rgba(64,243,255,0.23)', strokeWidth: '1.6',
              strokeLinecap: 'round', strokeDasharray: '14 118',
              style: { transformOrigin: '24px 24px', animation: 'ljSpin 12s linear infinite' }
            }),
            jsx('circle', {
              cx: '24', cy: '24', r: '18',
              fill: 'none', stroke: 'rgba(255,182,72,0.15)', strokeWidth: '1.1',
              strokeLinecap: 'round', strokeDasharray: '8 105',
              style: { transformOrigin: '24px 24px', animation: 'ljReverse 8s linear infinite' }
            }),
            jsx('circle', {
              cx: '24', cy: '24', r: '16',
              fill: 'none', stroke: 'rgba(255,182,72,0.15)', strokeWidth: '0.8',
              strokeLinecap: 'round', strokeDasharray: '6 95',
              style: { transformOrigin: '24px 24px', animation: 'ljSpin 17s linear infinite' }
            }),
            // radiator fan: 70 hairline lines on the inside edge of the outer
            // ring band, pointing inward — tips stop at the inner of the two
            // dashed orbits BEFORE the deepest one (tips at r≈16.2), so the
            // dash ring at 15.8 rides at the teeth's edge and the deeper
            // orbits stay clear. Fan brightened with the ver-1.3 pass (0.21).
            jsx('g', {
              opacity: '0.21',
              children: Array.from({ length: 70 }, (_, i) =>
                jsx('line', {
                  x1: (24 + Math.cos((i / 70) * Math.PI * 2) * 20.2).toFixed(2),
                  y1: (24 + Math.sin((i / 70) * Math.PI * 2) * 20.2).toFixed(2),
                  x2: (24 + Math.cos((i / 70) * Math.PI * 2) * 16.2).toFixed(2),
                  y2: (24 + Math.sin((i / 70) * Math.PI * 2) * 16.2).toFixed(2),
                  stroke: LARS_STYLE.cyan, strokeWidth: '0.35'
                }, 'f' + i))
            }),
            // state halos: green (user) / violet (Lars) — start AT the core ring
            // and fade out to the first orbiting dot-ring (r=12.6).
            // Opacity 0 idle — driven live by the pulse loop below.
            jsx('circle', { id: 'ljHaloU', cx: '24', cy: '24', r: '12.6', fill: 'url(#ljCoreGg)', opacity: '0' }),
            jsx('circle', { id: 'ljHaloL', cx: '24', cy: '24', r: '12.6', fill: 'url(#ljCoreGv)', opacity: '0' }),
            // solid core disc — cyan @ brightened 0.21, pulsing via scale; +30%
            jsx('circle', { id: 'ljCore', cx: '24', cy: '24', r: '7.0',
              fill: LARS_STYLE.cyan, fillOpacity: '0.21' })
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
            color: 'rgba(232,251,255,0.44)',
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
                jsx('path', { d: 'M4 12a8 8 0 0 1 13.6-5.7M20 12a8 8 0 0 1-13.6 5.7', stroke: LARS_STYLE.cyan, strokeWidth: '1.6', fill: 'none', strokeLinecap: 'round' }),
                jsx('path', { d: 'M18 3v4h-4M6 21v-4h4', stroke: LARS_STYLE.cyan, strokeWidth: '1.6', fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' })
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
// ═══ 10. TITLEBAR UTILITIES — chip strip (/stats poll every 5 s) ═══
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
      border: `1px solid ${LARS_STYLE.edge}`,
      background: 'rgba(2,7,12,0.55)'
    },
    children: [
      jsx('span', { style: { color: LARS_STYLE.dim }, children: label }),
      jsx('span', { style: { color: LARS_STYLE.cyan, textShadow: `0 0 5px ${LARS_STYLE.cyan}` }, children: value })
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
      fontFamily: LARS_STYLE.narrow,
      fontSize: '9px',
      color: LARS_STYLE.mut,
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
          jsx('span', { style: { color: LARS_STYLE.dim, fontSize: '9px', marginRight: '3px' }, children: 'Resources:' }),
          ...resourceChips
        ]
      })
    ]
  })
}

// ═══ 11. DIV PAGES — shared page chrome (LarsPage) ═══
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
        // Utility-chip recipe: cyan text + soft glow; active Div = full glow
        fontFamily: LARS_STYLE.disp,
        color: LARS_STYLE.cyan,
        textShadow: `0 0 5px ${LARS_STYLE.cyan}`,
        opacity: d.path === activePath ? 1 : 0.65,
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
        // LARS_STYLE scheme: display font + Utility-cyan glowing label
        fontFamily: LARS_STYLE.disp,
        color: LARS_STYLE.cyan,
        textShadow: `0 0 5px ${LARS_STYLE.cyan}`,
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
    children: [LogoMark(false)]
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
            jsx('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' }, children: [LogoMark(true)] })
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

// ═══ 12. PLUGIN EXPORT — registration manifest ═══
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
