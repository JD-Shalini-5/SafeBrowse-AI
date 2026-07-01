# SafeBrowse AI 🛡️

**A Privacy-First Browser Extension for Contextual PTSD Trigger Filtering and Digital Wellbeing**

SafeBrowse AI is an advanced, on-device content moderation engine engineered to protect users dealing with Post-Traumatic Stress Disorder (PTSD), severe anxiety, or specific phobias from unexpected digital triggers. By shifting content classification from cloud-based systems directly to the user's browser, the application provides real-time protection while maintaining absolute user privacy.

---

## 🚀 Key Technical Features

* **100% Privacy-First Architecture (Edge AI):** All text parsing and image pixel classification take place locally inside the user's browser context utilizing TensorFlow.js. Zero browsing data or personal configurations are ever transmitted to a central cloud server.
* **Hybrid Multi-Tier Pipeline:** Combines fast, deterministic pattern matching with heavy deep learning models only when required, preventing any page rendering lag or browser freezing.
* **Intelligent Image Context Aggregation:** Features an advanced structural parser that handles complex search layouts (like Google Images), binding visible search tile text metadata directly to image evaluation containers.

---

## 🧠 System Architecture & Filtering Logic

SafeBrowse AI processes webpage elements through a three-layer validation pipeline to optimize accuracy against computing overhead:

[Webpage Loaded]
│
▼
┌────────────────────────────────────────────────────────┐
│  Tier 1: Heuristic Filter (RegEx)                      │ ──► [Match Found] ──► [Instant Blur]
│  • High-speed, case-sensitive word-boundary scanning   │
└──────────────────────────┬─────────────────────────────┘
│ (No Match / Ambiguous)
▼
┌────────────────────────────────────────────────────────┐
│  Tier 2: Semantic NLP Layer (Universal Sentence Enc.)  │ ──► [Match Found] ──► [Instant Blur]
│  • Maps text strings into 512-dimensional vector spaces│
│  • Computes matrix similarity to catch abstract context│
└──────────────────────────┬─────────────────────────────┘
│ (Images with missing Alt-Text)
▼
┌────────────────────────────────────────────────────────┐
│  Tier 3: Computer Vision Layer (MobileNet CNN)         │ ──► [Match Found] ──► [Instant Blur]
│  • Scans raw pixel arrays dynamically inside canvas     │
└────────────────────────────────────────────────────────┘


1. **Tier 1: Heuristic Engine (RegEx):** Instantly scans elements for explicit, case-sensitive word boundaries. It catches exact user-defined matches with near-zero processing lag.
2. **Tier 2: Semantic NLP Layer (Universal Sentence Encoder):** Evaluates sentences mathematically based on structural meaning rather than exact phrasing. For example, if a user flags "blood", the engine successfully isolates related contexts (e.g., *"The patient suffered severe hemorrhaging"*) even if the word "blood" is completely missing.
3. **Tier 3: Computer Vision Layer (MobileNet CNN):** Automatically screens unlabelled images where alternative metadata markers (`alt`) are omitted, classifying features from raw image pixels directly on the client thread.

---

## 🛠️ Project Directory Tree

```text
├── manifest.json       # Extension configuration & script execution manifest
├── popup.html          # User preference dashboard layout (Dark/Yellow Aesthetic)
├── popup.js            # Saves user custom triggers case-sensitively
├── content.js          # Unified Multi-Tier filtering core execution script
└── lib/                # On-device Deep Learning scripts
    ├── tf.min.js       # TensorFlow.js core execution package
    ├── use.min.js      # Universal Sentence Encoder Model library
    └── mobilenet.min.js# MobileNet Computer Vision Model library
⚙️ Installation & Deployment
Since this extension runs fully locally, you can load it into any Chromium-based browser (Chrome, Edge, Brave) using Developer Mode:

Clone the Repository:

Bash
git clone [https://github.com/JD-Shalini-5/SafeBrowse-AI.git](https://github.com/JD-Shalini-5/SafeBrowse-AI.git)
Open Extension Manager: Navigate to chrome://extensions/ inside your browser.

Enable Developer Mode: Toggle the Developer mode switch in the top-right corner.

Load the Project: Click the Load unpacked button in the top-left, and select the project folder containing your manifest.json.

🔧 Technologies Used
Languages: JavaScript (ES6+), HTML5, CSS3

Machine Learning Context: TensorFlow.js Core

NLP Model Base: Universal Sentence Encoder (USE)

Computer Vision Base: MobileNet CNN

API Systems: Web Extensions API (chrome.storage.local, MutationObserver)

Developed by JD Shalini & Rashi Saraswat | Project ID: P 21
Submitted for evaluation to the IEEE Computer Society Bangalore Chapter.
