const input = document.getElementById('triggerInput');
const saveBtn = document.getElementById('saveBtn');
const status = document.getElementById('status');

// Retrieve saved fears upon opening
chrome.storage.local.get(['userTriggers'], (result) => {
  if (result.userTriggers && result.userTriggers.length > 0) {
    input.value = result.userTriggers.join(', ');
  }
});

// Write fears safely to browser cache
saveBtn.addEventListener('click', () => {
  const formattedArray = input.value
    .split(',')
    .map(t => t.trim()) // FIXED: Removed .toLowerCase() to fully preserve exact casings
    .filter(t => t.length > 0);
  
  chrome.storage.local.set({ userTriggers: formattedArray }, () => {
    input.value = formattedArray.join(', '); // Update textbox UI state cleanly
    status.className = "status success";
    status.innerText = "Preferences updated!";
    setTimeout(() => { status.innerText = ""; }, 2000);
  });
});