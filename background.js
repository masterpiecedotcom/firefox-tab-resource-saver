// Tab Resource Saver v2.0 - Background Service
const ALARM_NAME = "checkIdleTabs";

// Calculate threshold in milliseconds based on user unit
function calculateThresholdMs(val, unit) {
  const num = Math.max(1, parseInt(val, 10) || 15);
  if (unit === "hours") return num * 60 * 60 * 1000;
  if (unit === "days") return Math.min(num, 7) * 24 * 60 * 60 * 1000;
  return num * 60 * 1000; // minutes
}

// Update toolbar badge showing number of active tabs in RAM
async function updateRunningTabsBadge() {
  try {
    const tabs = await browser.tabs.query({});
    const visibleRunning = tabs.filter(t => !t.discarded && !t.hidden).length;
    await browser.action.setBadgeText({ text: visibleRunning > 0 ? String(visibleRunning) : "" });
    await browser.action.setBadgeBackgroundColor({ color: "#dc2626" }); // Red badge to match indicator
    await browser.action.setBadgeTextColor({ color: "#ffffff" });
  } catch (err) {
    console.error("Badge update error:", err);
  }
}

// Check whether tab or its domain is whitelisted from auto-sleep
function isTabProtected(tab, settings) {
  if (tab.active) return true;
  if (settings.protectPinned && tab.pinned) return true;
  if (settings.protectAudio && tab.audible) return true;

  // Specific tab lock
  if (settings.lockedTabIds && settings.lockedTabIds.includes(tab.id)) {
    return true;
  }

  // Domain whitelist check
  if (tab.url && settings.whitelistedDomains && settings.whitelistedDomains.length > 0) {
    try {
      const hostname = new URL(tab.url).hostname.toLowerCase();
      const isDomainWhitelisted = settings.whitelistedDomains.some(d => {
        const cleanDomain = d.trim().toLowerCase();
        return cleanDomain && (hostname === cleanDomain || hostname.endsWith("." + cleanDomain));
      });
      if (isDomainWhitelisted) return true;
    } catch (e) {
      // Internal or invalid URL
    }
  }

  return false;
}

// Inactivity timer auto-unload runner
async function processIdleTabs() {
  const settings = await browser.storage.local.get({
    autoUnloadEnabled: true,
    idleValue: 15,
    idleUnit: "minutes",
    protectAudio: true,
    protectPinned: true,
    lockedTabIds: [],
    whitelistedDomains: []
  });

  if (!settings.autoUnloadEnabled) return;

  const thresholdMs = calculateThresholdMs(settings.idleValue, settings.idleUnit);
  const now = Date.now();
  const tabs = await browser.tabs.query({});

  for (const tab of tabs) {
    if (tab.discarded) continue;
    if (isTabProtected(tab, settings)) continue;

    const lastActive = tab.lastAccessed || now;
    if (now - lastActive >= thresholdMs) {
      try {
        await browser.tabs.discard(tab.id);
      } catch (err) {
        console.warn(`Could not unload tab #${tab.id}:`, err);
      }
    }
  }

  await updateRunningTabsBadge();
}

// Setup periodic check alarm (runs every minute)
browser.alarms.create(ALARM_NAME, { periodInMinutes: 1 });

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    processIdleTabs();
  }
});

// Tab lifecycle events
browser.tabs.onActivated.addListener(updateRunningTabsBadge);
browser.tabs.onCreated.addListener(updateRunningTabsBadge);
browser.tabs.onRemoved.addListener(updateRunningTabsBadge);
browser.tabs.onUpdated.addListener(updateRunningTabsBadge);

updateRunningTabsBadge();
