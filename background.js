// Tab Resource Saver - Background Service
const ALARM_NAME = "checkIdleTabs";

// Update badge counter with number of actively running (in-memory) tabs
async function updateRunningTabsBadge() {
  try {
    const tabs = await browser.tabs.query({});
    const runningCount = tabs.filter(t => !t.discarded).length;
    await browser.action.setBadgeText({ text: runningCount > 0 ? String(runningCount) : "" });
    await browser.action.setBadgeBackgroundColor({ color: "#2563eb" });
    await browser.action.setBadgeTextColor({ color: "#ffffff" });
  } catch (err) {
    console.error("Badge update error:", err);
  }
}

// Check and auto-unload tabs based on inactivity timer
async function processIdleTabs() {
  const settings = await browser.storage.local.get({
    idleThreshold: 15, // minutes
    autoUnloadEnabled: true,
    protectAudio: true,
    protectPinned: true
  });

  if (!settings.autoUnloadEnabled || settings.idleThreshold <= 0) return;

  const tabs = await browser.tabs.query({});
  const now = Date.now();
  const thresholdMs = settings.idleThreshold * 60 * 1000;

  for (const tab of tabs) {
    // Never unload current active tab
    if (tab.active) continue;
    // Already discarded (unloaded)
    if (tab.discarded) continue;
    // Skip pinned tabs if protected
    if (settings.protectPinned && tab.pinned) continue;
    // Skip tabs currently playing media/audio if protected
    if (settings.protectAudio && tab.audible) continue;

    // Check last access time
    const lastActive = tab.lastAccessed || now;
    if (now - lastActive >= thresholdMs) {
      try {
        await browser.tabs.discard(tab.id);
      } catch (e) {
        console.warn(`Could not unload tab #${tab.id}:`, e);
      }
    }
  }

  await updateRunningTabsBadge();
}

// Initialize alarm
browser.alarms.create(ALARM_NAME, { periodInMinutes: 1 });

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    processIdleTabs();
  }
});

// Update badge on any tab lifecycle event
browser.tabs.onActivated.addListener(updateRunningTabsBadge);
browser.tabs.onCreated.addListener(updateRunningTabsBadge);
browser.tabs.onRemoved.addListener(updateRunningTabsBadge);
browser.tabs.onUpdated.addListener(updateRunningTabsBadge);

// Initial badge render
updateRunningTabsBadge();
