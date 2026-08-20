/* Content loader: reads names, comment categories, scenes, reactions, highlighted. */

function parseLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

async function fetchText(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
  return res.text();
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
  return res.json();
}

export async function loadManifest() {
  return fetchJson("content/manifest.json");
}

export async function loadNames() {
  return parseLines(await fetchText("content/names.txt"));
}

/* Load every category pool. The "emoji" category is generated, not a file. */
export async function loadCategories(manifest) {
  const pools = {};
  const real = manifest.categories.filter((c) => c !== "emoji");
  const results = await Promise.all(
    real.map(async (c) => {
      try {
        return [c, parseLines(await fetchText(`content/categories/${c}.txt`))];
      } catch (err) {
        console.warn(`Category file missing for "${c}":`, err);
        return [c, []];
      }
    })
  );
  for (const [name, lines] of results) pools[name] = lines;
  return pools;
}

export async function loadScenes(manifest) {
  const pools = {};
  const results = await Promise.all(
    (manifest.scenes || []).map(async (name) => {
      try {
        return [name, parseLines(await fetchText(`content/scenes/${name}.txt`))];
      } catch (err) {
        console.warn(`Scene file missing for "${name}":`, err);
        return [name, []];
      }
    })
  );
  for (const [name, lines] of results) pools[name] = lines;
  return pools;
}

export async function loadReactions() {
  return fetchJson("content/reactions.json");
}

/* highlighted.txt: "Name | Message | likes" per line. */
export async function loadHighlighted() {
  try {
    const lines = parseLines(await fetchText("content/highlighted.txt"));
    return lines.map((line) => {
      const parts = line.split("|").map((s) => s.trim());
      return {
        name: parts[0] || "",
        text: parts[1] || "",
        likes: parseInt(parts[2], 10) || 0
      };
    });
  } catch (err) {
    console.warn("highlighted.txt not found:", err);
    return [];
  }
}
