const express = require('express');
const https   = require('https');
const http    = require('http');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 5000;
app.use(express.json());

const OWNER_PASS      = 'Aimo@7392';
const CLIENT_ID       = '1466757680311042060';
const LAVALINK_HOST   = 'lava-v4.ajieblogs.eu.org';
const LAVALINK_PORT   = 443;
const LAVALINK_PASS   = 'https://dsc.gg/ajidevserver';
const LAVALINK_SECURE = true;

const STATES_FILE = path.join(__dirname, 'service-states.json');
const DEFAULT_STATES = {
  bot: 'operational', lavalink: 'operational', commands: 'operational',
  playlists: 'operational', spotify: 'operational', ai: 'operational',
  website: 'operational', support: 'operational',
  maintenance: false, announcement: '', apkUrl: ''
};

function loadStates() {
  try {
    if (fs.existsSync(STATES_FILE))
      return { ...DEFAULT_STATES, ...JSON.parse(fs.readFileSync(STATES_FILE, 'utf8')) };
  } catch {}
  return { ...DEFAULT_STATES };
}
function saveStates(s) {
  try { fs.writeFileSync(STATES_FILE, JSON.stringify(s, null, 2)); } catch {}
}

// ── Lavalink cache ────────────────────────────────────────────
let lvCache = { online: false, uptime: null, players: null, playingPlayers: null, lastCheck: 0 };

function lavalinkRequest(urlPath, ms = 7000) {
  return new Promise((resolve, reject) => {
    const lib = LAVALINK_SECURE ? https : http;
    const req = lib.request({
      hostname: LAVALINK_HOST, port: LAVALINK_PORT, path: urlPath,
      method: 'GET', headers: { Authorization: LAVALINK_PASS },
      timeout: ms, rejectUnauthorized: false
    }, res => {
      let d = '';
      res.on('data', c => { d += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: null }); }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    req.end();
  });
}

async function refreshLavalink() {
  try {
    const r = await lavalinkRequest('/v4/stats');
    if (r.status === 200 && r.body) {
      lvCache = {
        online: true,
        uptime: r.body.uptime ?? null,
        players: r.body.players ?? 0,
        playingPlayers: r.body.playingPlayers ?? 0,
        lastCheck: Date.now()
      };
    } else if (r.status === 401 || r.status === 403) {
      lvCache = { online: true, uptime: null, players: null, playingPlayers: null, lastCheck: Date.now() };
    } else {
      lvCache = { online: false, uptime: null, players: null, playingPlayers: null, lastCheck: Date.now() };
    }
  } catch {
    lvCache = { online: false, uptime: null, players: null, playingPlayers: null, lastCheck: Date.now() };
  }
  broadcast();
}

refreshLavalink();
setInterval(refreshLavalink, 30000);

// ── SSE broadcast ─────────────────────────────────────────────
const sseClients = new Set();

function broadcast() {
  if (sseClients.size === 0) return;
  const payload = JSON.stringify({ lavalink: lvCache, states: loadStates() });
  for (const res of sseClients) {
    try { res.write(`data: ${payload}\n\n`); } catch {}
  }
}

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();
  sseClients.add(res);
  const payload = JSON.stringify({ lavalink: lvCache, states: loadStates() });
  res.write(`data: ${payload}\n\n`);
  const keepAlive = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 25000);
  req.on('close', () => { sseClients.delete(res); clearInterval(keepAlive); });
});

// ── API ───────────────────────────────────────────────────────
app.get('/api/status', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ lavalink: lvCache, states: loadStates() });
});

app.get('/api/lavalink-stats', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(lvCache);
});

app.get('/api/service-states', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(loadStates());
});

const VALID_SVC_STATES = ['operational', 'degraded', 'outage'];

app.post('/api/service-states', (req, res) => {
  const { password, states } = req.body || {};
  if (password !== OWNER_PASS) return res.status(401).json({ error: 'Wrong password' });
  if (!states || typeof states !== 'object') return res.status(400).json({ error: 'Invalid' });
  const cur = loadStates();
  const svcKeys = ['bot','lavalink','commands','playlists','spotify','ai','website','support'];
  for (const k of svcKeys) {
    if (states[k] !== undefined && VALID_SVC_STATES.includes(states[k]))
      cur[k] = states[k];
  }
  if (typeof states.maintenance === 'boolean') cur.maintenance = states.maintenance;
  if (typeof states.announcement === 'string') cur.announcement = states.announcement.slice(0, 300);
  if (typeof states.apkUrl === 'string') cur.apkUrl = states.apkUrl.slice(0, 500);
  saveStates(cur);
  broadcast();
  res.json({ ok: true, states: cur });
});

app.post('/api/verify', (req, res) => {
  const { password } = req.body || {};
  res.status(password === OWNER_PASS ? 200 : 401).json(password === OWNER_PASS ? { ok: true } : { error: 'Wrong password' });
});

// ── Pages ─────────────────────────────────────────────────────
app.get('/status', (req, res) => {
  const html = fs.readFileSync(path.join(__dirname, 'status.html'), 'utf8');
  const init = JSON.stringify({ lavalink: lvCache, states: loadStates() });
  const injected = html.replace('/* __INITIAL_DATA__ */', `window.__INITIAL_DATA__ = ${init};`);
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Cache-Control', 'no-store');
  res.send(injected);
});

app.use(express.static(path.join(__dirname)));
app.get('/commands', (req, res) => res.sendFile(path.join(__dirname, 'commands.html')));
app.get('/privacy',  (req, res) => res.sendFile(path.join(__dirname, 'privacy.html')));
app.get('/terms',    (req, res) => res.sendFile(path.join(__dirname, 'terms.html')));
app.get('/owner',    (req, res) => res.sendFile(path.join(__dirname, 'owner.html')));
app.get('/docs',     (req, res) => res.sendFile(path.join(__dirname, 'docs.html')));
app.get('/',         (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`Aimo website running on port ${PORT}`));
