// ==========================================================================
// SafeBrowse AI — Content Script (v2.1)
// Scans the DOM and coordinates blurring. All heavy AI compute (USE
// embeddings, MobileNet classification) is delegated to ai-worker.js so
// the page's main thread stays responsive.
// ==========================================================================

const DEBUG = false;
const log = (...args) => DEBUG && console.log("[SafeBrowse]", ...args);

const CONFIG = {
  EMBED_BATCH_SIZE: 16,
  MUTATION_IDLE_TIMEOUT_MS: 400,
  MIN_IMAGE_DIMENSION: 60,   // skip icons / avatars / emojis smaller than this
  MAX_CONCURRENT_VISUAL: 2,  // cap concurrent MobileNet calls
  CACHE_MAX_SIZE: 500,
  HASH_SAMPLE: 8             // 8x8 perceptual hash grid
};

// --------------------------------------------------------------------------
// Tiny fixed-size LRU cache (Map preserves insertion order, so re-inserting
// a key on access is enough to implement LRU eviction)
// --------------------------------------------------------------------------
class LRUCache {
  constructor(maxSize) {
    this.maxSize = maxSize;
    this.map = new Map();
  }
  get(key) {
    if (!this.map.has(key)) return undefined;
    const val = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, val);
    return val;
  }
  set(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    else if (this.map.size >= this.maxSize) {
      this.map.delete(this.map.keys().next().value); // evict oldest
    }
    this.map.set(key, value);
  }
  has(key) {
    return this.map.has(key);
  }
}

const imageResultCache = new LRUCache(CONFIG.CACHE_MAX_SIZE);

// --------------------------------------------------------------------------
// Concurrency-limited semaphore — caps simultaneous MobileNet calls
// --------------------------------------------------------------------------
class Semaphore {
  constructor(max) {
    this.max = max;
    this.current = 0;
    this.queue = [];
  }
  async acquire() {
    if (this.current < this.max) {
      this.current++;
      return;
    }
    await new Promise((resolve) => this.queue.push(resolve));
    this.current++;
  }
  release() {
    this.current--;
    const next = this.queue.shift();
    if (next) next();
  }
}
const visualSemaphore = new Semaphore(CONFIG.MAX_CONCURRENT_VISUAL);

// --------------------------------------------------------------------------
// Worker RPC — request/response wrapper around postMessage
// --------------------------------------------------------------------------
let worker = null;
let workerReqId = 0;
const pendingRequests = new Map();

function initWorker() {
  worker = new Worker(chrome.runtime.getURL("ai-worker.js"));
  worker.onmessage = (e) => {
    const { id, result, error } = e.data;
    const pending = pendingRequests.get(id);
    if (!pending) return;
    pendingRequests.delete(id);
    if (error) pending.reject(new Error(error));
    else pending.resolve(result);
  };
  worker.onerror = (err) => {
    console.error("SafeBrowse AI worker crashed:", err.message);
  };
}

function callWorker(type, payload, transfer = []) {
  return new Promise((resolve, reject) => {
    const id = ++workerReqId;
    pendingRequests.set(id, { resolve, reject });
    worker.postMessage({ id, type, payload }, transfer);
  });
}

// --------------------------------------------------------------------------
// Tier 1: case-sensitive keyword heuristics (instant, no AI needed)
// --------------------------------------------------------------------------
let userTriggersList = [];

function evaluateKeywordHeuristics(text) {
  return userTriggersList.some((word) => {
    if (!word) return false;
    const regex = new RegExp(`\\b${word}s?\\b`, "i");
    return regex.test(text);
  });
}

// --------------------------------------------------------------------------
// Perceptual image hash (cheap 8x8 grayscale average-hash). Same picture
// served from different URLs collapses to the same cache key. Falls back
// to the raw src if the canvas is CORS-tainted and unreadable.
// --------------------------------------------------------------------------
function hashImage(img) {
  try {
    const n = CONFIG.HASH_SAMPLE;
    const canvas = new OffscreenCanvas(n, n);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, n, n);
    const { data } = ctx.getImageData(0, 0, n, n);

    let sum = 0;
    const gray = new Array(n * n);
    for (let i = 0; i < n * n; i++) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      const v = (r + g + b) / 3;
      gray[i] = v;
      sum += v;
    }
    const avg = sum / (n * n);
    let hash = "";
    for (let i = 0; i < n * n; i++) hash += gray[i] >= avg ? "1" : "0";
    return hash;
  } catch (err) {
    return img.src; // CORS-tainted canvas — fall back to URL as key
  }
}

// --------------------------------------------------------------------------
// Blur helpers
// --------------------------------------------------------------------------
function applyBlur(element) {
  if (!element || !element.isConnected) return;
  element.style.filter = "blur(20px)";
  element.style.transition = "filter 0.2s ease-in-out";
  element.style.userSelect = "none";
  element.style.cursor = "pointer";
  element.setAttribute("data-safebrowse-blurred", "true");

  if (!element.hasAttribute("data-safebrowse-click-bound")) {
    element.setAttribute("data-safebrowse-click-bound", "true");
    element.addEventListener("click", (e) => {
      e.stopPropagation();
      element.style.filter = "none";
      element.style.userSelect = "auto";
      element.style.cursor = "auto";
    }, { once: true });
  }
}

function removeBlur(element) {
  if (!element || !element.isConnected) return;
  if (element.getAttribute("data-safebrowse-blurred") === "true") {
    element.style.filter = "none";
    element.removeAttribute("data-safebrowse-blurred");
  }
}

// --------------------------------------------------------------------------
// Text pipeline — batches into the worker during browser idle time
// --------------------------------------------------------------------------
let textQueue = [];
let textFlushScheduled = false;

function scheduleTextFlush() {
  if (textFlushScheduled) return;
  textFlushScheduled = true;
  const runner = () => {
    textFlushScheduled = false;
    flushTextQueue();
  };
  if ("requestIdleCallback" in window) {
    requestIdleCallback(runner, { timeout: 1000 });
  } else {
    setTimeout(runner, 200);
  }
}

async function flushTextQueue() {
  const batch = textQueue;
  textQueue = [];
  if (batch.length === 0) return;

  for (let i = 0; i < batch.length; i += CONFIG.EMBED_BATCH_SIZE) {
    const chunk = batch.slice(i, i + CONFIG.EMBED_BATCH_SIZE);
    const liveChunk = chunk.filter((c) => c.el.isConnected); // skip removed nodes
    if (liveChunk.length === 0) continue;

    try {
      const labels = await callWorker("EMBED_TEXT", { texts: liveChunk.map((c) => c.text) });
      liveChunk.forEach((c, idx) => {
        if (labels[idx]) applyBlur(c.el);
      });
    } catch (err) {
      log("text batch failed:", err.message);
    }
  }
}

function processTextElement(el) {
  if (el.hasAttribute("data-safebrowse-checked") || el.children.length > 0) return;
  el.setAttribute("data-safebrowse-checked", "true");

  const text = el.innerText.trim();
  if (!text) return;

  if (evaluateKeywordHeuristics(text)) {
    applyBlur(el);
    return;
  }
  textQueue.push({ el, text: text.toLowerCase().slice(0, 500) });
  scheduleTextFlush();
}

// --------------------------------------------------------------------------
// Image pipeline — IntersectionObserver so only visible images are ever
// processed; blur applied immediately, lifted only if the model clears it
// --------------------------------------------------------------------------
const imageObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      imageObserver.unobserve(entry.target);
      handleImageVisible(entry.target);
    });
  },
  { rootMargin: "200px" }
);

function isTooSmall(img) {
  const w = img.naturalWidth || img.width || 0;
  const h = img.naturalHeight || img.height || 0;
  return w > 0 && h > 0 && (w < CONFIG.MIN_IMAGE_DIMENSION || h < CONFIG.MIN_IMAGE_DIMENSION);
}

function closestCardFor(img) {
  return img.closest("div[role='listitem'], a, div[class*='card'], .v4dQwb, .isv-r, .g");
}

async function handleImageVisible(img) {
  try {
    if (!img.isConnected) return; // node was removed before it was processed

    if (!img.complete) {
      await new Promise((resolve) => {
        img.addEventListener("load", resolve, { once: true });
        img.addEventListener("error", resolve, { once: true }); // don't hang on broken images
      });
    }
    if (!img.isConnected || !img.complete || img.naturalWidth === 0) return;
    if (isTooSmall(img)) return; // skip icons / emojis / avatars / logos

    const altText = (img.alt || "").trim();
    const card = closestCardFor(img);
    const cardText = card ? card.innerText.trim() : "";
    const combined = `${altText} ${cardText}`.trim();

    if (combined && evaluateKeywordHeuristics(combined)) {
      applyBlur(img);
      if (card) applyBlur(card);
      return;
    }

    let hash;
    try {
      hash = hashImage(img);
    } catch {
      hash = img.src;
    }

    if (imageResultCache.has(hash)) {
      if (imageResultCache.get(hash)) {
        applyBlur(img);
        if (card) applyBlur(card);
      }
      return;
    }

    // Blur first, verify second — never show a flash of unfiltered content
    applyBlur(img);
    if (card) applyBlur(card);

    await visualSemaphore.acquire();
    try {
      const bitmap = await createImageBitmap(img);
      const label = await callWorker("CLASSIFY_IMAGE", { bitmap }, [bitmap]);
      imageResultCache.set(hash, !!label);
      if (!label) {
        removeBlur(img);
        if (card) removeBlur(card);
      }
    } finally {
      visualSemaphore.release();
    }
  } catch (err) {
    log("image processing failed:", err.message);
    // Fail closed: leave whatever blur state exists rather than erroring out unblurred
  }
}

function processImageElement(img) {
  if (img.hasAttribute("data-safebrowse-checked")) return;
  img.setAttribute("data-safebrowse-checked", "true");
  imageObserver.observe(img);
}

// --------------------------------------------------------------------------
// Node scanning — always scoped to a subtree, never the whole document
// after initial load
// --------------------------------------------------------------------------
const TEXT_SELECTOR = "p, li, h1, h2, h3, td, .thumbcaption, div, span, label";
const IMAGE_SELECTOR = "img, .thumb, figure";

function scanNode(root) {
  if (!(root instanceof Element) || !root.isConnected) return;

  if (root.matches?.(TEXT_SELECTOR)) processTextElement(root);
  root.querySelectorAll?.(TEXT_SELECTOR).forEach(processTextElement);

  if (root.matches?.(IMAGE_SELECTOR)) processImageElement(root);
  root.querySelectorAll?.(IMAGE_SELECTOR).forEach(processImageElement);
}

// --------------------------------------------------------------------------
// Mutation handling — collects only newly added nodes and scans them
// during idle time, instead of rescanning the entire page on every change
// --------------------------------------------------------------------------
let pendingNodes = new Set();
let mutationFlushScheduled = false;

function scheduleMutationFlush() {
  if (mutationFlushScheduled) return;
  mutationFlushScheduled = true;
  const runner = () => {
    mutationFlushScheduled = false;
    const nodes = pendingNodes;
    pendingNodes = new Set();
    nodes.forEach(scanNode);
  };
  if ("requestIdleCallback" in window) {
    requestIdleCallback(runner, { timeout: CONFIG.MUTATION_IDLE_TIMEOUT_MS });
  } else {
    setTimeout(runner, CONFIG.MUTATION_IDLE_TIMEOUT_MS);
  }
}

const mutationObserver = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    mutation.addedNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) pendingNodes.add(node);
    });
  }
  if (pendingNodes.size > 0) scheduleMutationFlush();
});

// --------------------------------------------------------------------------
// Setup / lifecycle
// --------------------------------------------------------------------------
async function setup() {
  try {
    const result = await chrome.storage.local.get(["userTriggers"]);
    userTriggersList = result.userTriggers || [];

    if (!worker) initWorker();
    await callWorker("INIT", { userTriggers: userTriggersList });

    scanNode(document.body);
  } catch (err) {
    console.error("SafeBrowse AI setup failed:", err.message);
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.userTriggers) return;
  userTriggersList = changes.userTriggers.newValue || [];
  callWorker("INIT", { userTriggers: userTriggersList }).catch((err) =>
    log("re-init after settings change failed:", err.message)
  );
});

function start() {
  setup();
  mutationObserver.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}