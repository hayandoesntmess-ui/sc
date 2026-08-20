/*
 * Realtime adapter. Uses Firebase Realtime Database when configured
 * (js/firebase-config.js), otherwise falls back to BroadcastChannel so two tabs
 * on the same device can sync during development or a LAN-only shoot.
 */

const FIREBASE_VERSION = "10.12.5";
const CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
const CHANNEL_NAME = "sciencecare-aid";

export function firebaseConfig() {
  return window.SC_FIREBASE_CONFIG || null;
}

function broadcastAdapter() {
  let channel = null;
  const listeners = { config: [], feed: [], status: [] };
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (e) => {
      const msg = e.data || {};
      if (msg && msg.type && listeners[msg.type]) {
        for (const cb of listeners[msg.type]) cb(msg.value);
      }
    };
  } catch (err) {
    console.warn("BroadcastChannel unavailable:", err);
  }
  return {
    mode: "broadcast",
    setConfig(config) {
      if (channel) channel.postMessage({ type: "config", value: config });
    },
    onConfig(cb) {
      listeners.config.push(cb);
    },
    pushFeed(events) {
      if (channel) channel.postMessage({ type: "feed", value: { events, at: Date.now() } });
    },
    onFeed(cb) {
      listeners.feed.push(cb);
    },
    heartbeat() {
      if (channel) channel.postMessage({ type: "status", value: { online: true, at: Date.now() } });
    },
    onStatus(cb) {
      listeners.status.push(cb);
    }
  };
}

async function firebaseAdapter() {
  const cfg = firebaseConfig();
  const { initializeApp } = await import(`${CDN}/firebase-app.js`);
  const { getDatabase, ref, set, onValue } = await import(`${CDN}/firebase-database.js`);
  const app = initializeApp(cfg);
  const db = getDatabase(app);
  const configRef = ref(db, "control/config");
  const feedRef = ref(db, "feed");
  const statusRef = ref(db, "status/viewer");

  return {
    mode: "firebase",
    setConfig(config) {
      return set(configRef, config);
    },
    onConfig(cb) {
      onValue(configRef, (snap) => cb(snap.val()));
    },
    pushFeed(events) {
      return set(feedRef, { events, at: Date.now() });
    },
    onFeed(cb) {
      onValue(feedRef, (snap) => cb(snap.val()));
    },
    heartbeat() {
      return set(statusRef, { online: true, at: Date.now() });
    },
    onStatus(cb) {
      onValue(statusRef, (snap) => cb(snap.val()));
    }
  };
}

export async function connectRealtime() {
  if (firebaseConfig()) {
    try {
      return await firebaseAdapter();
    } catch (err) {
      console.warn("Firebase init failed, falling back to BroadcastChannel:", err);
    }
  }
  return broadcastAdapter();
}
