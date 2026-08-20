/**
 * ScienceCare Academic Aid — Live Class Rig
 * Pure Node.js server. No npm install required.
 *
 * Roles served:
 *   /broadcaster  -> camera-only page (teacher/actor's device)
 *   /viewer       -> full platform UI (the "in-shot" phone)
 *   /admin        -> control panel (operator's device, not linked from anywhere)
 *
 * Run:  node server.js
 * Then on each device (same WiFi), open http://<laptop-local-ip>:8080/<role>
 * Find your laptop's local IP with `ipconfig` (Windows) or `ifconfig`/`ip a` (Mac/Linux).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = 8080;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const CONTENT_DIR = path.join(ROOT, 'content');
const ASSETS_DIR = path.join(ROOT, 'assets');

// ---------- In-memory state (resets when server restarts) ----------

let signaling = {
  sessionId: 0,
  offer: null,          // { sdp, type }
  answer: null,          // { sdp, type }
  iceFromBroadcaster: [], // array of candidates
  iceFromViewer: [],
};

let chatMessages = [];   // { id, name, text, category, ts }
let nextMsgId = 1;
let highlight = null;    // { name, question, upvotes } | null

// ---------- Helpers ----------

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 2 * 1024 * 1024) { req.destroy(); reject(new Error('body too large')); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { resolve({}); }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function readLines(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  } catch (e) {
    return [];
  }
}

// ---------- Route handling ----------

const routes = {
  // Static page shells
  'GET /': (req, res) => { res.writeHead(302, { Location: '/viewer' }); res.end(); },
  'GET /broadcaster': (req, res) => serveFile(res, path.join(PUBLIC_DIR, 'broadcaster', 'index.html')),
  'GET /viewer': (req, res) => serveFile(res, path.join(PUBLIC_DIR, 'viewer', 'index.html')),
  'GET /admin': (req, res) => serveFile(res, path.join(PUBLIC_DIR, 'admin', 'index.html')),

  // ----- Content (names, categories, highlighted questions) -----
  'GET /api/content/names': (req, res) => {
    sendJSON(res, 200, { names: readLines(path.join(CONTENT_DIR, 'names.txt')) });
  },
  'GET /api/content/categories': (req, res) => {
    const dir = path.join(CONTENT_DIR, 'categories');
    let files = [];
    try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.txt')); } catch (e) {}
    const categories = files.map((f) => {
      const key = f.replace(/\.txt$/, '');
      const lines = readLines(path.join(dir, f));
      return { key, label: key.charAt(0).toUpperCase() + key.slice(1), count: lines.length };
    });
    sendJSON(res, 200, { categories });
  },
  // GET /api/content/category?key=greetings
  'GET /api/content/category': (req, res, query) => {
    const key = (query.key || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const lines = readLines(path.join(CONTENT_DIR, 'categories', key + '.txt'));
    sendJSON(res, 200, { key, lines });
  },
  'GET /api/content/highlighted': (req, res) => {
    const lines = readLines(path.join(CONTENT_DIR, 'highlighted.txt'));
    const items = lines.map((l) => {
      const parts = l.split('|').map((p) => p.trim());
      return { name: parts[0] || '', question: parts[1] || '', upvotes: parts[2] || '' };
    });
    sendJSON(res, 200, { items });
  },

  // ----- Chat -----
  // POST /api/chat  { name, text, category }
  'POST /api/chat': async (req, res) => {
    const body = await readBody(req);
    const msg = {
      id: nextMsgId++,
      name: String(body.name || 'Student').slice(0, 60),
      text: String(body.text || '').slice(0, 300),
      category: String(body.category || '').slice(0, 40),
      ts: Date.now(),
    };
    chatMessages.push(msg);
    if (chatMessages.length > 500) chatMessages = chatMessages.slice(-500);
    sendJSON(res, 200, { ok: true, id: msg.id });
  },

  // ----- Highlight (pinned top-voted question) -----
  'POST /api/highlight': async (req, res) => {
    const body = await readBody(req);
    highlight = {
      name: String(body.name || '').slice(0, 60),
      question: String(body.question || '').slice(0, 300),
      upvotes: String(body.upvotes || '').slice(0, 20),
      ts: Date.now(),
    };
    sendJSON(res, 200, { ok: true });
  },
  'POST /api/highlight/clear': (req, res) => {
    highlight = null;
    sendJSON(res, 200, { ok: true });
  },

  // ----- Combined poll for viewer: new messages + current highlight -----
  // GET /api/state?since=123
  'GET /api/state': (req, res, query) => {
    const since = parseInt(query.since || '0', 10) || 0;
    const messages = chatMessages.filter((m) => m.id > since);
    sendJSON(res, 200, { messages, highlight, lastId: nextMsgId - 1 });
  },

  // ----- Admin: reset everything for a fresh take -----
  'POST /api/reset': (req, res) => {
    chatMessages = [];
    highlight = null;
    signaling = { sessionId: signaling.sessionId + 1, offer: null, answer: null, iceFromBroadcaster: [], iceFromViewer: [] };
    sendJSON(res, 200, { ok: true, sessionId: signaling.sessionId });
  },

  // ----- WebRTC signaling relay -----
  'POST /api/signal/offer': async (req, res) => {
    const body = await readBody(req);
    signaling.sessionId += 1;
    signaling.offer = { sdp: body.sdp, type: body.type };
    signaling.answer = null;
    signaling.iceFromBroadcaster = [];
    signaling.iceFromViewer = [];
    sendJSON(res, 200, { ok: true, sessionId: signaling.sessionId });
  },
  'GET /api/signal/offer': (req, res) => {
    sendJSON(res, 200, { offer: signaling.offer, sessionId: signaling.sessionId });
  },
  'POST /api/signal/answer': async (req, res) => {
    const body = await readBody(req);
    if (body.sessionId !== signaling.sessionId) { sendJSON(res, 409, { ok: false, reason: 'stale session' }); return; }
    signaling.answer = { sdp: body.sdp, type: body.type };
    sendJSON(res, 200, { ok: true });
  },
  'GET /api/signal/answer': (req, res, query) => {
    const sessionId = parseInt(query.sessionId || '-1', 10);
    if (sessionId !== signaling.sessionId) { sendJSON(res, 200, { answer: null, sessionId: signaling.sessionId }); return; }
    sendJSON(res, 200, { answer: signaling.answer, sessionId: signaling.sessionId });
  },
  'POST /api/signal/ice': async (req, res) => {
    const body = await readBody(req);
    if (body.sessionId !== signaling.sessionId) { sendJSON(res, 200, { ok: false, reason: 'stale session' }); return; }
    if (body.from === 'broadcaster') signaling.iceFromBroadcaster.push(body.candidate);
    else signaling.iceFromViewer.push(body.candidate);
    sendJSON(res, 200, { ok: true });
  },
  // GET /api/signal/ice?from=viewer&since=0&sessionId=1  (from = whose candidates you want to READ)
  'GET /api/signal/ice': (req, res, query) => {
    const sessionId = parseInt(query.sessionId || '-1', 10);
    if (sessionId !== signaling.sessionId) { sendJSON(res, 200, { candidates: [], sessionId: signaling.sessionId }); return; }
    const since = parseInt(query.since || '0', 10);
    const list = query.from === 'broadcaster' ? signaling.iceFromBroadcaster : signaling.iceFromViewer;
    sendJSON(res, 200, { candidates: list.slice(since), sessionId: signaling.sessionId });
  },
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname.replace(/\/+$/, '') || '/';
  const query = Object.fromEntries(parsedUrl.searchParams.entries());
  const key = `${req.method} ${pathname}`;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  if (routes[key]) {
    try {
      await routes[key](req, res, query);
    } catch (e) {
      console.error(e);
      sendJSON(res, 500, { error: 'server error' });
    }
    return;
  }

  // Static assets
  if (pathname.startsWith('/assets/')) {
    serveFile(res, path.join(ASSETS_DIR, pathname.replace('/assets/', '')));
    return;
  }
  if (pathname.startsWith('/broadcaster/')) {
    serveFile(res, path.join(PUBLIC_DIR, 'broadcaster', pathname.replace('/broadcaster/', '')));
    return;
  }
  if (pathname.startsWith('/viewer/')) {
    serveFile(res, path.join(PUBLIC_DIR, 'viewer', pathname.replace('/viewer/', '')));
    return;
  }
  if (pathname.startsWith('/admin/')) {
    serveFile(res, path.join(PUBLIC_DIR, 'admin', pathname.replace('/admin/', '')));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  ScienceCare Academic Aid — Live Class Rig');
  console.log('  ------------------------------------------');
  console.log(`  Server running on port ${PORT}`);
  console.log('');
  console.log('  Open these on each device (same WiFi):');
  console.log(`    Broadcaster (teacher):  http://<your-ip>:${PORT}/broadcaster`);
  console.log(`    Viewer (filmed phone):  http://<your-ip>:${PORT}/viewer`);
  console.log(`    Admin (operator):       http://<your-ip>:${PORT}/admin`);
  console.log('');
  console.log('  Find <your-ip> with `ipconfig` (Windows) or `ifconfig` / `ip a` (Mac/Linux).');
  console.log('');
});
