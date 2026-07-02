// ==========================================================================
// SafeBrowse AI — Dedicated Web Worker
// Owns all TensorFlow.js / USE / MobileNet compute so the page's main
// thread never blocks on model loading or inference.
// Instantiated from content.js via:
//   new Worker(chrome.runtime.getURL("ai-worker.js"))
// ==========================================================================

const DEBUG = false;
const log = (...args) => DEBUG && console.log("[ai-worker]", ...args);

importScripts("lib/tf.min.js", "lib/use.min.js", "lib/mobilenet.min.js");

// CPU backend is the safest default inside a worker: WebGL needs a
// canvas-backed context that isn't guaranteed everywhere, and the WASM
// backend needs 'wasm-unsafe-eval' in the CSP (already added to
// manifest.json's extension_pages policy). Switch to "wasm" here if you
// load the tfjs-backend-wasm bundle and confirm it initializes correctly
// inside a worker in your target Chrome version.
tf.setBackend("cpu");

const SIMILARITY_THRESHOLD = 0.55;
const VISUAL_PROB_THRESHOLD = 0.20;

const PREDEFINED_CATEGORIES = {
  violence: ["a violent physical assault or fight", "someone being beaten or attacked", "a scene depicting war or armed conflict"],
  weapons: ["a gun, knife, or other weapon", "a person holding a firearm", "an explosion or bomb"],
  accidents: ["a car crash or traffic accident", "a fatal accident or disaster", "a plane crash or building collapse"],
  gore: ["graphic blood, injury, or gore", "a severely injured or mutilated body", "surgery showing exposed wounds"],
  phobia_insects: ["a spider, insect, or bug crawling", "a swarm of insects or bees"]
};

const VISUAL_CATEGORY_KEYWORDS = {
  weapons: ["revolver", "rifle", "pistol", "holster", "cannon"],
  phobia_insects: ["spider", "tarantula", "scorpion", "tick", "cockroach"]
};

let useModelPromise = null;
let mobilenetPromise = null;
let anchorRecords = [];
let anchorEmbeddings = null;

function loadUSEModel() {
  if (!useModelPromise) useModelPromise = use.load();
  return useModelPromise;
}

function loadMobileNetModel() {
  if (!mobilenetPromise) mobilenetPromise = mobilenet.load();
  return mobilenetPromise;
}

function compileAnchors(userTriggersList) {
  const records = [];
  Object.keys(PREDEFINED_CATEGORIES).forEach((key) => {
    PREDEFINED_CATEGORIES[key].forEach((text) => records.push({ label: key, text }));
  });
  const seen = new Set();
  (userTriggersList || []).forEach((word) => {
    if (!word) return;
    const lower = word.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      records.push({ label: word, text: lower });
    }
  });
  return records;
}

async function initAnchors(userTriggersList) {
  anchorRecords = compileAnchors(userTriggersList);

  if (anchorEmbeddings) {
    anchorEmbeddings.dispose();
    anchorEmbeddings = null;
  }
  if (anchorRecords.length === 0) return;

  const model = await loadUSEModel();
  const raw = await model.embed(anchorRecords.map((r) => r.text));
  anchorEmbeddings = tf.tidy(() => raw.div(tf.norm(raw, 2, 1).expandDims(1)));
  raw.dispose();
}

async function embedTexts(texts) {
  if (!anchorEmbeddings || texts.length === 0) return texts.map(() => null);

  const model = await loadUSEModel();
  const embedded = await model.embed(texts);

  const simArray = tf.tidy(() => {
    const normed = embedded.div(tf.norm(embedded, 2, 1).expandDims(1));
    const sim = normed.matMul(anchorEmbeddings.transpose());
    return sim.arraySync();
  });
  embedded.dispose();

  return simArray.map((row) => {
    let best = -1;
    let bestIdx = -1;
    row.forEach((v, i) => {
      if (v > best) {
        best = v;
        bestIdx = i;
      }
    });
    return best >= SIMILARITY_THRESHOLD ? anchorRecords[bestIdx].label : null;
  });
}

async function classifyImage(bitmap) {
  let tensor;
  try {
    const model = await loadMobileNetModel();
    tensor = tf.browser.fromPixels(bitmap);
    const predictions = await model.classify(tensor, 5);

    for (const pred of predictions) {
      if (pred.probability < VISUAL_PROB_THRESHOLD) continue;
      const className = pred.className.toLowerCase();
      for (const cat of Object.keys(VISUAL_CATEGORY_KEYWORDS)) {
        if (VISUAL_CATEGORY_KEYWORDS[cat].some((kw) => className.includes(kw))) {
          return cat;
        }
      }
    }
    return null;
  } finally {
    tensor?.dispose();
    bitmap.close?.();
  }
}

self.onmessage = async (e) => {
  const { id, type, payload } = e.data;
  try {
    let result;
    switch (type) {
      case "INIT":
        await initAnchors(payload.userTriggers);
        result = { ready: true };
        break;

      case "EMBED_TEXT":
        result = await embedTexts(payload.texts);
        break;

      case "CLASSIFY_IMAGE":
        result = await classifyImage(payload.bitmap);
        break;

      case "DISPOSE":
        if (anchorEmbeddings) anchorEmbeddings.dispose();
        anchorEmbeddings = null;
        result = { disposed: true };
        break;

      default:
        throw new Error(`Unknown message type: ${type}`);
    }
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: err?.message || String(err) });
  }
};

log("worker ready");