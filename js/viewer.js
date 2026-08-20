import {
  loadManifest,
  loadNames,
  loadCategories,
  loadScenes,
  loadReactions,
  loadHighlighted
} from "./loader.js";
import { buildDefaultConfig, mergeConfig, FEED_SIZE } from "./config.js";
import { Simulation } from "./simulation.js";
import { connectRealtime } from "./realtime.js";

const CHAT_CAP = 30;

const els = {
  classTitle: document.getElementById("classTitle"),
  videoHolder: document.getElementById("videoHolder"),
  videoPlaceholder: document.getElementById("videoPlaceholder"),
  reactionLayer: document.getElementById("reactionLayer"),
  viewerCount: document.getElementById("viewerCount"),
  likeCount: document.getElementById("likeCount"),
  likeBtn: document.getElementById("likeBtn"),
  pinnedBar: document.getElementById("pinnedBar"),
  pinName: document.getElementById("pinName"),
  pinText: document.getElementById("pinText"),
  pinLikes: document.getElementById("pinLikes"),
  chatStatus: document.getElementById("chatStatus"),
  chatList: document.getElementById("chatList"),
  bottomLike: document.getElementById("bottomLike"),
  bottomLikeCount: document.getElementById("bottomLikeCount")
};

const AVATAR_CLASSES = ["", "alt", "alt2", "alt3"];
let likeTotal = 0;
let viewerBase = 0;
let lastPushedFeed = "";
let feedLog = [];
let currentConfig = null;
let rt = null;
let simulation = null;
let streamEl = null;
let wakeLock = null;

function timeNow() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function nameHash(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function scrollChatToBottom(force) {
  const el = els.chatList;
  const nearBottom = force || el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  if (nearBottom) el.scrollTop = el.scrollHeight;
}

function renderComment(event) {
  const isEmoji = event.category === "emoji";
  const node = document.createElement("div");
  node.className = `comment${isEmoji ? " emoji-comment" : ""}`;

  const avatar = document.createElement("div");
  avatar.className = `avatar ${AVATAR_CLASSES[nameHash(event.name) % AVATAR_CLASSES.length]}`;
  avatar.textContent = event.name.charAt(0);
  avatar.setAttribute("aria-hidden", "true");

  const empty = els.chatList.querySelector(".empty-chat");
  if (empty) empty.remove();

  const body = document.createElement("div");
  body.className = "comment-body";

  const name = document.createElement("span");
  name.className = `comment-name ${AVATAR_CLASSES[nameHash(event.name) % AVATAR_CLASSES.length]}`;
  name.textContent = event.name;

  const text = document.createElement("span");
  text.className = "comment-text";
  text.textContent = event.text;

  body.appendChild(name);
  body.appendChild(text);

  const time = document.createElement("span");
  time.className = "comment-time";
  time.textContent = timeNow();

  node.appendChild(avatar);
  node.appendChild(body);
  node.appendChild(time);
  els.chatList.appendChild(node);

  while (els.chatList.children.length > CHAT_CAP) {
    const first = els.chatList.firstElementChild;
    if (first && first.classList.contains("comment")) {
      first.classList.add("out");
      setTimeout(() => first.remove(), 450);
    } else {
      first.remove();
    }
  }
  scrollChatToBottom(false);
}

function renderReaction(emojis) {
  likeTotal += 1;
  els.likeCount.textContent = `${"\u2764\uFE0F"} ${likeTotal}`;
  els.bottomLikeCount.textContent = likeTotal;

  const count = Math.min(emojis.length, 4);
  for (let i = 0; i < count; i++) {
    const span = document.createElement("span");
    span.className = "reaction-emoji";
    span.textContent = emojis[i % emojis.length];
    span.style.left = `${12 + Math.random() * 76}%`;
    span.style.animationDelay = `${i * 90}ms`;
    span.style.fontSize = `${22 + Math.random() * 14}px`;
    els.reactionLayer.appendChild(span);
    setTimeout(() => span.remove(), 1800);
  }
}

function setPinned(payload) {
  if (!payload || (!payload.text && !payload.name)) {
    els.pinnedBar.classList.add("hidden");
    return;
  }
  els.pinName.textContent = payload.name ? `${payload.name}:` : "";
  els.pinText.textContent = payload.text || "";
  els.pinLikes.textContent = payload.likes ? `${"\u2764\uFE0F"} ${payload.likes}` : "";
  els.pinnedBar.classList.remove("hidden");
}

function clearChat() {
  els.chatList.innerHTML = "";
  els.pinnedBar.classList.add("hidden");
  likeTotal = 0;
  els.likeCount.textContent = `${"\u2764\uFE0F"} 0`;
  els.bottomLikeCount.textContent = "0";
  feedLog = [];
  lastPushedFeed = "";
  const empty = document.createElement("div");
  empty.className = "empty-chat";
  empty.textContent = "Chat cleared by the operator.";
  els.chatList.appendChild(empty);
}

function handleEvent(event) {
  switch (event.type) {
    case "comment":
      renderComment(event);
      break;
    case "reaction":
      renderReaction(event.emojis || ["\u2764\uFE0F"]);
      break;
    case "pin":
      setPinned(event.payload);
      break;
    case "unpin":
      setPinned(null);
      break;
    case "clear":
      clearChat();
      break;
  }
  feedLog.push({
    type: event.type,
    name: event.name,
    text: event.text,
    emojis: event.emojis,
    at: event.at
  });
  if (feedLog.length > FEED_SIZE) feedLog.splice(0, feedLog.length - FEED_SIZE);
  pushFeed();
}

function pushFeed() {
  const events = feedLog.map((e) => ({
    type: e.type,
    name: e.name,
    text: e.text,
    emojis: e.emojis,
    at: e.at
  }));
  const key = JSON.stringify(events);
  if (key !== lastPushedFeed && rt) {
    lastPushedFeed = key;
    rt.pushFeed(events);
  }
}

function applyVideoUrl(url) {
  if (!url) {
    if (streamEl) {
      streamEl.remove();
      streamEl = null;
    }
    els.videoPlaceholder.classList.remove("hidden");
    return;
  }
  let src = url.trim();
  if (!/^https?:\/\//.test(src)) {
    src = `https://www.youtube.com/embed/live_stream?channel=${encodeURIComponent(src)}`;
  }
  const hasParams = src.includes("?");
  if (!src.includes("autoplay")) {
    src += `${hasParams ? "&" : "?"}autoplay=1&rel=0`;
  }
  if (!streamEl) {
    streamEl = document.createElement("iframe");
    streamEl.title = "Live class stream";
    streamEl.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture; fullscreen");
    streamEl.setAttribute("allowfullscreen", "");
    els.videoHolder.appendChild(streamEl);
  }
  if (streamEl.src !== src) streamEl.src = src;
  els.videoPlaceholder.classList.add("hidden");
}

function applyConfig(config) {
  currentConfig = config;
  els.classTitle.textContent = config.classTitle || "ScienceCare Academic Aid";
  applyVideoUrl(config.youtubeUrl || "");
  viewerBase = config.liveViewerCount || 0;
  updateViewerCount();
  const running = !!config.running;
  els.chatStatus.textContent = running
    ? "Live comments on"
    : config.scene && config.scene !== "none"
      ? "Paused \u2022 scene: " + config.scene
      : "Waiting for class to start...";
  if (simulation) simulation.setConfig(config);
}

function updateViewerCount() {
  if (viewerBase <= 0) {
    els.viewerCount.classList.add("hidden");
    return;
  }
  const jitter = Math.round(viewerBase * 0.08 * (Math.random() * 2 - 1));
  els.viewerCount.textContent = `${viewerBase + jitter} watching`;
  els.viewerCount.classList.remove("hidden");
}

async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => {
        wakeLock = null;
      });
    }
  } catch (err) {
    console.warn("Wake lock unavailable:", err);
  }
}

async function init() {
  const manifest = await loadManifest();
  const [names, categories, scenes, reactions, highlighted] = await Promise.all([
    loadNames(),
    loadCategories(manifest),
    loadScenes(manifest),
    loadReactions(),
    loadHighlighted()
  ]);

  const pools = { ...categories, ...scenes };
  const baseConfig = buildDefaultConfig(manifest, reactions);
  currentConfig = baseConfig;

  simulation = new Simulation({
    pools,
    names,
    emojiSets: reactions.sets || {},
    onEvent: handleEvent
  });
  simulation.setConfig(currentConfig);

  rt = await connectRealtime();
  rt.onConfig((incoming) => {
    if (incoming) applyConfig(mergeConfig(currentConfig, incoming));
  });
  setInterval(() => {
    if (rt) rt.heartbeat();
  }, 5000);
  setInterval(updateViewerCount, 3000);

  els.likeBtn.addEventListener("click", () => renderReaction(["\u2764\uFE0F", "\uD83D\uDC4D", "\uD83D\uDC4D"]));
  els.bottomLike.addEventListener("click", () => renderReaction(["\u2764\uFE0F", "\uD83D\uDC4D"]));

  const empty = document.createElement("div");
  empty.className = "empty-chat";
  empty.textContent = "No comments yet. The class will begin shortly.";
  els.chatList.appendChild(empty);

  await requestWakeLock();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") requestWakeLock();
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch((err) => {
      console.warn("SW registration failed:", err);
    });
  }
}

init().catch((err) => {
  console.error("Viewer failed to init:", err);
  els.chatStatus.textContent = "Failed to load: " + err.message;
});
