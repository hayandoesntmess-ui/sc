// ---------- Config ----------
const AVATAR_COLORS = ['#0B5D3B', '#E1372E', '#D9A02C', '#2F6690', '#8A4FAE', '#C1553A', '#3E7C4A'];

// ---------- Helpers ----------
function colorForName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
function initials(name) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
}
async function getJSON(url) {
  const res = await fetch(url);
  return res.json();
}
async function postJSON(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  return res.json();
}

// ---------- Comments rendering ----------
const commentsEl = document.getElementById('comments');
const commentsCountEl = document.getElementById('commentsCount');
let commentCount = 0;
const MAX_RENDERED = 60;

function addComment(msg) {
  const row = document.createElement('div');
  row.className = 'comment';
  const av = document.createElement('div');
  av.className = 'avatar';
  av.style.background = colorForName(msg.name);
  av.textContent = initials(msg.name);
  const body = document.createElement('div');
  body.className = 'comment-body';
  body.innerHTML = `<div class="comment-name"></div><div class="comment-text"></div>`;
  body.querySelector('.comment-name').textContent = msg.name;
  body.querySelector('.comment-text').textContent = msg.text;
  row.appendChild(av);
  row.appendChild(body);
  commentsEl.appendChild(row);

  commentCount += 1;
  commentsCountEl.textContent = commentCount.toLocaleString() + ' comments';

  // trim old comments to keep DOM light
  while (commentsEl.children.length > MAX_RENDERED) {
    commentsEl.removeChild(commentsEl.firstChild);
  }
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

// ---------- Pinned highlight ----------
const pinnedWrap = document.getElementById('pinnedWrap');
let currentHighlightKey = null;

function renderHighlight(h) {
  const key = h ? h.question + '|' + h.name + '|' + h.upvotes + '|' + h.ts : null;
  if (key === currentHighlightKey) return;
  currentHighlightKey = key;
  pinnedWrap.innerHTML = '';
  if (!h) return;
  const card = document.createElement('div');
  card.className = 'pinned-card';
  card.innerHTML = `
    <div class="pinned-label">📌 Top voted question</div>
    <div class="pinned-question"></div>
    <div class="pinned-meta">
      <span class="pinned-name"></span>
      <span class="pinned-upvotes">▲ <span class="uv"></span></span>
    </div>
  `;
  card.querySelector('.pinned-question').textContent = h.question;
  card.querySelector('.pinned-name').textContent = h.name;
  card.querySelector('.uv').textContent = h.upvotes;
  pinnedWrap.appendChild(card);
}

// ---------- Poll server for new chat + highlight ----------
let lastId = 0;
async function pollState() {
  try {
    const res = await getJSON('/api/state?since=' + lastId);
    for (const m of res.messages) addComment(m);
    if (res.messages.length) lastId = res.lastId;
    renderHighlight(res.highlight);
  } catch (e) {}
  setTimeout(pollState, 800);
}
pollState();

// ---------- WebRTC: receive broadcaster's live feed ----------
const remoteVideo = document.getElementById('remoteVideo');
const stageWaiting = document.getElementById('stageWaiting');

async function connect() {
  let pc = new RTCPeerConnection({ iceServers: [] }); // LAN only
  let sessionId = null;
  let iceReadCursor = 0;

  pc.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
    stageWaiting.classList.add('hidden');
  };

  // Wait for broadcaster to post an offer, matching current session
  let offerData = null;
  while (!offerData || !offerData.offer) {
    const res = await getJSON('/api/signal/offer');
    if (res.offer) { offerData = res; break; }
    await new Promise((r) => setTimeout(r, 800));
  }
  sessionId = offerData.sessionId;

  await pc.setRemoteDescription(new RTCSessionDescription(offerData.offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await postJSON('/api/signal/answer', { sdp: answer.sdp, type: answer.type, sessionId });

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      postJSON('/api/signal/ice', { from: 'viewer', candidate: event.candidate, sessionId });
    }
  };

  // Poll for broadcaster's ICE candidates
  while (true) {
    const res = await getJSON(`/api/signal/ice?from=broadcaster&since=${iceReadCursor}&sessionId=${sessionId}`);
    if (res.sessionId !== sessionId) break; // session was reset elsewhere
    for (const c of res.candidates) {
      try { await pc.addIceCandidate(c); } catch (e) {}
    }
    iceReadCursor += res.candidates.length;
    await new Promise((r) => setTimeout(r, 800));
  }
}

function connectLoop() {
  connect().catch((e) => console.error('connect error', e)).finally(() => {
    setTimeout(connectLoop, 3000);
  });
}
connectLoop();
