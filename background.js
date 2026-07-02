// ==========================================================================
// SafeBrowse AI v2.1
// Background Service Worker
// Handles storage + messaging. All AI compute lives in ai-worker.js,
// which runs per-tab inside the content script context.
// ==========================================================================

const DEFAULT_SETTINGS = {
    userTriggers: [],
    selectedCategories: [],
    sensitivity: 50
};

// --------------------------------------------------------------------------
// Initialize Extension
// --------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(async () => {

    console.log("✅ SafeBrowse AI Initialized");

    const current = await chrome.storage.local.get([
        "userTriggers",
        "selectedCategories",
        "sensitivity"
    ]);

    const updates = {};

    if (!Array.isArray(current.userTriggers))
        updates.userTriggers = DEFAULT_SETTINGS.userTriggers;

    if (!Array.isArray(current.selectedCategories))
        updates.selectedCategories = DEFAULT_SETTINGS.selectedCategories;

    if (typeof current.sensitivity !== "number")
        updates.sensitivity = DEFAULT_SETTINGS.sensitivity;

    if (Object.keys(updates).length > 0) {
        await chrome.storage.local.set(updates);
    }

});

// --------------------------------------------------------------------------
// Message Router
// --------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    if (!message?.type) {

        sendResponse({
            success: false,
            error: "Invalid message."
        });

        return false;

    }

    switch (message.type) {

        // --------------------------------------------------------------
        // Get Settings
        // --------------------------------------------------------------

        case "GET_SETTINGS":

            chrome.storage.local.get(
                [
                    "userTriggers",
                    "selectedCategories",
                    "sensitivity"
                ],
                (result) => {

                    if (chrome.runtime.lastError) {

                        sendResponse({
                            success: false,
                            error: chrome.runtime.lastError.message
                        });

                        return;

                    }

                    sendResponse({

                        success: true,

                        settings: {

                            userTriggers:
                                result.userTriggers ??
                                DEFAULT_SETTINGS.userTriggers,

                            selectedCategories:
                                result.selectedCategories ??
                                DEFAULT_SETTINGS.selectedCategories,

                            sensitivity:
                                result.sensitivity ??
                                DEFAULT_SETTINGS.sensitivity

                        }

                    });

                }
            );

            return true;

        // --------------------------------------------------------------
        // Save Settings
        // --------------------------------------------------------------

        case "SAVE_SETTINGS": {

            const settings = {

                userTriggers: Array.isArray(message.settings?.userTriggers)
                    ? message.settings.userTriggers
                    : DEFAULT_SETTINGS.userTriggers,

                selectedCategories: Array.isArray(message.settings?.selectedCategories)
                    ? message.settings.selectedCategories
                    : DEFAULT_SETTINGS.selectedCategories,

                sensitivity: Number.isFinite(message.settings?.sensitivity)
                    ? message.settings.sensitivity
                    : DEFAULT_SETTINGS.sensitivity

            };

            chrome.storage.local.set(settings, () => {

                if (chrome.runtime.lastError) {

                    sendResponse({
                        success: false,
                        error: chrome.runtime.lastError.message
                    });

                    return;

                }

                sendResponse({
                    success: true
                });

            });

            return true;

        }

        // --------------------------------------------------------------

        default:

            sendResponse({

                success: false,

                error: `Unknown message type: ${message.type}`

            });

            return false;

    }

});