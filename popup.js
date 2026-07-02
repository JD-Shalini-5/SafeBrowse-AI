// ==========================================================================
// SafeBrowse AI - Popup Controller
// Handles user preferences and communicates with background.js
// ==========================================================================

const input = document.getElementById("triggerInput");
const saveBtn = document.getElementById("saveBtn");
const status = document.getElementById("status");
const sensitivitySlider = document.getElementById("sensitivity");

const categoryCheckboxes = document.querySelectorAll(
    'input[type="checkbox"][id^="cat-"]'
);

// --------------------------------------------------------------------------
// Load Saved Settings
// --------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {

    chrome.runtime.sendMessage(
        {
            type: "GET_SETTINGS"
        },
        (response) => {

            if (!response || !response.success) return;

            const settings = response.settings;

            // Restore custom triggers
            input.value = (settings.userTriggers || []).join(", ");

            // Restore sensitivity
            sensitivitySlider.value = settings.sensitivity || 50;

            // Restore selected categories
            const selected = settings.selectedCategories || [];

            categoryCheckboxes.forEach((checkbox) => {
                checkbox.checked = selected.includes(checkbox.value);
            });

        }
    );

});

// --------------------------------------------------------------------------
// Save Settings
// --------------------------------------------------------------------------

saveBtn.addEventListener("click", () => {

    // Remove duplicates while preserving first entered capitalization
    const uniqueMap = new Map();

    input.value
        .split(",")
        .map(trigger => trigger.trim())
        .filter(trigger => trigger.length > 0)
        .forEach(trigger => {

            const lower = trigger.toLowerCase();

            if (!uniqueMap.has(lower)) {
                uniqueMap.set(lower, trigger);
            }

        });

    const userTriggers = [...uniqueMap.values()];

    const selectedCategories = [];

    categoryCheckboxes.forEach((checkbox) => {

        if (checkbox.checked) {
            selectedCategories.push(checkbox.value);
        }

    });

    const sensitivity = Number(sensitivitySlider.value);

    chrome.runtime.sendMessage({

        type: "SAVE_SETTINGS",

        settings: {

            userTriggers,
            selectedCategories,
            sensitivity

        }

    }, (response) => {

        if (!response || !response.success) {

            status.className = "status";
            status.innerText = "Failed to save settings.";
            return;

        }

        input.value = userTriggers.join(", ");

        status.className = "status success";
        status.innerText = "Preferences saved successfully!";

        setTimeout(() => {

            status.innerText = "";

        }, 2000);

    });

});