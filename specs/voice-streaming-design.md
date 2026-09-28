# Voice streaming + barge-in design (research, 2026-09-28)

Sub-agent research, grounded in voice/ + plugin.js + jarvis_ai (Fred AI). Implementation plan.

## Core finding
The :8000 server ALREADY implements the whole continuous pipeline (binary PCM intake,
silero VAD, streaming zipformer partials, endpointing, bridge delta streaming,
per-sentence pocket-TTS, barge-in mechanics). The gap is entirely in the page: plugin.js
buffers locally + batch whisper + 'typed'. Fix = make the page a dumb mic.

## Target loop
mic ON → every Int16 frame ws.send(binary) to :8000 (never queue; drop if CONNECTING)
  HOT_MIC: KWS 'hey lars' → LISTENING (mic-ON continuous mode may bypass HOT_MIC entirely)
  LISTENING: Turn.feed → resample → VAD → buf(+raw int16 for whisper) → partials every 300ms
             → TURN_SILENCE_S (2.0s, Fred pattern) silence → finish()
  finish(): sherpa finalize + HYBRID whisper re-transcribe of full turn buffer (2.5s budget,
            whisper text preferred) → run_agent → deltas → per-sentence TTS → PCM out
  SPEAKING: mic PCM keeps flowing → VAD; sustained speech ≥ BARGE_MIN_SPEECH_MS (200ms)
            → barge_in() → LISTENING with pre-barge audio seeded into new turn
  done → reset Turn (new VAD/stt_stream/buf) + {state:'listening'} → loop continues

## Barge-in sequence
1. page keeps streaming PCM during SPEAKING (this is what makes barge-in possible)
2. server: sustained-speech gate (echo guard) → Turn.barge_in():
   tts_stop.set() (cancels pocket-tts generator) + session.interrupt JSON-RPC
   + reset turn state + seed buf w/ pre-barge audio
3. server → page: {event:'interrupted'} then {state:'listening'}
4. page onFrame: 'interrupted' → L.bargeIn(): stop all L.srcs, clear, L.nextAt=0
   (must zero nextAt AND stop srcs — future-scheduled chunks)
5. user's speech (already flowing + seeded) feeds new turn; 2s silence → reply

## STT recommendation: HYBRID
- sherpa streaming zipformer: loop + live partials (required, already wired)
- faster-whisper: re-transcribe full turn buffer server-side before submit (accuracy),
  speculative start at 1s-silence, cancel if speech resumes; fallback to zipformer on
  timeout/empty. Latency ≈ 3–5s to first audio (Fred benchmark ~4s).

## Key changes
- plugin.js: start() calls ensureWs + startCapture; onPcm → ws.send(binary) only (delete
  buf/RMS-VAD/submit/transcribe path); bargeIn on 'interrupted'; render user partials;
  declare real sample rate via audio_format.
- voice_server.py: run_agent finally → reset Turn + send {state:'listening'} (CONTINUOUS);
  endpoint on TURN_SILENCE_S=2.0 (keep VAD min_silence 0.6); heard_speech guard;
  sustained-speech barge gate + pre-barge buffer; whisper hybrid in finish(); turn-id to
  kill stale finish tasks.
- config.py: TURN_SILENCE_S=2.0, BARGE_MIN_SPEECH_MS=200, HYBRID_STT, WHISPER_URL.

## Risks
1. TTS echo → self-barge-in loop: AEC constraint already on; sustained-speech gate;
   optional higher VAD threshold in speaking branch; measure with existing RMS logs.
2. Keep VAD min_silence 0.6 (else 2s timer never starts); mid-sentence pause >2s truncates.
3. Linear resample lossy for whisper — consider soxr for whisper copy.
4. Mic-ON bypasses wake word; KWS = hands-free resume path only; no score gate on KWS.
5. Stale finish tasks: add turn generation id.
6. Hybrid whisper HTTP dependency: never fail the turn on it.

# Session co-existence design ("open somewhere else") (research, 2026-09-28)

## Mechanism (from Hermes source)
Lease registry: hermes_cli/active_sessions.py, identity (pid, live_session_id). Claimed
LAZILY on first prompt turn (tui_gateway/prompt_turn.py:124), NOT released at end-of-turn —
only at session finalize/close/reap (session_lifecycle.py:353-367). session.resume does NOT
lock. UI error = SESSION_NOT_OWNED (apps/desktop/src/i18n/en.ts:5129). No takeover/force API.

## Fix: ATTACH-PER-TURN (small, plugin-only)
- agent_bridge: after each completed turn → session.close {session_id} (lease released
  instantly; stored row stays resumable); resume {lazy:true} on next voice turn (~0.2s).
- Keep persistent :9119 WS (lock is lease-layer, not WS).
- Safety net: resume with close_on_disconnect:true (crash → reap releases).
- Voice submit refused (SESSION_NOT_OWNED) → UI is active: yield/queue + spoken cue.
- Remote clients later: same pattern to submit; session.activate + session.events.since
  for lock-free observation.
