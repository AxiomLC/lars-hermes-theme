// voice2 server — Lars 2.0 voice agent backend.
// Evolved from Test3-Voice-AI-Pocket server.js: same invariants (thin non-buffering
// passthrough, abort-on-disconnect), plus:
//   * per-boot token auth on /api/* (LARS_VOICE_TOKEN; page sends Authorization: Bearer)
//   * HERMES HOOK: LLM_MODE=hermes -> multiplex gateway Sessions API on :8642/p/lars2,
//     translating Hermes SSE (assistant.delta etc.) into OpenAI-style data: frames
//   * LLM_MODE=cerebras -> direct Cerebras streaming (A/B latency leg)
//   * raw Hermes frames appended to logs/voice2-frames.log (Phase 1 fixture)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const E = process.env;
const PORT = +E.PORT || 1122;
const TTS_URL = E.TTS_URL || 'http://127.0.0.1:8001/tts';
const TTS_BASE = new URL(TTS_URL).origin;
const TOKEN = E.LARS_VOICE_TOKEN || '';
const LLM_MODE = (E.LLM_MODE || 'hermes').toLowerCase();          // hermes | cerebras
const HERMES_URL = (E.HERMES_URL || 'http://127.0.0.1:8642/p/lars2').replace(/\/+$/, '');
const HERMES_KEY = E.HERMES_KEY || '';
const CEREBRAS_KEY = (E.CEREBRAS_API_KEY || '').trim();
const CEREBRAS_MODEL = E.CEREBRAS_MODEL || 'gpt-oss-120b';
const HISTORY_TURNS = +(E.HISTORY_TURNS || 6);

const LOG_DIR = path.join(__dir, 'logs');
fs.mkdirSync(LOG_DIR, { recursive: true });
const FRAMES_LOG = path.join(LOG_DIR, 'voice2-frames.log');
const DIAG_LOG = path.join(LOG_DIR, 'lars-diag.log');
const MAX_LOG_BYTES = 300_000;                     // per file; prune keeps the TAIL
// Self-pruning append: when a file passes the cap, keep only the last half.
function appendLog(file, text) {
  try {
    fs.appendFileSync(file, text);
    const st = fs.statSync(file);
    if (st.size > MAX_LOG_BYTES) {
      const buf = fs.readFileSync(file);
      const tail = buf.subarray(Math.floor(buf.length / 2));
      const cut = tail.indexOf(10);                // start at the next full line
      fs.writeFileSync(file, cut >= 0 ? tail.subarray(cut + 1) : tail);
    }
  } catch {}
}
const logFrame = t => appendLog(FRAMES_LOG, t);
const logDiag = (src, msg) => {
  const line = `${new Date().toISOString()} [${src}] ${String(msg).slice(0, 500)}
`;
  appendLog(DIAG_LOG, line);
  try { console.log('[diag]', src, String(msg).slice(0, 160)); } catch {}
};

// ---- Hermes session cache (voice ⇄ same stored session; single source of truth) ----
const SESSION_CACHE = path.join(LOG_DIR, 'hermes-session.json');
let sessionId = null;
try { sessionId = JSON.parse(fs.readFileSync(SESSION_CACHE, 'utf8')).id; } catch {}

async function ensureSession() {
  if (sessionId) return sessionId;
  const res = await fetch(`${HERMES_URL}/api/sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${HERMES_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: `Voice — ${new Date().toISOString()}` }),
  });
  if (!res.ok) throw new Error(`session create ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  sessionId = j.session?.id || j.id || j.session_id || j.sessionId;
  if (!sessionId) throw new Error(`session create: no id in ${JSON.stringify(j).slice(0, 200)}`);
  try { fs.writeFileSync(SESSION_CACHE, JSON.stringify({ id: sessionId, at: Date.now() })); } catch {}
  console.log(`[hermes] session ${sessionId}`);
  return sessionId;
}

// ---- Pocket TTS: reuse it if it is already up, otherwise start it ----
let child;
const pocketIsUp = async () => {
  try { return (await fetch(TTS_BASE + '/health', { signal: AbortSignal.timeout(1500) })).ok; }
  catch { return false; }
};
(async () => {
  if (await pocketIsUp()) {
    console.log(`[pocket-tts] already running at ${TTS_BASE}, reusing it (it will NOT be stopped on exit)`);
    return;
  }
  if (!E.POCKET_CMD) {
    console.log(`[pocket-tts] not running at ${TTS_BASE} and POCKET_CMD is blank. Start it yourself.`);
    return;
  }
  child = spawn(E.POCKET_CMD, { shell: true, stdio: 'inherit' });
  child.on('exit', c => console.log(`[pocket-tts] exited (${c})`));
  console.log(`[pocket-tts] not running, started it: ${E.POCKET_CMD}`);
})();
const bye = () => {
  try {
    if (child && process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
    else child?.kill();
  } catch {}
  process.exit();
};
process.on('SIGINT', bye); process.on('SIGTERM', bye);

const readBody = req => new Promise(r => { let d = ''; req.on('data', c => d += c); req.on('end', () => r(d)); });
const sendJson = (res, code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };

// Bearer-token gate for /api/* (per-boot / pinned dev token; page passes it in headers).
function authorized(req) {
  if (!TOKEN) return true;                       // no token configured = open (dev only)
  const h = req.headers['authorization'] || '';
  return h === `Bearer ${TOKEN}`;
}

// Pipe an upstream fetch Response body to the client; abort upstream if the client goes away.
function pipeThrough(req, res, upstream, headers) {
  res.writeHead(200, { 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no', ...headers });
  const s = Readable.fromWeb(upstream.body);
  s.on('error', () => res.end());
  s.pipe(res);
}

// ---- HERMES HOOK core: Sessions-API SSE -> OpenAI-style SSE ----
// Hermes frames: ": keepalive" comments, "event: <name>" + "data: <json>" (or combined
// "data: {json}" where json carries the event name). We translate on the fly:
//   assistant.delta(t)      -> data: {"choices":[{"delta":{"content":t}}]}
//   tool.*                  -> event: tool  + data: {name, status}   (page shows status)
//   run.completed/failed/cancelled -> data: [DONE]
// The browser parser needs no changes: named "event: tool" lines aren't "data:" lines.
async function hermesChat(res, userText, ac) {
  const sid = await ensureSession();
  const upstream = await fetch(`${HERMES_URL}/api/sessions/${sid}/chat/stream`, {
    method: 'POST', signal: ac.signal,
    headers: {
      Authorization: `Bearer ${HERMES_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ input: userText }),
  });
  if (!upstream.ok || !upstream.body) {
    const t = await upstream.text().catch(() => '');
    logFrame(`\n==== ${new Date().toISOString()} upstream ${upstream.status} ====\n${t}\n`);
    throw Object.assign(new Error(`Hermes ${upstream.status}: ${t.slice(0, 300)}`), { status: upstream.status });
  }

  res.writeHead(200, { 'Cache-Control': 'no-cache', 'Content-Type': 'text/event-stream', 'X-Accel-Buffering': 'no' });
  const dec = new TextDecoder();
  let buf = '', wrote = false;
  const send = (o, ev) => {
    wrote = true;
    if (ev) res.write(`event: ${ev}\n`);
    res.write(`data: ${JSON.stringify(o)}\n\n`);
  };

  let evName = '';
  for await (const chunk of upstream.body) {         // does not buffer whole upstream
    buf += dec.decode(chunk, { stream: true });
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trimEnd();
      buf = buf.slice(nl + 1);
      logFrame(line + '\n');
      if (!line || line.startsWith(':')) continue;    // keepalive comment / blank
      if (line.startsWith('event:')) { evName = line.slice(6).trim(); continue; }
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') continue;
      let j;
      try { j = JSON.parse(payload); } catch { logFrame(`[unparsed] ${payload.slice(0, 300)}\n`); continue; }
      const type = evName || j.type || '';
      if (type === 'assistant.delta') {
        const t = j.delta?.content ?? j.text ?? j.delta ?? j.content ?? '';
        if (t) send({ choices: [{ delta: { content: t } }] });
      } else if (type.startsWith('tool.')) {
        send({ tool: j.tool || j.name || '', status: type, preview: (j.preview || j.args || '').toString().slice(0, 200) }, 'tool');
      } else if (type === 'run.completed') {
        send({ choices: [{ delta: {} }] }); res.write('data: [DONE]\n\n'); res.end();
        return;
      } else if (type === 'run.failed' || type === 'run.cancelled') {
        send({ choices: [{ delta: {} }] }); res.write('data: [DONE]\n\n'); res.end();
        return;
      } // assistant.commentary, reasoning etc. ignored
    }
  }
  if (!wrote) send({ choices: [{ delta: { content: '' } }] });
  res.write('data: [DONE]\n\n');
    res.end();
  res.end();
}

http.createServer(async (req, res) => {
  const ac = new AbortController();
  res.on('close', () => ac.abort());          // client disconnected -> cancel upstream work
  try {
    if (req.url.startsWith('/api/')) {
      if (!authorized(req)) { res.writeHead(401); return res.end('bad token'); }

      if (req.method === 'GET' && req.url === '/api/config') {
        let pocketUp = false;
        try { pocketUp = (await fetch(TTS_BASE + '/health', { signal: AbortSignal.timeout(800) })).ok; } catch {}
        let hermesUp = false;
        try { hermesUp = (await fetch('http://127.0.0.1:8642/health', { signal: AbortSignal.timeout(800) })).ok; } catch {}
        return sendJson(res, 200, {
          host: `${os.cpus()[0]?.model || '?'}, ${(os.totalmem() / 2 ** 30).toFixed(1)} GB RAM, node ${process.version}`,
          mode: LLM_MODE, model: LLM_MODE === 'hermes' ? 'lars2 (cerebras gpt-oss-120b)' : CEREBRAS_MODEL,
          hermesUrl: HERMES_URL, hermesUp, sessionId,
          ttsUrl: TTS_URL, voice: E.POCKET_VOICE || 'paul', pocketUp,
          tokenRequired: !!TOKEN,
        });
      }

      if (req.method === 'POST' && req.url === '/api/chat') {
        const { messages } = JSON.parse(await readBody(req));
        if (LLM_MODE === 'hermes') {
          // Sessions API carries its own session history profile-side: send only the latest user text.
          const lastUser = [...(messages || [])].reverse().find(m => m.role === 'user')?.content || '';
          if (!lastUser.trim()) return sendJson(res, 400, { error: 'no user text' });
          try { await hermesChat(res, lastUser, ac); }
          catch (e) {
            if (e.name === 'AbortError' || res.headersSent) return res.end();
            sendJson(res, e.status && e.status >= 400 ? e.status : 500, { error: e.message });
          }
          return;
        }
        // cerebras direct
        if (!CEREBRAS_KEY.startsWith('csk-')) return sendJson(res, 400, { error: 'Set CEREBRAS_API_KEY (csk-…) in .env' });
        const upstream = await fetch('https://api.cerebras.ai/v1/chat/completions', {
          method: 'POST', signal: ac.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CEREBRAS_KEY}` },
          body: JSON.stringify({
            model: CEREBRAS_MODEL, stream: true, reasoning_effort: 'low', max_tokens: 200,
            messages: [
              { role: 'system', content: E.SYSTEM_PROMPT || 'You are Lars, a voice assistant inside the Hermes desktop app. Your replies are spoken aloud. Answer in at most 3 short sentences, plain text only.' },
              ...messages.slice(-HISTORY_TURNS * 2),
            ],
          }),
        });
        if (!upstream.ok) return sendJson(res, upstream.status, { error: `Cerebras ${upstream.status}: ${(await upstream.text()).slice(0, 300)}` });
        return pipeThrough(req, res, upstream, { 'Content-Type': 'text/event-stream' });
      }

      if (req.method === 'POST' && req.url === '/api/tts') {
        const { text } = JSON.parse(await readBody(req));
        const form = new FormData();
        form.append('text', text);
        const upstream = await fetch(TTS_URL, { method: 'POST', body: form, signal: ac.signal });
        if (!upstream.ok) return sendJson(res, 502, { error: `Pocket TTS ${upstream.status}: ${(await upstream.text()).slice(0, 200)}` });
        return pipeThrough(req, res, upstream, { 'Content-Type': 'audio/wav' });
      }

      // Diagnostics: plugin page (and anything loopback+token'd) appends events.
      if (req.method === 'POST' && req.url === '/api/diag') {
        const b = await readBody(req);
        try {
          const j = JSON.parse(b);
          const items = Array.isArray(j) ? j : [j];
          for (const it of items) logDiag(it.src || 'page', it.msg || JSON.stringify(it).slice(0, 400));
        } catch { logDiag('raw', b.slice(0, 400)); }
        return sendJson(res, 200, { ok: true });
      }

      // HUD events pushed by the future lars_hud tool land here (Phase 4).
      if (req.method === 'POST' && req.url === '/hud') {
        // token + Origin check posture same as /api; body forwarded to the page as SSE in a later phase.
        return sendJson(res, 200, { ok: true });
      }

      // Agent-facing tail of the diag log.
      if (req.method === 'GET' && req.url === '/api/diag') {
        const tail = fs.existsSync(DIAG_LOG) ? fs.readFileSync(DIAG_LOG, 'utf8').split('\n').slice(-200).join('\n') : '';
        return sendJson(res, 200, { tail });
      }
      res.writeHead(404); return res.end('not found');
    }

    // ---- static ----
    const f = path.join(__dir, 'public', req.url === '/' ? 'index.html' : req.url.split('?')[0]);
    if (!f.startsWith(path.join(__dir, 'public')) || !fs.existsSync(f)) { res.writeHead(404); return res.end('not found'); }
    const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' }[path.extname(f)] || 'text/plain';
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
    fs.createReadStream(f).pipe(res);
  } catch (e) {
    if (e.name === 'AbortError' || res.headersSent) return res.end();
    const refused = /fetch failed|ECONNREFUSED/.test(String(e) + String(e.cause));
    sendJson(res, 500, { error: refused ? 'Upstream not reachable (gateway / Pocket TTS down?)' : e.message });
  }
}).listen(PORT, () => console.log(`lars voice2 → http://127.0.0.1:${PORT}  mode=${LLM_MODE} hermes=${HERMES_URL}`));
