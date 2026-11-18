// Shared film machinery for the Node explainers (make_foundry.js, make_code.js): narration (Kokoro, cached), the
// director (cursor, clicks, typing, zoom, cards through overlay.js), CDP screencast capture, the sound design ported
// from make_video.py (clicks, keys, whooshes, ambient bed, voice ducking), captions and the ffmpeg encode.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const RATE = 48000;

function createKit({ name, lines, vo, work, out, view = { width: 1600, height: 900 }, dsf = 1.2, filming = true }) {
  const FILM = __dirname;
  const engine = process.env.FILM_VOICE === 'windows' ? 'windows' : 'kokoro';
  const voiceSig = engine === 'kokoro' ? `kokoro:${process.env.KOKORO_VOICE || 'af_heart'}:${process.env.KOKORO_SPEED || '1.0'}` : 'Microsoft Mark';

  // ---------------------------------------------------------------- narration
  function wavInfo(file) {
    const b = fs.readFileSync(file);
    let o = 12; let fmt = null; let data = null;
    while (o < b.length - 8) {
      const id = b.toString('ascii', o, o + 4); const size = b.readUInt32LE(o + 4);
      if (id === 'fmt ') fmt = { channels: b.readUInt16LE(o + 10), rate: b.readUInt32LE(o + 12), bits: b.readUInt16LE(o + 22) };
      if (id === 'data') data = { start: o + 8, size };
      o += 8 + size + (size % 2);
    }
    return { ...fmt, data, buf: b, seconds: data.size / (fmt.rate * fmt.channels * fmt.bits / 8) };
  }

  function makeVoice() {
    fs.mkdirSync(vo, { recursive: true });
    fs.mkdirSync(work, { recursive: true });
    const book = path.join(vo, 'made.json');
    const made = fs.existsSync(book) ? JSON.parse(fs.readFileSync(book, 'utf8')) : {};
    const todo = [];
    for (const [key, [spoken]] of Object.entries(lines)) {
      const sig = crypto.createHash('sha1').update(`${voiceSig}|${spoken}`).digest('hex');
      if (made[key] !== sig || !fs.existsSync(path.join(vo, `${key}.wav`))) todo.push({ key, spoken, sig });
    }
    if (todo.length) {
      const jobs = path.join(work, 'voice-jobs.json');
      fs.writeFileSync(jobs, JSON.stringify(todo.map((t) => ({ text: t.spoken, out: path.join(vo, `${t.key}.wav`) }))));
      if (engine === 'kokoro') {
        const py = process.env.KOKORO_PYTHON || (process.platform === 'win32' ? 'python.exe' : 'python3');
        execFileSync(py, [path.join(FILM, 'kokoro_tts.py'), jobs], { stdio: 'inherit', windowsHide: true });
      } else {
        const ps = `Add-Type -AssemblyName System.Speech
$jobs = Get-Content -Raw -LiteralPath '${jobs.replace(/'/g, "''")}' | ConvertFrom-Json
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
try { $s.SelectVoice('Microsoft Mark') } catch { $s.SelectVoice('Microsoft David Desktop') }
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(48000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
foreach ($j in $jobs) { $s.SetOutputToWaveFile($j.out, $fmt); $s.Speak($j.text); $s.SetOutputToNull() }
$s.Dispose()`;
        execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'inherit', windowsHide: true });
      }
      for (const t of todo) made[t.key] = t.sig;
      fs.writeFileSync(book, JSON.stringify(made, null, 1));
    }
    return Object.fromEntries(Object.keys(lines).map((k) => [k, wavInfo(path.join(vo, `${k}.wav`)).seconds]));
  }

  // ---------------------------------------------------------------- director
  class Director {
    constructor(page, lengths) { this.page = page; this.lengths = lengths; this.events = []; this.voiceEnd = 0; }
    log(kind, extra = {}) { this.events.push({ t: Date.now() / 1000, kind, ...extra }); }
    async wait(s) { if (s > 0) await this.page.waitForTimeout(s * 1000); }
    async say(key) { if (!filming) return; await this.waitVoice(); this.log('voice', { id: key }); this.voiceEnd = Date.now() / 1000 + this.lengths[key]; }
    async waitVoice(pad = 0.25) { if (filming) await this.wait(this.voiceEnd - Date.now() / 1000 + pad); }
    /** Seconds left in the current narration line (to pace actions across it). */
    voiceLeft() { return Math.max(0, this.voiceEnd - Date.now() / 1000); }
    js(fn, arg) { return this.page.evaluate(fn, arg); }
    async center(target) {
      const loc = typeof target === 'string' ? this.page.locator(target).first() : target;
      await loc.waitFor({ state: 'visible', timeout: 60000 });
      let box = await loc.boundingBox();
      if (box.y < 0 || box.y + box.height > view.height) {
        await loc.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        await this.wait(filming ? 0.9 : 0.3);
        box = await loc.boundingBox();
      }
      return { loc, x: box.x + box.width / 2, y: box.y + box.height / 2 };
    }
    async hover(target, ms = 750) { const { x, y } = await this.center(target); await this.js(([a, b, m]) => window.Film.moveTo(a, b, m), [x, y, filming ? ms : 50]); await this.page.mouse.move(x, y); await this.wait(filming ? ms / 1000 : 0.05); }
    async click(target, ms = 750, after = 0.4) {
      const { x, y } = await this.center(target);
      await this.js(([a, b, m]) => window.Film.moveTo(a, b, m), [x, y, filming ? ms : 50]);
      await this.wait(filming ? ms / 1000 : 0.05);
      await this.js(() => window.Film.press());
      this.log('click');
      await this.page.mouse.click(x, y);
      await this.wait(filming ? after : 0.3);
    }
    async type(text, delay = 0.034) { for (const ch of text) { await this.page.keyboard.type(ch); this.log('key'); if (filming) await this.wait(delay + Math.random() * 0.03 - 0.01); } }
    async zoom(selector, scale = 1.5, ms = 1100, pad = 0) {
      if (!filming) return;
      await this.js(([sel, s, m, p]) => { const el = document.querySelector(sel); if (!el) return; const r = window.Film.layoutRect(el); window.Film.zoom({ x: r.x - p, y: r.y - p, width: r.width + p * 2, height: r.height + p * 2 }, s, m); }, [selector, scale, ms, pad]);
      this.log('whoosh', { soft: true });
      await this.wait(ms / 1000);
    }
    async unzoom(ms = 900) { if (!filming) return; await this.js((m) => window.Film.unzoom(m), ms); this.log('whoosh', { soft: true }); await this.wait(ms / 1000); }
    async reveal(selector, block = 'center', wait = 0.9) { await this.js(([s, b]) => { const el = document.querySelector(s); if (el) el.scrollIntoView({ behavior: 'smooth', block: b }); }, [selector, block]); await this.wait(filming ? wait : 0.2); }
    async card(html, hold = 0) { await this.js((h) => window.Film.card(h, {}), html); this.log('whoosh'); await this.wait(hold); }
    async uncard(ms = 800) { await this.js((m) => window.Film.uncard(m), ms); this.log('whoosh', { soft: true }); await this.wait(ms / 1000); }
    async third(html = null) { await this.js((h) => window.Film.third(h), html); }
  }

  // ---------------------------------------------------------------- capture
  class Capture {
    constructor(page, cdp) {
      this.page = page; this.cdp = cdp; this.dir = path.join(work, 'frames');
      fs.rmSync(this.dir, { recursive: true, force: true }); fs.mkdirSync(this.dir, { recursive: true });
      this.frames = []; this.on = true;
      cdp.on('Page.screencastFrame', (f) => {
        if (!this.on) return;
        const p = path.join(this.dir, `${String(this.frames.length).padStart(6, '0')}.jpg`);
        fs.writeFileSync(p, Buffer.from(f.data, 'base64'));
        this.frames.push([p, f.metadata.timestamp]);
        cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
      });
    }
    start() { return this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: Math.round(view.width * dsf), maxHeight: Math.round(view.height * dsf), everyNthFrame: 1 }); }
    async stop() { await this.page.waitForTimeout(300); await this.cdp.send('Page.stopScreencast'); this.on = false; }
  }

  // ---------------------------------------------------------------- sound (ported from make_video.py)
  function rng(seed) { let s = seed >>> 0; const u = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); return { u, n: () => { const a = Math.max(u(), 1e-9); return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * u()); } }; }
  function clickSound(r) { const n = Math.round(0.06 * RATE); const o = new Float32Array(n); let prev = 0; for (let i = 0; i < n; i++) { const t = i / RATE; const x = r.n() * Math.exp(-t * 900) * 0.9; o[i] = (x - prev) + Math.sin(2 * Math.PI * 180 * t) * Math.exp(-t * 90) * 0.35; prev = x; } return o; }
  function keySound(r) { const n = Math.round(0.03 * RATE); const o = new Float32Array(n); let prev = 0; const g = 0.18 + r.u() * 0.12; for (let i = 0; i < n; i++) { const x = r.n(); o[i] = (x - prev) * Math.exp(-(i / RATE) * 1400) * g; prev = x; } return o; }
  function whoosh(r, soft) { const n = Math.round((soft ? 0.45 : 0.8) * RATE); const acc = new Float64Array(n); let s = 0; for (let i = 0; i < n; i++) { s += r.n(); acc[i] = s; } const o = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / (n - 1); const w = Math.round(40 - 34 * Math.sin(Math.PI * t)); const lo = Math.max(0, i - w); o[i] = ((acc[i] - acc[lo]) / (i - lo + 1)) * Math.sin(Math.PI * t) ** 2 * (soft ? 0.5 : 0.9); } return o; }
  function music(seconds, r) {
    const n = Math.round(seconds * RATE); const bed = new Float32Array(n);
    const chords = [[57, 60, 64, 67, 71], [53, 57, 60, 64, 67], [48, 52, 55, 59, 62], [55, 59, 62, 66, 69]];
    const bar = 4 * 60 / 96 * 2; const hz = (m) => 440 * 2 ** ((m - 69) / 12); const step = 60 / 96 / 2;
    for (let k = 0; k <= seconds / bar; k++) {
      const notes = chords[k % 4]; const s0 = Math.round(k * bar * RATE); const s1 = Math.min(n, Math.round(((k + 1) * bar + 1.5) * RATE)); if (s0 >= n) break;
      for (let i = s0; i < s1; i++) { const tt = (i - s0) / RATE; const env = Math.min(1, tt / 1.6) * Math.min(1, Math.max(0, (bar + 1.5 - tt) / 1.5)); let v = 0.03 * env * Math.sin(2 * Math.PI * hz(notes[0] - 12) * tt); for (const m of notes) for (const det of [-0.08, 0.08]) v += 0.022 * env * Math.sin(2 * Math.PI * hz(m) * (1 + det / 100) * tt); bed[i] += v; }
      for (let j = 0; j < Math.floor(bar / step); j++) { const a0 = s0 + Math.round(j * step * RATE); const a1 = Math.min(n, a0 + Math.round(0.9 * RATE)); if (a0 >= n) break; const m = notes[[0, 2, 4, 3, 1, 3, 4, 2][j % 8]] + 12; const g = 0.6 + 0.4 * r.u(); for (let i = a0; i < a1; i++) { const ta = (i - a0) / RATE; bed[i] += 0.018 * Math.exp(-ta * 5) * Math.sin(2 * Math.PI * hz(m) * ta) * g; } }
    }
    for (let i = 0; i < n; i++) { const t = i / RATE; bed[i] *= Math.max(0, Math.min(1, t / 2.5, (seconds - t) / 3.5)); }
    return bed;
  }
  function readVoice(key) {
    const w = wavInfo(path.join(vo, `${key}.wav`)); const n = w.data.size / 2 / w.channels; const o = new Float32Array(Math.round(n * RATE / w.rate));
    const sample = (i) => w.buf.readInt16LE(w.data.start + i * 2 * w.channels) / 32768;
    for (let i = 0; i < o.length; i++) { const x = i * w.rate / RATE; const i0 = Math.floor(x); o[i] = sample(Math.min(i0, n - 1)) * (1 - (x - i0)) + sample(Math.min(i0 + 1, n - 1)) * (x - i0); }
    return o;
  }
  function buildAudio(events, start, seconds, file) {
    const r = rng(7); const n = Math.round(seconds * RATE) + RATE; const voice = new Float32Array(n); const fx = new Float32Array(n); const cues = [];
    const put = (track, at, clip, gain = 1) => { for (let i = 0; i < clip.length && at + i < n; i++) track[at + i] += clip[i] * gain; };
    for (const e of events) {
      const at = Math.round((e.t - start) * RATE); if (at < 0 || at >= n) continue;
      if (e.kind === 'voice') { const a = readVoice(e.id); put(voice, at, a); cues.push([e.t - start, e.t - start + a.length / RATE, lines[e.id][1]]); }
      else if (e.kind === 'click') put(fx, at, clickSound(r), 0.55);
      else if (e.kind === 'key') put(fx, at, keySound(r), 0.5);
      else if (e.kind === 'whoosh') put(fx, at, whoosh(r, e.soft), e.soft ? 0.16 : 0.26);
    }
    const bed = music(n / RATE, r); const k = Math.round(0.25 * RATE); let acc = 0; const env = new Float32Array(n);
    for (let i = 0; i < n; i++) { acc += Math.abs(voice[i]); if (i >= k) acc -= Math.abs(voice[i - k]); env[i] = acc / k; }
    const pcm = Buffer.alloc(44 + n * 4);
    pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + n * 4, 4); pcm.write('WAVEfmt ', 8); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(2, 22); pcm.writeUInt32LE(RATE, 24); pcm.writeUInt32LE(RATE * 4, 28); pcm.writeUInt16LE(4, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(n * 4, 40);
    for (let i = 0; i < n; i++) { const duck = 1 - 0.55 * Math.min(1, Math.max(0, env[Math.min(i + (k >> 1), n - 1)] * 25)); const v = Math.max(-1, Math.min(1, voice[i] * 1.15 + fx[i] + (bed[i] || 0) * duck * 0.9)); const s = Math.round(v * 32767); pcm.writeInt16LE(s, 44 + i * 4); pcm.writeInt16LE(s, 46 + i * 4); }
    fs.writeFileSync(file, pcm);
    return cues;
  }
  function writeSrt(cues, file) {
    const stamp = (s) => { const ms = Math.round(s * 1000); const p = (v, w = 2) => String(v).padStart(w, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
    const outLines = []; let i = 0;
    for (const [a, b, text] of cues) {
      const parts = text.split(/(?<=[.?!])\s+/).filter(Boolean); const total = parts.reduce((s, p) => s + p.length, 0); let at = a;
      for (const p of parts) { const end = at + (b - a) * p.length / total; i += 1; outLines.push(String(i), `${stamp(at)} --> ${stamp(end)}`, p, ''); at = end; }
    }
    fs.writeFileSync(file, outLines.join('\n'), 'utf8');
  }

  // ---------------------------------------------------------------- edit and encode
  function ffmpegPath() {
    if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) return process.env.FFMPEG_PATH;
    try { return execFileSync(process.platform === 'win32' ? 'where.exe' : 'which', ['ffmpeg'], { encoding: 'utf8' }).split(/\r?\n/)[0].trim(); } catch { /* not on PATH */ }
    throw new Error('Set FFMPEG_PATH to a full ffmpeg (e.g. from the imageio-ffmpeg Python package).');
  }
  function trimDeadAir(frames, events, longest = 3.0) {
    const voices = events.filter((e) => e.kind === 'voice').map((e) => [e.t, e.t + wavInfo(path.join(vo, `${e.id}.wav`)).seconds]);
    const cuts = [];
    for (let i = 0; i + 1 < frames.length; i++) {
      const a = frames[i][1]; const b = frames[i + 1][1]; if (b - a <= longest) continue;
      const talking = Math.max(a, ...voices.filter(([v0, v1]) => v0 < b && v1 > a).map(([, v1]) => v1));
      const keep = Math.max(longest, talking - a + 0.6); if (b - a > keep + 0.5) cuts.push([a + keep, b - a - keep]);
    }
    if (!cuts.length) return [frames, events];
    const shift = (t) => t - cuts.filter(([at, n]) => t >= at + n).reduce((s, [, n]) => s + n, 0) - cuts.filter(([at, n]) => at <= t && t < at + n).reduce((s, [at]) => s + (t - at), 0);
    console.log('trimmed dead air:', cuts.map(([, n]) => `${n.toFixed(1)}s`).join(', '));
    return [frames.map(([f, t]) => [f, shift(t)]), events.map((e) => ({ ...e, t: shift(e.t) }))];
  }
  function finish(capFrames, rawEvents, { stills = false, thumbAt = 0.42 } = {}) {
    const ffmpeg = ffmpegPath();
    fs.mkdirSync(out, { recursive: true });
    let frames = [...capFrames].sort((a, b) => a[1] - b[1]);
    fs.writeFileSync(path.join(work, 'events.json'), JSON.stringify({ events: rawEvents, frame_list: frames }, null, 1));
    let events; [frames, events] = trimDeadAir(frames, rawEvents);
    const start = frames[0][1]; const end = Math.max(frames[frames.length - 1][1], ...events.map((e) => e.t)) + 0.5; const seconds = end - start;
    console.log(`frames ${frames.length} over ${seconds.toFixed(1)}s (${(frames.length / seconds).toFixed(1)} fps captured)`);
    if (stills) {
      const picks = Array.from({ length: 24 }, (_, i) => frames[Math.floor(i * (frames.length - 1) / 23)][0]);
      const grid = `${picks.map((_, i) => `[${i}:v]scale=480:270[s${i}];`).join('')}${picks.map((_, i) => `[s${i}]`).join('')}xstack=inputs=24:layout=${picks.map((_, i) => `${(i % 6) * 480}_${Math.floor(i / 6) * 270}`).join('|')}`;
      execFileSync(ffmpeg, ['-y', '-loglevel', 'error', ...picks.flatMap((f) => ['-i', f]), '-filter_complex', grid, path.join(out, `${name}-contact-sheet.jpg`)]);
      console.log('wrote', path.join(out, `${name}-contact-sheet.jpg`)); return;
    }
    const listing = path.join(work, 'frames.txt');
    fs.writeFileSync(listing, frames.map(([f, t], i) => `file '${f.replace(/\\/g, '/')}'\nduration ${Math.max(0.001, (i + 1 < frames.length ? frames[i + 1][1] : end) - t).toFixed(4)}\n`).join('') + `file '${frames[frames.length - 1][0].replace(/\\/g, '/')}'\n`);
    const wav = path.join(work, 'mix.wav');
    const cues = buildAudio(events, start, seconds, wav);
    const srt = path.join(out, `${name}.srt`);
    writeSrt(cues, srt);
    const mp4 = path.join(out, `${name}.mp4`);
    execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listing, '-i', wav,
      '-vf', 'fps=30,scale=1920:1080:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
      '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-movflags', '+faststart', '-shortest', mp4], { stdio: 'inherit' });
    execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', frames[Math.floor(frames.length * thumbAt)][0], '-vf', 'scale=1280:720', path.join(out, `${name}-thumbnail.jpg`)]);
    console.log('wrote', mp4, '\nwrote', srt);
    return { mp4, srt, cues };
  }

  return { makeVoice, Director, Capture, finish, wavInfo };
}

module.exports = { createKit };
