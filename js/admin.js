import { loadManifest, loadReactions, loadHighlighted } from "./loader.js";
import { buildDefaultConfig, RATE_LIMITS } from "./config.js";
import { connectRealtime } from "./realtime.js";

const els = {
  rtMode: document.getElementById("rtMode"),
  viewerStatus: document.getElementById("viewerStatus"),
  classTitle: document.getElementById("classTitle"),
  youtubeUrl: document.getElementById("youtubeUrl"),
  viewerCount: document.getElementById("viewerCount"),
  startBtn: document.getElementById("startBtn"),
  pauseBtn: document.getElementById("pauseBtn"),
  clearBtn: document.getElementById("clearBtn"),
  commentRate: document.getElementById("commentRate"),
  commentRateOut: document.getElementById("commentRateOut"),
  categoryToggles: document.getElementById("categoryToggles"),
  weightGrid: document.getElementById("weightGrid"),
  reactionRate: document.getElementById("reactionRate"),
  reactionRateOut: document.getElementById("reactionRateOut"),
  emojiToggles: document.getElementById("emojiToggles"),
  sceneSelect: document.getElementById("sceneSelect"),
  manualText: document.getElementById("manualText"),
  manualCategory: document.getElementById("manualCategory"),
  sendCommentBtn: document.getElementById("sendCommentBtn"),
  burstBtn: document.getElementById("burstBtn"),
  pinSelect: document.getElementById("pinSelect"),
  pinBtn: document.getElementById("pinBtn"),
  unpinBtn: document.getElementById("unpinBtn"),
  feed: document.getElementById("feed")
};

let config = null;
let rt = null;
let manifest = null;
let reactions = null;
let highlighted = [];
let sceneWeightRow = null;
let lastStatus = null;
let publishTimer = null;

const CATEGORY_LABELS = {
  greetings: "Greetings",
  praise: "Praise",
  questions: "Questions",
  banter: "Banter",
  emoji: "Emoji-only"
};

function catLabel(cat) {
  return CATEGORY_LABELS[cat] || cat;
}

function randomId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function publish() {
  if (!rt) return;
  rt.setConfig(config);
}

function publishSoon() {
  clearTimeout(publishTimer);
  publishTimer = setTimeout(publish, 250);
}

function buildCategoryUI() {
  els.categoryToggles.innerHTML = "";
  els.weightGrid.innerHTML = "";
  sceneWeightRow = null;

  for (const cat of manifest.categories) {
    const item = document.createElement("label");
    item.className = "toggle-item";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = config.enabledCategories.includes(cat);
    cb.addEventListener("change", () => {
      if (cb.checked) {
        if (!config.enabledCategories.includes(cat)) config.enabledCategories.push(cat);
      } else {
        config.enabledCategories = config.enabledCategories.filter((c) => c !== cat);
      }
      publishSoon();
    });
    const label = document.createElement("span");
    label.textContent = catLabel(cat);
    item.appendChild(cb);
    item.appendChild(label);
    els.categoryToggles.appendChild(item);

    const row = document.createElement("div");
    row.className = "weight-row";
    const name = document.createElement("span");
    name.textContent = catLabel(cat);
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = 0;
    slider.max = 100;
    slider.step = 1;
    slider.value = config.weights[cat] || 0;
    slider.addEventListener("input", () => {
      config.weights[cat] = parseInt(slider.value, 10);
      publishSoon();
    });
    const out = document.createElement("output");
    out.className = "out";
    out.textContent = slider.value;
    slider.addEventListener("input", () => {
      out.textContent = slider.value;
    });
    row.appendChild(name);
    row.appendChild(slider);
    row.appendChild(out);
    els.weightGrid.appendChild(row);
  }
  maybeAddSceneWeightRow();
}

function maybeAddSceneWeightRow() {
  const scene = config.scene;
  if (!scene) {
    if (sceneWeightRow) {
      sceneWeightRow.remove();
      sceneWeightRow = null;
    }
    return;
  }
  if (sceneWeightRow) return;
  const row = document.createElement("div");
  row.className = "weight-row";
  const name = document.createElement("span");
  name.textContent = `Scene (${scene})`;
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = 0;
  slider.max = 100;
  slider.step = 1;
  slider.value = config.weights.scene != null ? config.weights.scene : manifest.defaultWeights.scene;
  slider.addEventListener("input", () => {
    config.weights.scene = parseInt(slider.value, 10);
    publishSoon();
  });
  const out = document.createElement("output");
  out.className = "out";
  out.textContent = slider.value;
  slider.addEventListener("input", () => {
    out.textContent = slider.value;
  });
  row.appendChild(name);
  row.appendChild(slider);
  row.appendChild(out);
  els.weightGrid.appendChild(row);
  sceneWeightRow = row;
}

function buildReactionUI() {
  els.emojiToggles.innerHTML = "";
  const sets = reactions.sets || {};
  for (const key of Object.keys(sets)) {
    const item = document.createElement("label");
    item.className = "toggle-item";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = config.enabledEmojiSets.includes(key);
    cb.addEventListener("change", () => {
      if (cb.checked) {
        if (!config.enabledEmojiSets.includes(key)) config.enabledEmojiSets.push(key);
      } else {
        config.enabledEmojiSets = config.enabledEmojiSets.filter((s) => s !== key);
      }
      publishSoon();
    });
    const label = document.createElement("span");
    label.textContent = `${key} ${sets[key].join(" ")}`;
    item.appendChild(cb);
    item.appendChild(label);
    els.emojiToggles.appendChild(item);
  }
}

function buildSceneUI() {
  els.sceneSelect.innerHTML = "";
  const none = document.createElement("option");
  none.value = "";
  none.textContent = "None";
  els.sceneSelect.appendChild(none);
  for (const scene of manifest.scenes || []) {
    const opt = document.createElement("option");
    opt.value = scene;
    opt.textContent = scene;
    els.sceneSelect.appendChild(opt);
  }
  els.sceneSelect.value = config.scene || "";
}

function buildManualUI() {
  els.manualCategory.innerHTML = "";
  const random = document.createElement("option");
  random.value = "random";
  random.textContent = "Random";
  els.manualCategory.appendChild(random);
  for (const cat of manifest.categories) {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = catLabel(cat);
    els.manualCategory.appendChild(opt);
  }

  els.pinSelect.innerHTML = "";
  for (let i = 0; i < highlighted.length; i++) {
    const h = highlighted[i];
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `${h.name} — ${h.text}`;
    els.pinSelect.appendChild(opt);
  }
  if (!highlighted.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No highlighted comments available";
    els.pinSelect.appendChild(opt);
    els.pinBtn.disabled = true;
  }
}

function refreshRateUI() {
  els.commentRate.value = config.commentRatePerMin;
  els.commentRateOut.textContent = config.commentRatePerMin;
  els.reactionRate.value = config.reactionRatePerMin;
  els.reactionRateOut.textContent = config.reactionRatePerMin;
}

function reflectConfig(incoming) {
  if (!incoming) return;
  config = incoming;
  els.classTitle.value = config.classTitle || "";
  els.youtubeUrl.value = config.youtubeUrl || "";
  els.viewerCount.value = config.liveViewerCount || 0;
  refreshRateUI();
  buildCategoryUI();
  buildReactionUI();
  buildSceneUI();
  els.startBtn.textContent = config.running ? "Stop comments" : "Start comments";
  els.startBtn.classList.toggle("on", !!config.running);
  els.pauseBtn.textContent = config.running ? "Pause" : "Resume";
}

function trigger(type, payload) {
  config.manualTrigger = { id: randomId(), type, payload: payload || {} };
  publish();
}

function randomEmojis() {
  const sets = (config.enabledEmojiSets || []).filter((s) => (reactions.sets[s] || []).length);
  if (!sets.length) return ["\u2764\uFE0F", "\uD83D\uDC4D"];
  const all = sets.flatMap((s) => reactions.sets[s]);
  const out = [];
  const count = 3 + Math.floor(Math.random() * 2);
  for (let i = 0; i < count; i++) out.push(all[Math.floor(Math.random() * all.length)]);
  return out;
}

function renderFeed(data) {
  if (!data || !Array.isArray(data.events) || !data.events.length) {
    els.feed.innerHTML = '<p class="feed-empty">No activity yet.</p>';
    return;
  }
  const items = data.events.slice(-20).reverse();
  els.feed.innerHTML = "";
  for (const ev of items) {
    if (ev.type !== "comment" && ev.type !== "reaction") continue;
    const row = document.createElement("div");
    row.className = "feed-item";
    const time = document.createElement("span");
    time.className = "feed-time";
    const d = new Date(ev.at || data.at || Date.now());
    time.textContent = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    row.appendChild(time);
    if (ev.type === "comment") {
      const name = document.createElement("span");
      name.className = "feed-name";
      name.textContent = ev.name;
      const text = document.createElement("span");
      text.className = "feed-text";
      text.textContent = ev.text;
      row.appendChild(name);
      row.appendChild(text);
    } else {
      const react = document.createElement("span");
      react.className = "feed-react";
      react.textContent = (ev.emojis || []).join(" ");
      row.appendChild(react);
    }
    els.feed.appendChild(row);
  }
  if (!els.feed.children.length) {
    els.feed.innerHTML = '<p class="feed-empty">No activity yet.</p>';
  }
}

function updateViewerStatus() {
  const ok = lastStatus && lastStatus.online && Date.now() - (lastStatus.at || 0) < 15000;
  els.viewerStatus.textContent = ok ? "viewer online" : "viewer offline";
  els.viewerStatus.className = `pill ${ok ? "pill-ok" : "pill-bad"}`;
}

function bindEvents() {
  els.classTitle.addEventListener("input", () => {
    config.classTitle = els.classTitle.value;
    publishSoon();
  });
  els.youtubeUrl.addEventListener("input", () => {
    config.youtubeUrl = els.youtubeUrl.value;
    publishSoon();
  });
  els.viewerCount.addEventListener("input", () => {
    config.liveViewerCount = parseInt(els.viewerCount.value, 10) || 0;
    publishSoon();
  });

  els.commentRate.addEventListener("input", () => {
    config.commentRatePerMin = parseInt(els.commentRate.value, 10);
    els.commentRateOut.textContent = config.commentRatePerMin;
    publishSoon();
  });
  els.reactionRate.addEventListener("input", () => {
    config.reactionRatePerMin = parseInt(els.reactionRate.value, 10);
    els.reactionRateOut.textContent = config.reactionRatePerMin;
    publishSoon();
  });

  els.startBtn.addEventListener("click", () => {
    config.running = !config.running;
    els.startBtn.textContent = config.running ? "Stop comments" : "Start comments";
    els.startBtn.classList.toggle("on", config.running);
    els.pauseBtn.textContent = config.running ? "Pause" : "Resume";
    publish();
  });

  els.pauseBtn.addEventListener("click", () => {
    config.running = !config.running;
    els.startBtn.textContent = config.running ? "Stop comments" : "Start comments";
    els.startBtn.classList.toggle("on", config.running);
    els.pauseBtn.textContent = config.running ? "Pause" : "Resume";
    publish();
  });

  els.clearBtn.addEventListener("click", () => trigger("clear"));

  els.sceneSelect.addEventListener("change", () => {
    config.scene = els.sceneSelect.value || null;
    maybeAddSceneWeightRow();
    publishSoon();
  });

  els.sendCommentBtn.addEventListener("click", () => {
    const cat = els.manualCategory.value;
    const text = els.manualText.value.trim();
    trigger("comment", {
      category: cat === "random" ? undefined : cat,
      text: text || undefined
    });
    els.manualText.value = "";
  });

  els.burstBtn.addEventListener("click", () => trigger("reaction", { emojis: randomEmojis() }));

  els.pinBtn.addEventListener("click", () => {
    const idx = parseInt(els.pinSelect.value, 10);
    if (highlighted[idx]) trigger("pin", highlighted[idx]);
  });

  els.unpinBtn.addEventListener("click", () => trigger("unpin"));
}

async function init() {
  manifest = await loadManifest();
  reactions = await loadReactions();
  highlighted = await loadHighlighted();

  config = buildDefaultConfig(manifest, reactions);

  els.commentRate.min = RATE_LIMITS.commentRatePerMin.min;
  els.commentRate.max = RATE_LIMITS.commentRatePerMin.max;
  els.reactionRate.min = RATE_LIMITS.reactionRatePerMin.min;
  els.reactionRate.max = RATE_LIMITS.reactionRatePerMin.max;

  buildCategoryUI();
  buildReactionUI();
  buildSceneUI();
  buildManualUI();
  refreshRateUI();
  bindEvents();

  rt = await connectRealtime();
  els.rtMode.textContent = rt.mode === "firebase" ? "Firebase connected" : "Demo mode (this device)";
  els.rtMode.className = `pill ${rt.mode === "firebase" ? "pill-ok" : "pill-neutral"}`;

  rt.onConfig((incoming) => {
    if (incoming) reflectConfig(incoming);
  });
  rt.onFeed(renderFeed);
  rt.onStatus((status) => {
    lastStatus = status;
    updateViewerStatus();
  });
  setInterval(updateViewerStatus, 4000);

  publish();
}

init().catch((err) => {
  console.error("Admin failed to init:", err);
  els.rtMode.textContent = "Init error";
});
