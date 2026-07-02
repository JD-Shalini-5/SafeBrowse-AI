## SafeBrowse AI 🛡️

A Privacy-First Browser Extension for Contextual PTSD Trigger Filtering and Digital Wellbeing

SafeBrowse AI is an advanced, on-device content moderation engine engineered to protect users dealing with Post-Traumatic Stress Disorder (PTSD), severe anxiety, or specific phobias from unexpected digital triggers. By shifting content classification from cloud-based systems directly to the user's browser, the application provides real-time protection while maintaining absolute user privacy.


## 🚀 Key Technical Features


100% Privacy-First Architecture (Edge AI): All text parsing and image pixel classification take place locally inside the user's browser context utilizing TensorFlow.js. Zero browsing data or personal configurations are ever transmitted to a central cloud server.
Hybrid Multi-Tier Pipeline: Combines fast, deterministic pattern matching with heavy deep learning models only when required, preventing any page rendering lag or browser freezing.
Dedicated AI Worker Thread: All TensorFlow.js model loading and inference run inside a dedicated Web Worker (ai-worker.js), fully isolated from the page's main thread — so scrolling and rendering never stall while a model runs.
Viewport-Aware Image Scanning: Uses IntersectionObserver so only images actually visible on screen are ever sent for classification, skipping offscreen content and small icons/avatars/logos entirely.
Perceptual Image Caching: Images are fingerprinted with a lightweight perceptual hash rather than their URL, so the same picture served from different sources is only ever classified once.
Intelligent Image Context Aggregation: Features an advanced structural parser that handles complex search layouts (like Google Images), binding visible search tile text metadata directly to image evaluation containers.



## 🧠 System Architecture & Filtering Logic

SafeBrowse AI processes webpage elements through a three-layer validation pipeline to optimize accuracy against computing overhead:

[Webpage Loaded]
        │
        ▼
┌────────────────────────────────────────────────────────┐
│  Tier 1: Heuristic Filter (RegEx)                       │ ──► [Match Found] ──► [Instant Blur]
│  • High-speed, case-sensitive word-boundary scanning     │
└──────────────────────────┬───────────────────────────────┘
                            │ (No Match / Ambiguous)
                            ▼
┌────────────────────────────────────────────────────────┐
│  Tier 2: Semantic NLP Layer (Universal Sentence Enc.)    │ ──► [Match Found] ──► [Instant Blur]
│  • Maps text strings into 512-dimensional vector spaces  │
│  • Computes matrix similarity to catch abstract context  │
│  • Runs inside ai-worker.js, off the page's main thread  │
└──────────────────────────┬───────────────────────────────┘
                            │ (Images entering the viewport)
                            ▼
┌────────────────────────────────────────────────────────┐
│  Tier 3: Computer Vision Layer (MobileNet CNN)           │ ──► [Match Found] ──► [Instant Blur]
│  • IntersectionObserver triggers analysis only when      │
│    an image scrolls into view                            │
│  • Classification runs inside ai-worker.js, never on     │
│    the page's main thread                                │
└────────────────────────────────────────────────────────┘


Tier 1: Heuristic Engine (RegEx): Instantly scans elements for explicit, case-sensitive word boundaries. It catches exact user-defined matches with near-zero processing lag.
Tier 2: Semantic NLP Layer (Universal Sentence Encoder): Evaluates sentences mathematically based on structural meaning rather than exact phrasing. For example, if a user flags "blood", the engine successfully isolates related contexts (e.g., "The patient suffered severe hemorrhaging") even if the word "blood" is completely missing.
Tier 3: Computer Vision Layer (MobileNet CNN): Screens images as they scroll into view — combining alt-text and surrounding card text with pixel-level classification — and blurs first, verifying second, so nothing unsafe is ever shown before it's checked.



## 🛠️ Project Directory Tree

text├── manifest.json        # Extension configuration & script execution manifest
├── popup.html           # User preference dashboard layout (Dark/Yellow Aesthetic)
├── popup.js             # Saves user custom triggers case-sensitively
├── background.js        # Service worker — persists settings via chrome.storage.local
├── content.js            # Unified Multi-Tier filtering core execution script
├── ai-worker.js          # Dedicated Web Worker — owns all TensorFlow.js model
│                         #   loading and inference, isolated from the page thread
└── lib/                  # On-device Deep Learning scripts
    ├── tf.min.js          # TensorFlow.js core execution package
    ├── use.min.js         # Universal Sentence Encoder Model library
    └── mobilenet.min.js   # MobileNet Computer Vision Model library

## ⚙️ Installation & Deployment

Since this extension runs fully locally, you can load it into any Chromium-based browser (Chrome, Edge, Brave) using Developer Mode:

Clone the Repository:

bashgit clone https://github.com/JD-Shalini-5/SafeBrowse-AI.git

Open Extension Manager: Navigate to chrome://extensions/ inside your browser.

Enable Developer Mode: Toggle the Developer mode switch in the top-right corner.

Load the Project: Click the Load unpacked button in the top-left, and select the project folder containing your manifest.json.

## 🔧 Technologies Used


Languages: JavaScript (ES6+), HTML5, CSS3
Machine Learning Context: TensorFlow.js Core
NLP Model Base: Universal Sentence Encoder (USE)
Computer Vision Base: MobileNet CNN
API Systems: Web Extensions API (chrome.storage.local, MutationObserver, IntersectionObserver, Web Workers)



Developed by JD Shalini & Rashi Saraswat | Project ID: P 21
Submitted for evaluation to the IEEE Computer Society Bangalore Chapter.
