// Tab Resource Saver v2.0 - Popup Controller
let currentTabs = [];
let appSettings = {
  autoUnloadEnabled: true,
  idleValue: 15,
  idleUnit: "minutes",
  redIndicatorEnabled: true,
  titleTagEnabled: false,
  lockedTabIds: [],
  whitelistedDomains: [],
  protectAudio: true,
  protectPinned: true
};

function formatTimeAgo(timestamp) {
  if (!timestamp) return "just now";
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ${diffMin % 60}m ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ${diffHr % 24}h ago`;
}

function getHostName(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return "";
  }
}

function isTabProtectedCheck(tab) {
  if (tab.active) return true;
  if (appSettings.lockedTabIds.includes(tab.id)) return true;
  if (appSettings.protectPinned && tab.pinned) return true;
  if (appSettings.protectAudio && tab.audible) return true;

  if (tab.url && appSettings.whitelistedDomains.length > 0) {
    try {
      const host = new URL(tab.url).hostname.toLowerCase();
      return appSettings.whitelistedDomains.some(d => {
        const clean = d.trim().toLowerCase();
        return clean && (host === clean || host.endsWith("." + clean));
      });
    } catch (e) {}
  }
  return false;
}

async function loadSettings() {
  const stored = await browser.storage.local.get(appSettings);
  appSettings = { ...appSettings, ...stored };

  document.getElementById("autoUnloadToggle").checked = appSettings.autoUnloadEnabled;
  document.getElementById("idleNumber").value = appSettings.idleValue;
  document.getElementById("idleUnit").value = appSettings.idleUnit;
  document.getElementById("redIndicatorToggle").checked = appSettings.redIndicatorEnabled;
  document.getElementById("titleTagToggle").checked = appSettings.titleTagEnabled;

  const timerRow = document.getElementById("timerConfigRow");
  if (appSettings.autoUnloadEnabled) {
    timerRow.classList.remove("hidden");
  } else {
    timerRow.classList.add("hidden");
  }

  renderWhitelistTags();
}

function renderWhitelistTags() {
  const container = document.getElementById("whitelistTags");
  container.innerHTML = "";
  appSettings.whitelistedDomains.forEach(domain => {
    const tag = document.createElement("span");
    tag.className = "whitelist-tag";
    tag.textContent = domain + " ";
    const rm = document.createElement("span");
    rm.className = "remove-tag";
    rm.textContent = "✕";
    rm.title = "Remove from whitelist";
    rm.addEventListener("click", async () => {
      appSettings.whitelistedDomains = appSettings.whitelistedDomains.filter(d => d !== domain);
      await browser.storage.local.set({ whitelistedDomains: appSettings.whitelistedDomains });
      renderWhitelistTags();
      renderTabs();
    });
    tag.appendChild(rm);
    container.appendChild(tag);
  });
}

async function renderTabs() {
  // Query all tabs across normal windows
  const allTabs = await browser.tabs.query({});
  currentTabs = allTabs;

  const visibleTabs = allTabs.filter(t => !t.hidden);
  const hiddenCount = allTabs.length - visibleTabs.length;

  const sleeping = allTabs.filter(t => t.discarded).length;
  const running = allTabs.length - sleeping;
  const estMbSaved = sleeping * 180;

  document.getElementById("totalTabsCount").textContent = allTabs.length;
  document.getElementById("totalTabsLbl").textContent = `${visibleTabs.length} visible ${hiddenCount > 0 ? `(${hiddenCount} hidden)` : ''}`;
  document.getElementById("runningTabsCount").textContent = running;
  document.getElementById("sleepingTabsCount").textContent = sleeping;
  document.getElementById("estRamSaved").textContent = `~${estMbSaved} MB`;

  const filterText = document.getElementById("tabSearch").value.toLowerCase().trim();
  const filterType = document.getElementById("tabFilterSelect").value;

  const tabsList = document.getElementById("tabsList");
  tabsList.innerHTML = "";

  const filtered = allTabs.filter(t => {
    const isProtected = isTabProtectedCheck(t);
    if (filterType === "running" && t.discarded) return false;
    if (filterType === "sleeping" && !t.discarded) return false;
    if (filterType === "protected" && !isProtected) return false;

    if (!filterText) return true;
    return (t.title && t.title.toLowerCase().includes(filterText)) ||
           (t.url && t.url.toLowerCase().includes(filterText));
  });

  const emptyNotice = document.getElementById("emptyNotice");
  if (filtered.length === 0) {
    emptyNotice.classList.remove("hidden");
  } else {
    emptyNotice.classList.add("hidden");
  }

  // Sort order: Active tab first, then running tabs, then unloaded
  filtered.sort((a, b) => {
    if (a.active) return -1;
    if (b.active) return 1;
    if (!a.discarded && b.discarded) return -1;
    if (a.discarded && !b.discarded) return 1;
    return (b.lastAccessed || 0) - (a.lastAccessed || 0);
  });

  filtered.forEach(tab => {
    const isProtected = isTabProtectedCheck(tab);
    const isLockedExplicitly = appSettings.lockedTabIds.includes(tab.id);

    const item = document.createElement("div");
    item.className = `tab-item ${tab.active ? "is-active" : ""} ${tab.discarded ? "is-sleeping" : ""}`;

    // Col 1: Tab Info (Click to jump)
    const infoCol = document.createElement("div");
    infoCol.className = "tab-info-col";
    infoCol.title = "Click to jump to this tab";
    infoCol.addEventListener("click", async () => {
      await browser.tabs.update(tab.id, { active: true });
      await browser.windows.update(tab.windowId, { focused: true });
      window.close();
    });

    // Custom Red Circle Indicator
    if (appSettings.redIndicatorEnabled) {
      const dot = document.createElement("span");
      dot.className = `tab-indicator-dot ${tab.discarded ? "sleep-dot" : "red-dot"}`;
      dot.title = tab.discarded ? "Tab is unloaded (sleeping)" : "Tab is active and running in RAM (🔴)";
      infoCol.appendChild(dot);
    }

    const favicon = document.createElement("img");
    favicon.className = "tab-favicon";
    favicon.src = tab.favIconUrl || "icons/icon-48.png";
    favicon.onerror = () => { favicon.src = "icons/icon-48.png"; };
    infoCol.appendChild(favicon);

    const textDiv = document.createElement("div");
    textDiv.className = "tab-text";

    const titleDiv = document.createElement("div");
    titleDiv.className = "tab-title";
    titleDiv.textContent = tab.title || "Untitled Tab";

    const metaDiv = document.createElement("div");
    metaDiv.className = "tab-meta";

    if (tab.active) {
      metaDiv.innerHTML += `<span class="badge badge-active">Active</span>`;
    } else if (tab.discarded) {
      metaDiv.innerHTML += `<span class="badge badge-sleeping">💤 Sleeping</span>`;
    } else {
      metaDiv.innerHTML += `<span class="badge badge-running">🔴 In RAM</span>`;
    }

    if (isProtected) {
      metaDiv.innerHTML += `<span class="badge badge-protected">🛡️ Protected</span>`;
    }
    if (tab.audible) {
      metaDiv.innerHTML += `<span class="badge">🔊 Audio</span>`;
    }
    if (tab.pinned) {
      metaDiv.innerHTML += `<span class="badge">📌 Pinned</span>`;
    }

    const host = getHostName(tab.url);
    if (host) metaDiv.innerHTML += `<span>• ${host}</span>`;
    metaDiv.innerHTML += `<span>• ${formatTimeAgo(tab.lastAccessed)}</span>`;

    textDiv.appendChild(titleDiv);
    textDiv.appendChild(metaDiv);
    infoCol.appendChild(textDiv);

    // Col 2: Actions
    const actionsDiv = document.createElement("div");
    actionsDiv.className = "tab-actions";

    // Lock/Protect toggle button
    const protectBtn = document.createElement("button");
    protectBtn.className = `btn btn-action ${isLockedExplicitly ? "is-protected" : ""}`;
    protectBtn.title = isLockedExplicitly ? "Click to unprotect tab from auto-sleeping" : "Click to protect tab from auto-sleeping";
    protectBtn.textContent = isLockedExplicitly ? "🛡️ Locked" : "🔓 Protect";
    protectBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (isLockedExplicitly) {
        appSettings.lockedTabIds = appSettings.lockedTabIds.filter(id => id !== tab.id);
      } else {
        appSettings.lockedTabIds.push(tab.id);
      }
      await browser.storage.local.set({ lockedTabIds: appSettings.lockedTabIds });
      await renderTabs();
    });
    actionsDiv.appendChild(protectBtn);

    // Sleep button (if tab is running and not the currently active tab)
    if (!tab.active && !tab.discarded) {
      const unloadBtn = document.createElement("button");
      unloadBtn.className = "btn btn-action";
      unloadBtn.title = "Unload tab from RAM immediately";
      unloadBtn.textContent = "💤 Sleep";
      unloadBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          await browser.tabs.discard(tab.id);
          await renderTabs();
        } catch (err) {
          console.error("Could not discard tab:", err);
        }
      });
      actionsDiv.appendChild(unloadBtn);
    }

    // Close button
    const closeBtn = document.createElement("button");
    closeBtn.className = "btn btn-action btn-close";
    closeBtn.title = "Close tab";
    closeBtn.textContent = "✕";
    closeBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await browser.tabs.remove(tab.id);
      await renderTabs();
    });
    actionsDiv.appendChild(closeBtn);

    item.appendChild(infoCol);
    item.appendChild(actionsDiv);
    tabsList.appendChild(item);
  });
}

// Event Listeners
document.addEventListener("DOMContentLoaded", async () => {
  await loadSettings();

  // Settings drawer toggle
  const settingsPanel = document.getElementById("settingsPanel");
  document.getElementById("toggleSettingsBtn").addEventListener("click", () => {
    settingsPanel.classList.toggle("hidden");
  });
  document.getElementById("closeSettingsBtn").addEventListener("click", () => {
    settingsPanel.classList.add("hidden");
  });

  // Auto unload toggle
  document.getElementById("autoUnloadToggle").addEventListener("change", async (e) => {
    appSettings.autoUnloadEnabled = e.target.checked;
    const timerRow = document.getElementById("timerConfigRow");
    if (appSettings.autoUnloadEnabled) {
      timerRow.classList.remove("hidden");
    } else {
      timerRow.classList.add("hidden");
    }
    await browser.storage.local.set({ autoUnloadEnabled: appSettings.autoUnloadEnabled });
  });

  // Idle number & unit change (supports up to 7 days)
  const saveTimer = async () => {
    let val = parseInt(document.getElementById("idleNumber").value, 10) || 15;
    const unit = document.getElementById("idleUnit").value;
    if (unit === "days" && val > 7) val = 7;
    if (val < 1) val = 1;
    document.getElementById("idleNumber").value = val;

    appSettings.idleValue = val;
    appSettings.idleUnit = unit;
    await browser.storage.local.set({ idleValue: val, idleUnit: unit });
  };

  document.getElementById("idleNumber").addEventListener("change", saveTimer);
  document.getElementById("idleUnit").addEventListener("change", saveTimer);

  // Red circle indicator toggle
  document.getElementById("redIndicatorToggle").addEventListener("change", async (e) => {
    appSettings.redIndicatorEnabled = e.target.checked;
    await browser.storage.local.set({ redIndicatorEnabled: appSettings.redIndicatorEnabled });
    await renderTabs();
  });

  // Tab Title Tagging toggle (prepends 🔴 on browser tab bar)
  document.getElementById("titleTagToggle").addEventListener("change", async (e) => {
    appSettings.titleTagEnabled = e.target.checked;
    await browser.storage.local.set({ titleTagEnabled: appSettings.titleTagEnabled });
    
    // Broadcast or update running tabs titles
    const tabs = await browser.tabs.query({});
    for (const t of tabs) {
      if (!t.discarded && t.url && t.url.startsWith("http")) {
        try {
          if (appSettings.titleTagEnabled) {
            await browser.scripting.executeScript({
              target: { tabId: t.id },
              func: () => {
                if (!document.title.startsWith("🔴 ")) {
                  document.title = "🔴 " + document.title;
                }
              }
            });
          } else {
            await browser.scripting.executeScript({
              target: { tabId: t.id },
              func: () => {
                if (document.title.startsWith("🔴 ")) {
                  document.title = document.title.replace(/^🔴\s*/, "");
                }
              }
            });
          }
        } catch (e) {
          // Cross-origin / restricted page
        }
      }
    }
  });

  // Whitelist Add
  const addWhitelist = async () => {
    const input = document.getElementById("whitelistInput");
    const val = input.value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (val && !appSettings.whitelistedDomains.includes(val)) {
      appSettings.whitelistedDomains.push(val);
      await browser.storage.local.set({ whitelistedDomains: appSettings.whitelistedDomains });
      input.value = "";
      renderWhitelistTags();
      await renderTabs();
    }
  };
  document.getElementById("addWhitelistBtn").addEventListener("click", addWhitelist);
  document.getElementById("whitelistInput").addEventListener("keypress", (e) => {
    if (e.key === "Enter") addWhitelist();
  });

  // Search & Filter
  document.getElementById("tabSearch").addEventListener("input", renderTabs);
  document.getElementById("tabFilterSelect").addEventListener("change", renderTabs);

  // Unload All Inactive
  document.getElementById("unloadAllBtn").addEventListener("click", async () => {
    const tabs = await browser.tabs.query({});
    for (const tab of tabs) {
      if (!tab.active && !tab.discarded && !isTabProtectedCheck(tab)) {
        try {
          await browser.tabs.discard(tab.id);
        } catch (err) {
          // Skip
        }
      }
    }
    await renderTabs();
  });

  await renderTabs();
});
