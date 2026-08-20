async function getJSON(url) {
  const res = await fetch(url);
  return res.json();
}
async function postJSON(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  return res.json();
}
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ---------- Connection status ----------
const connState = document.getElementById('connState');
async function pingServer() {
  try {
    await getJSON('/api/content/names');
    connState.textContent = 'server connected';
    connState.className = 'pill ok';
  } catch (e) {
    connState.textContent = 'server unreachable';
    connState.className = 'pill bad';
  }
  setTimeout(pingServer, 5000);
}
pingServer();

// ---------- State ----------
let names = [];
const categoryLines = {};   // key -> [lines]
const categoryTimers = {};  // key -> { intervalId, remaining, repeat }

// ---------- Load content & build category controls ----------
async function loadEverything() {
  const [namesRes, catsRes, hlRes] = await Promise.all([
    getJSON('/api/content/names'),
    getJSON('/api/content/categories'),
    getJSON('/api/content/highlighted'),
  ]);
  names = namesRes.names.length ? namesRes.names : ['Student'];

  const listEl = document.getElementById('categoryList');
  listEl.innerHTML = '';
  for (const cat of catsRes.categories) {
    const lines = (await getJSON('/api/content/category?key=' + encodeURIComponent(cat.key))).lines;
    categoryLines[cat.key] = lines;
    listEl.appendChild(buildCategoryCard(cat));
  }
  if (!catsRes.categories.length) {
    listEl.innerHTML = '<div class="loading">No category files found in /content/categories/. Add a .txt file per category and reload.</div>';
  }

  const hlList = document.getElementById('highlightList');
  hlList.innerHTML = '';
  if (!hlRes.items.length) {
    hlList.innerHTML = '<div class="loading">No preset questions in /content/highlighted.txt yet — use the custom box below.</div>';
  }
  for (const item of hlRes.items) {
    const row = document.createElement('div');
    row.className = 'highlight-item';
    row.innerHTML = `
      <div class="hq"><span class="hname"></span> — <span class="htext"></span></div>
      <span class="huv">▲ </span>
      <button class="btn btn-primary btn-sm">Pin</button>
    `;
    row.querySelector('.hname').textContent = item.name;
    row.querySelector('.htext').textContent = item.question;
    row.querySelector('.huv').append(item.upvotes);
    row.querySelector('button').addEventListener('click', () => {
      postJSON('/api/highlight', item);
    });
    hlList.appendChild(row);
  }
}

function buildCategoryCard(cat) {
  const card = document.createElement('div');
  card.className = 'category-card';
  card.innerHTML = `
    <div class="category-card-top">
      <span class="category-name"></span>
      <span class="category-count"></span>
    </div>
    <div class="category-controls">
      <label>Quantity<input type="number" class="qty" value="8" min="1" max="200"></label>
      <label>Per minute<input type="number" class="rate" value="12" min="1" max="120"></label>
      <label class="toggle-repeat"><input type="checkbox" class="repeat"> Loop</label>
      <span class="category-status" data-key="${cat.key}">idle</span>
      <button class="btn btn-primary btn-start">Start</button>
      <button class="btn btn-stop btn-stop-btn" style="display:none;">Stop</button>
    </div>
  `;
  card.querySelector('.category-name').textContent = cat.label;
  card.querySelector('.category-count').textContent = cat.count + ' lines';

  const startBtn = card.querySelector('.btn-start');
  const stopBtn = card.querySelector('.btn-stop-btn');
  const statusEl = card.querySelector('.category-status');
  const qtyInput = card.querySelector('.qty');
  const rateInput = card.querySelector('.rate');
  const repeatInput = card.querySelector('.repeat');

  startBtn.addEventListener('click', () => {
    startCategory(cat.key, {
      qty: parseInt(qtyInput.value, 10) || 1,
      rate: Math.max(1, parseInt(rateInput.value, 10) || 12),
      repeat: repeatInput.checked,
    }, statusEl, startBtn, stopBtn);
  });
  stopBtn.addEventListener('click', () => {
    stopCategory(cat.key, statusEl, startBtn, stopBtn);
  });

  return card;
}

function fireOneMessage(categoryKey) {
  const lines = categoryLines[categoryKey];
  if (!lines || !lines.length) return;
  const text = pick(lines);
  const name = pick(names);
  postJSON('/api/chat', { name, text, category: categoryKey });
  logToPreview(name, text);
}

function startCategory(key, opts, statusEl, startBtn, stopBtn) {
  stopCategory(key, statusEl, startBtn, stopBtn); // clear any existing run first

  const intervalMs = 60000 / opts.rate;
  let firedInBatch = 0;

  const tick = () => {
    fireOneMessage(key);
    firedInBatch += 1;
    if (firedInBatch >= opts.qty) {
      if (opts.repeat) {
        firedInBatch = 0; // loop the batch
      } else {
        stopCategory(key, statusEl, startBtn, stopBtn);
      }
    }
  };

  const intervalId = setInterval(tick, intervalMs);
  categoryTimers[key] = { intervalId };
  statusEl.textContent = 'running';
  statusEl.classList.add('running');
  startBtn.style.display = 'none';
  stopBtn.style.display = 'inline-block';
}

function stopCategory(key, statusEl, startBtn, stopBtn) {
  if (categoryTimers[key]) {
    clearInterval(categoryTimers[key].intervalId);
    delete categoryTimers[key];
  }
  if (statusEl) { statusEl.textContent = 'idle'; statusEl.classList.remove('running'); }
  if (startBtn) startBtn.style.display = 'inline-block';
  if (stopBtn) stopBtn.style.display = 'none';
}

// ---------- Custom highlight ----------
document.getElementById('hPush').addEventListener('click', () => {
  const name = document.getElementById('hName').value.trim() || pick(names);
  const question = document.getElementById('hQuestion').value.trim();
  const upvotes = document.getElementById('hUpvotes').value.trim() || String(Math.floor(Math.random() * 200) + 30);
  if (!question) { alert('Enter a question first.'); return; }
  postJSON('/api/highlight', { name, question, upvotes });
});
document.getElementById('hClear').addEventListener('click', () => {
  postJSON('/api/highlight/clear');
});

// ---------- Manual message ----------
document.getElementById('mSend').addEventListener('click', () => {
  const nameInput = document.getElementById('mName');
  const textInput = document.getElementById('mText');
  const text = textInput.value.trim();
  if (!text) return;
  const name = nameInput.value.trim() || pick(names);
  postJSON('/api/chat', { name, text, category: 'manual' });
  logToPreview(name, text);
  textInput.value = '';
});

// ---------- Feed preview ----------
const feedPreview = document.getElementById('feedPreview');
function logToPreview(name, text) {
  const row = document.createElement('div');
  row.className = 'fp-row';
  row.innerHTML = `<b></b>: <span></span>`;
  row.querySelector('b').textContent = name;
  row.querySelector('span').textContent = text;
  feedPreview.appendChild(row);
  while (feedPreview.children.length > 80) feedPreview.removeChild(feedPreview.firstChild);
  feedPreview.scrollTop = feedPreview.scrollHeight;
}

// ---------- Reset / new take ----------
document.getElementById('resetBtn').addEventListener('click', async () => {
  if (!confirm('Start a fresh take? This clears chat, the pinned question, and the video connection on all devices.')) return;
  // stop all running category timers locally
  Object.keys(categoryTimers).forEach((key) => {
    clearInterval(categoryTimers[key].intervalId);
    delete categoryTimers[key];
  });
  document.querySelectorAll('.category-status').forEach((el) => { el.textContent = 'idle'; el.classList.remove('running'); });
  document.querySelectorAll('.btn-start').forEach((el) => el.style.display = 'inline-block');
  document.querySelectorAll('.btn-stop-btn').forEach((el) => el.style.display = 'none');
  feedPreview.innerHTML = '';
  await postJSON('/api/reset');
});

loadEverything();
