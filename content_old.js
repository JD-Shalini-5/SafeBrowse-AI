// ==========================================================================
// SafeBrowse AI — Unified Multi-Tier Core Engine
// Hierarchy: 1. Case-Sensitive Heuristics -> 2. USE NLP -> 3. MobileNet Vision
// ==========================================================================

const SIMILARITY_THRESHOLD = 0.55; 
const EMBED_BATCH_SIZE = 16;
const DEBOUNCE_MS = 600;
const VISUAL_PROB_THRESHOLD = 0.20;

// Text anchor vectors matching your project document categories
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

let userTriggersList = [];
let anchorRecords = [];
let anchorEmbeddings = null;
let useModelPromise = null;
let mobilenetPromise = null;
let systemReady = false;
let debounceTimer = null;

function loadUSEModel() {
  if (!useModelPromise) useModelPromise = use.load();
  return useModelPromise;
}

function loadMobileNetModel() {
  if (!mobilenetPromise) mobilenetPromise = mobilenet.load();
  return mobilenetPromise;
}

function compileAnchors() {
  const records = [];
  // Load predefined document mappings
  Object.keys(PREDEFINED_CATEGORIES).forEach((key) => {
    PREDEFINED_CATEGORIES[key].forEach((text) => records.push({ label: key, text }));
  });
  // Load custom triggers case-insensitively for semantic space safely
  const seen = new Set();
  userTriggersList.forEach((word) => {
    if (word) {
      const lower = word.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        records.push({ label: word, text: lower });
      }
    }
  });
  return records;
}

async function initSemanticAnchors() {
  anchorRecords = compileAnchors();
  if (anchorEmbeddings) {
    anchorEmbeddings.dispose();
    anchorEmbeddings = null;
  }
  if (anchorRecords.length === 0) return;

  try {
    const model = await loadUSEModel();
    const raw = await model.embed(anchorRecords.map((r) => r.text));
    anchorEmbeddings = tf.tidy(() => raw.div(tf.norm(raw, 2, 1).expandDims(1)));
    raw.dispose();
  } catch (err) {
    console.error("SafeBrowse AI Tensor Initiation Fault Blocked:", err);
  }
}

// Tier 1: Core Case-Sensitive RegEx Engine
function evaluateKeywordHeuristics(text) {
  return userTriggersList.some((word) => {
    if (!word) return false;
    const regex = new RegExp(`\\b${word}s?\\b`);
    return regex.test(text);
  });
}

// Tier 2: Vector Math Text Semantic Classifier
async function evaluateSemanticNLP(texts) {
  if (!anchorEmbeddings || texts.length === 0) return texts.map(() => null);

  const model = await loadUSEModel();
  const embedded = await model.embed(texts);

  const { simArray } = tf.tidy(() => {
    const normed = embedded.div(tf.norm(embedded, 2, 1).expandDims(1));
    const sim = normed.matMul(anchorEmbeddings.transpose());
    return { simArray: sim.arraySync() };
  });
  embedded.dispose();

  return simArray.map((row) => {
    let best = -1, bestIdx = -1;
    row.forEach((v, i) => { if (v > best) { best = v; bestIdx = i; } });
    return best >= SIMILARITY_THRESHOLD ? anchorRecords[bestIdx].label : null;
  });
}

// Tier 3: Computer Vision Pixel Classifier
async function evaluateVisualCNN(img) {
  if (!img.complete || img.naturalWidth === 0) return null;
  try {
    const model = await loadMobileNetModel();
    const predictions = await model.classify(img, 5);
    for (const pred of predictions) {
      const className = pred.className.toLowerCase();
      if (pred.probability < VISUAL_PROB_THRESHOLD) continue;
      for (const cat of Object.keys(VISUAL_CATEGORY_KEYWORDS)) {
        if (VISUAL_CATEGORY_KEYWORDS[cat].some((kw) => className.includes(kw))) {
          return cat;
        }
      }
    }
    return null;
  } catch (e) {
    return null;
  }
}

function applyInstantBlur(element) {
  element.style.filter = "blur(20px)";
  element.style.transition = "filter 0.2s ease-in-out";
  element.style.userSelect = "none";
  element.style.cursor = "pointer";

  element.addEventListener("click", (e) => {
    e.stopPropagation();
    element.style.filter = "none";
    element.style.userSelect = "auto";
    element.style.cursor = "auto";
  }, { once: true });
}

async function processPageLifecycle() {
  if (!systemReady) return;

  // Process Text Nodes
  const elements = Array.from(
    document.querySelectorAll("p, li, h1, h2, h3, td, .thumbcaption, div, span, label")
  ).filter((el) => !el.hasAttribute("data-safebrowse-checked") && el.children.length === 0);

  const semanticQueue = [];
  elements.forEach((el) => {
    const text = el.innerText.trim();
    el.setAttribute("data-safebrowse-checked", "true");
    if (!text) return;

    if (evaluateKeywordHeuristics(text)) {
      applyInstantBlur(el);
      return;
    }
    semanticQueue.push({ el, text: text.toLowerCase().slice(0, 500) });
  });

  for (let i = 0; i < semanticQueue.length; i += EMBED_BATCH_SIZE) {
    const chunk = semanticQueue.slice(i, i + EMBED_BATCH_SIZE);
    const labels = await evaluateSemanticNLP(chunk.map((c) => c.text));
    chunk.forEach((c, idx) => {
      if (labels[idx]) applyInstantBlur(c.el);
    });
  }

  // Process Media Nodes
  const images = Array.from(document.querySelectorAll("img, .thumb, figure")).filter(
    (el) => !el.hasAttribute("data-safebrowse-checked")
  );

  for (const img of images) {
    img.setAttribute("data-safebrowse-checked", "true");
    const altText = (img.alt || "").trim();
    const closestCard = img.closest("div[role='listitem'], a, div[class*='card'], .v4dQwb, .isv-r, .g");
    const cardText = closestCard ? closestCard.innerText.trim() : "";
    const combined = `${altText} ${cardText}`.trim();

    if (combined && evaluateKeywordHeuristics(combined)) {
      applyInstantBlur(img);
      if (closestCard) applyInstantBlur(closestCard);
      continue;
    }

    // Fallback directly to MobileNet Pixel Inference if metadata descriptions match nothing
    const htmlImgElement = img.tagName === 'IMG' ? img : img.querySelector('img');
    if (htmlImgElement) {
      const visualLabel = await evaluateVisualCNN(htmlImgElement);
      if (visualLabel) {
        applyInstantBlur(img);
        if (closestCard) applyInstantBlur(closestCard);
      }
    }
  }
}

function kickstartPipeline() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(processPageLifecycle, DEBOUNCE_MS);
}

async function setup() {
  const result = await chrome.storage.local.get(["userTriggers"]);
  userTriggersList = result.userTriggers || [];
  
  await initSemanticAnchors();
  systemReady = true;
  kickstartPipeline();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.userTriggers) {
    systemReady = false;
    setup();
  }
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setup();
    new MutationObserver(kickstartPipeline).observe(document.body, { childList: true, subtree: true });
  });
} else {
  setup();
  new MutationObserver(kickstartPipeline).observe(document.body, { childList: true, subtree: true });
}