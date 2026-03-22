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
const STATES_FILE     = path.join(__dirname, 'service-status.json');

// ── Valid states — anything else becomes 'operational' ────────
const VALID = ['operational', 'degraded', 'outage'];
function sanitize(v) { return VALID.includes(v) ? v : 'operational'; }

const DEFAULTS = {
  bot: 'operational', lavalink: 'operational', commands: 'operational',
  playlists: 'operational', spotify: 'operational', ai: 'operational',
  website: 'operational', support: 'operational',
  maintenance: false, announcement: ''
};

function readStatesFile() {
  try {
    const raw = JSON.parse(fs.readFileSync(STATES_FILE, 'utf8'));
    return {
      bot:          sanitize(raw.bot),
      lavalink:     sanitize(raw.lavalink),
      commands:     sanitize(raw.commands),
      playlists:    sanitize(raw.playlists),
      spotify:      sanitize(raw.spotify),
      ai:           sanitize(raw.ai),
      website:      sanitize(raw.website),
      support:      sanitize(raw.support),
      maintenance:  raw.maintenance === true,
      announcement: typeof raw.announcement === 'string' ? raw.announcement.slice(0, 300) : ''
    };
  } catch {
    return { ...DEFAULTS };
  }
}

// Load initial state from file
let serviceStates = readStatesFile();

// ── Watch service-status.json for changes ─────────────────────
// When you edit & save the file, all status pages update instantly
fs.watch(STATES_FILE, { persistent: false }, (eventType) => {
  if (eventType === 'change') {
    setTimeout(() => {
      serviceStates = readStatesFile();
      console.log('[service-status.json] File changed — broadcasting update');
      broadcast();
    }, 150); // small delay so file write is fully flushed
  }
});

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
      lvCache = { online: true, uptime: r.body.uptime ?? null, players: r.body.players ?? 0, playingPlayers: r.body.playingPlayers ?? 0, lastCheck: Date.now() };
    } else if (r.status === 401 || r.status === 403) {
      lvCache = { online: true, uptime: null, players: null, playingPlayers: null, lastCheck: Date.now() };
    } else {
      lvCache = { online: false, uptime: null, players: null, playingPlayers: null, lastCheck: Date.now() };
    }
  } catch {
    lvCache = { online: false, uptime: null, players: null, playingPlayers: null, lastCheck: Date.now() };
  }
}

refreshLavalink();
setInterval(refreshLavalink, 30000);

// ── SSE — push updates to all open status pages instantly ─────
const sseClients = new Set();

function broadcast() {
  if (sseClients.size === 0) return;
  const payload = JSON.stringify(serviceStates);
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
  res.write(`data: ${JSON.stringify(serviceStates)}\n\n`);
  req.on('close', () => sseClients.delete(res));
});

// ── /service-status.json — reads from file every request ──────
// This means editing the file always returns fresh data
app.get('/service-status.json', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(readStatesFile());
});

// ── Other API endpoints ───────────────────────────────────────
app.get('/api/status', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(serviceStates);
});

app.get('/api/lavalink-stats', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(lvCache);
});

// ── Save directly to service-status.json (owner only) ────────
app.post('/api/save-status', (req, res) => {
  const { password, states } = req.body || {};
  if (password !== OWNER_PASS) return res.status(401).json({ error: 'Wrong password' });
  if (!states || typeof states !== 'object') return res.status(400).json({ error: 'Invalid payload' });

  const svcKeys = ['bot','lavalink','commands','playlists','spotify','ai','website','support'];
  const payload = {};
  for (const k of svcKeys) payload[k] = sanitize(states[k]);
  payload.maintenance  = states.maintenance === true;
  payload.announcement = typeof states.announcement === 'string' ? states.announcement.slice(0, 300) : '';

  try {
    fs.writeFileSync(STATES_FILE, JSON.stringify(payload, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Could not write file: ' + e.message });
  }
});

// ── Static files + routes ─────────────────────────────────────
app.use(express.static(path.join(__dirname)));
app.get('/status',   (req, res) => res.sendFile(path.join(__dirname, 'status.html')));
app.get('/commands', (req, res) => res.sendFile(path.join(__dirname, 'commands.html')));
app.get('/privacy',  (req, res) => res.sendFile(path.join(__dirname, 'privacy.html')));
app.get('/terms',    (req, res) => res.sendFile(path.join(__dirname, 'terms.html')));
app.get('/owner',    (req, res) => res.sendFile(path.join(__dirname, 'owner.html')));
app.get('/',         (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`Aimo website running on port ${PORT}`));
