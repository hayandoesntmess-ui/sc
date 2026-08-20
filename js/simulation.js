/*
 * Simulation engine. Pure logic, no DOM. Runs on the viewer device.
 * Produces events via onEvent: comment, reaction, pin, unpin, clear.
 */

const MIN_DELAY = 1500;
const MAX_DELAY = 90000;

function randInt(n) {
  return Math.floor(Math.random() * n);
}

function pick(arr, avoid) {
  if (!arr.length) return null;
  let idx = randInt(arr.length);
  if (avoid != null && arr.length > 1 && idx === avoid) {
    idx = (idx + 1) % arr.length;
  }
  return { value: arr[idx], idx };
}

function weightedPick(entries) {
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  if (total <= 0) return null;
  let roll = Math.random() * total;
  for (const e of entries) {
    roll -= e.weight;
    if (roll <= 0) return e;
  }
  return entries[entries.length - 1];
}

function nextDelay(perMin) {
  if (!perMin || perMin <= 0) return null;
  const mean = 60000 / perMin;
  const delay = -Math.log(1 - Math.random()) * mean;
  return Math.min(MAX_DELAY, Math.max(MIN_DELAY, delay));
}

export class Simulation {
  constructor({ pools, names, emojiSets, onEvent }) {
    this.pools = pools;
    this.names = names;
    this.emojiSets = emojiSets;
    this.onEvent = onEvent;

    this.config = null;
    this.commentTimer = null;
    this.reactionTimer = null;
    this.lastLine = {}; // category -> last index used
    this.lastName = null;
    this.triggerSeen = new Set();
  }

  setConfig(config) {
    const wasRunning = this.config ? this.config.running : false;
    this.config = config;
    const running = !!config.running;
    if (running && !wasRunning) this.schedule();
    if (!running) this.clearTimers();
    if (config.manualTrigger) {
      this.consumeTrigger(config.manualTrigger);
    }
  }

  destroy() {
    this.clearTimers();
  }

  clearTimers() {
    if (this.commentTimer) {
      clearTimeout(this.commentTimer);
      this.commentTimer = null;
    }
    if (this.reactionTimer) {
      clearTimeout(this.reactionTimer);
      this.reactionTimer = null;
    }
  }

  scheduleComment() {
    if (!this.config || !this.config.running) return;
    const cDelay = nextDelay(this.config.commentRatePerMin);
    if (cDelay) {
      this.commentTimer = setTimeout(() => {
        this.commentTimer = null;
        this.fireComment();
        this.scheduleComment();
      }, cDelay);
    }
  }

  scheduleReaction() {
    if (!this.config || !this.config.running) return;
    const rDelay = nextDelay(this.config.reactionRatePerMin);
    if (rDelay) {
      this.reactionTimer = setTimeout(() => {
        this.reactionTimer = null;
        this.fireReaction();
        this.scheduleReaction();
      }, rDelay);
    }
  }

  schedule() {
    this.scheduleComment();
    this.scheduleReaction();
  }

  enabledPools() {
    const cats = this.config?.enabledCategories || [];
    const scene = this.config?.scene;
    const pools = [];
    for (const cat of cats) {
      if (cat === "scene") continue;
      const weight = this.config.weights[cat] || 0;
      if (weight <= 0) continue;
      if (cat === "emoji") {
        if (this.enabledEmojiCount() > 0) pools.push({ cat, weight, hasPool: true });
        continue;
      }
      if ((this.pools[cat] || []).length > 0) pools.push({ cat, weight, hasPool: true });
    }
    if (scene && this.pools[scene] && this.pools[scene].length > 0) {
      const weight = this.config.weights.scene || 0;
      if (weight > 0) pools.push({ cat: scene, weight, hasPool: true });
    }
    return pools;
  }

  enabledEmojiCount() {
    const sets = (this.config?.enabledEmojiSets || []).filter((s) => (this.emojiSets[s] || []).length);
    return sets.length;
  }

  pickCategory() {
    const pools = this.enabledPools();
    if (!pools.length) return null;
    const hit = weightedPick(pools);
    return hit ? hit.cat : null;
  }

  pickName() {
    if (!this.names.length) return "Student";
    const p = pick(this.names, this.lastName);
    this.lastName = p.idx;
    return p.value;
  }

  pickLine(cat) {
    const pool = this.pools[cat];
    if (!pool || !pool.length) return "";
    const p = pick(pool, this.lastLine[cat]);
    this.lastLine[cat] = p.idx;
    return p.value;
  }

  pickEmojis() {
    const sets = (this.config?.enabledEmojiSets || []).filter((s) => (this.emojiSets[s] || []).length);
    if (!sets.length) return ["👍"];
    const all = sets.flatMap((s) => this.emojiSets[s]);
    const count = 1 + randInt(Math.min(3, all.length));
    const out = [];
    for (let i = 0; i < count; i++) out.push(all[randInt(all.length)]);
    return out;
  }

  emit(event) {
    event.id = event.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    event.at = Date.now();
    if (this.onEvent) this.onEvent(event);
  }

  fireComment(category) {
    const cat = category || this.pickCategory();
    if (!cat) return;
    if (cat === "emoji") {
      this.emit({
        type: "comment",
        category: "emoji",
        name: this.pickName(),
        text: this.pickEmojis().join("")
      });
      return;
    }
    this.emit({
      type: "comment",
      category: cat,
      name: this.pickName(),
      text: this.pickLine(cat)
    });
  }

  fireReaction(emojis) {
    this.emit({
      type: "reaction",
      emojis: emojis && emojis.length ? emojis : this.pickEmojis()
    });
  }

  consumeTrigger(trigger) {
    if (!trigger || !trigger.id || this.triggerSeen.has(trigger.id)) return;
    this.triggerSeen.add(trigger.id);
    if (this.triggerSeen.size > 200) {
      this.triggerSeen = new Set([...this.triggerSeen].slice(-100));
    }
    switch (trigger.type) {
      case "comment": {
        if (trigger.payload && trigger.payload.text) {
          this.emit({
            type: "comment",
            category: trigger.payload.category || "manual",
            name: this.pickName(),
            text: trigger.payload.text
          });
        } else {
          this.fireComment(trigger.payload ? trigger.payload.category : null);
        }
        break;
      }
      case "reaction":
        this.fireReaction(trigger.payload ? trigger.payload.emojis : null);
        break;
      case "pin":
        this.emit({ type: "pin", payload: trigger.payload || {} });
        break;
      case "unpin":
        this.emit({ type: "unpin" });
        break;
      case "clear":
        this.emit({ type: "clear" });
        break;
    }
  }
}
