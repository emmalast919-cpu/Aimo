const express = require('express');
const https   = require('https');
const http    = require('http');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 5000;
app.use(express.json());

const OWNER_PASS      = 'Aimo@7392';
const LAVALINK_HOST   = 'lava-v4.ajieblogs.eu.org';
const LAVALINK_PORT   = 443;
const LAVALINK_PASS   = 'https://dsc.gg/ajidevserver';
const LAVALINK_SECURE = true;

// ── In-memory service states (no file, no localStorage) ───────
let serviceStates = {
  bot: 'auto', lavalink: 'auto', commands: 'auto',
  playlists: 'auto', spotify: 'auto', ai: 'auto',
  website: 'operational', support: 'operational',
  maintenance: false, announcement: ''
};

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
  const payload = JSON.stringify({ lavalink: lvCache, states: serviceStates });
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
  res.write(`data: ${JSON.stringify({ lavalink: lvCache, states: serviceStates })}\n\n`);
  req.on('close', () => sseClients.delete(res));
});

// ── API ───────────────────────────────────────────────────────
app.get('/api/status', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ lavalink: lvCache, states: serviceStates });
});

app.get('/api/lavalink-stats', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(lvCache);
});

app.get('/api/service-states', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(serviceStates);
});

app.post('/api/service-states', (req, res) => {
  const { password, states } = req.body || {};
  if (password !== OWNER_PASS) return res.status(401).json({ error: 'Wrong password' });
  if (!states || typeof states !== 'object') return res.status(400).json({ error: 'Invalid' });

  const svcKeys = ['bot','lavalink','commands','playlists','spotify','ai','website','support'];
  for (const k of svcKeys) {
    if (states[k] !== undefined && ['auto','operational','outage','degraded'].includes(states[k]))
      serviceStates[k] = states[k];
  }
  if (typeof states.maintenance === 'boolean') serviceStates.maintenance = states.maintenance;
  if (typeof states.announcement === 'string') serviceStates.announcement = states.announcement.slice(0, 300);

  broadcast();
  res.json({ ok: true, states: serviceStates });
});

app.post('/api/verify', (req, res) => {
  const { password } = req.body || {};
  res.status(password === OWNER_PASS ? 200 : 401).json(password === OWNER_PASS ? { ok: true } : { error: 'Wrong password' });
});

// ── Status page — inject current state into HTML ──────────────
app.get('/status', (req, res) => {
  const html = fs.readFileSync(path.join(__dirname, 'status.html'), 'utf8');
  const init = JSON.stringify({ lavalink: lvCache, states: serviceStates });
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
app.get('/',         (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`Aimo website running on port ${PORT}`));
