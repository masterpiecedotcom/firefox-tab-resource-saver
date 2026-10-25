// Tab Resource Saver - Popup Controller
let allTabs = [];

function formatTimeAgo(timestamp) {
  if (!timestamp) return "active recently";
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return "active just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `idle ${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  return `idle ${diffHr}h ${diffMin % 60}m`;
}

function getHostName(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return "";
  }
}

async function renderTabs() {
  allTabs = await browser.tabs.query({});
  const filterText = document.getElementById("tabSearch").value.toLowerCase().trim();

  const total = allTabs.length;
  const sleeping = allTabs.filter(t => t.discarded).length;
  const running = total - sleeping;
  // Standard tab consumes ~120MB - 350MB of RAM; est. conservative avg 180MB per unloaded tab
  const estMbSaved = sleeping * 180;

  document.getElementById("totalTabsCount").textContent = total;
  document.getElementById("runningTabsCount").textContent = running;
  document.getElementById("sleepingTabsCount").textContent = sleeping;
  document.getElementById("estRamSaved").textContent = `~${estMbSaved} MB`;

  const tabsList = document.getElementById("tabsList");
  tabsList.innerHTML = "";

  const filtered = allTabs.filter(t => {
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

  // Sort: Active first, then running, then sleeping
  filtered.sort((a, b) => {
    if (a.active) return -1;
    if (b.active) return 1;
    if (!a.discarded && b.discarded) return -1;
    if (a.discarded && !b.discarded) return 1;
    return (b.lastAccessed || 0) - (a.lastAccessed || 0);
  });

  filtered.forEach(tab => {
    const item = document.createElement("div");
    item.className = `tab-item ${tab.active ? "is-active" : ""} ${tab.discarded ? "is-sleeping" : ""}`;

    // Col 1: Favicon + Titles
    const infoCol = document.createElement("div");
    infoCol.className = "tab-info-col";
    infoCol.title = "Click to focus this tab";
    infoCol.addEventListener("click", async () => {
      await browser.tabs.update(tab.id, { active: true });
      await browser.windows.update(tab.windowId, { focused: true });
      window.close();
    });

    const favicon = document.createElement("img");
    favicon.className = "tab-favicon";
    favicon.src = tab.favIconUrl || "icons/icon-48.png";
    favicon.onerror = () => { favicon.src = "icons/icon-48.png"; };

    const textDiv = document.createElement("div");
    textDiv.className = "tab-text";

    const titleDiv = document.createElement("div");
    titleDiv.className = "tab-title";
    // Tab indicator sign in title preview
    const sign = tab.active ? "⭐ " : (tab.discarded ? "💤 " : "🟢 ");
    titleDiv.textContent = sign + (tab.title || "Untitled Tab");

    const metaDiv = document.createElement("div");
    metaDiv.className = "tab-meta";

    // Badges
    if (tab.active) {
      metaDiv.innerHTML += `<span class="badge badge-active">Active</span>`;
    } else if (tab.discarded) {
      metaDiv.innerHTML += `<span class="badge badge-sleeping">0% RAM (Unloaded)</span>`;
    } else {
      metaDiv.innerHTML += `<span class="badge badge-running">Active in RAM</span>`;
    }

    if (tab.audible) {
      metaDiv.innerHTML += `<span class="badge badge-audio">🔊 Playing</span>`;
    }
    if (tab.pinned) {
      metaDiv.innerHTML += `<span class="badge">📌 Pinned</span>`;
    }

    const host = getHostName(tab.url);
    if (host) {
      metaDiv.innerHTML += `<span>• ${host}</span>`;
    }

    metaDiv.innerHTML += `<span>• ${formatTimeAgo(tab.lastAccessed)}</span>`;

    textDiv.appendChild(titleDiv);
    textDiv.appendChild(metaDiv);

    infoCol.appendChild(favicon);
    infoCol.appendChild(textDiv);

    // Col 2: Actions
    const actionsDiv = document.createElement("div");
    actionsDiv.className = "tab-actions";

    // Unload action (only if not active and not already discarded)
    if (!tab.active && !tab.discarded) {
      const unloadBtn = document.createElement("button");
      unloadBtn.className = "btn btn-action";
      unloadBtn.title = "Unload tab from RAM";
      unloadBtn.textContent = "💤 Sleep";
      unloadBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          await browser.tabs.discard(tab.id);
          await renderTabs();
        } catch (err) {
          console.error("Failed to discard:", err);
        }
      });
      actionsDiv.appendChild(unloadBtn);
    }

    // Close action
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
  // Load settings
  const settings = await browser.storage.local.get({ idleThreshold: 15 });
  const select = document.getElementById("idleSelect");
  select.value = String(settings.idleThreshold);

  select.addEventListener("change", async (e) => {
    const val = parseInt(e.target.value, 10);
    await browser.storage.local.set({
      idleThreshold: val,
      autoUnloadEnabled: val > 0
    });
  });

  document.getElementById("tabSearch").addEventListener("input", renderTabs);

  document.getElementById("unloadAllBtn").addEventListener("click", async () => {
    const tabs = await browser.tabs.query({});
    for (const tab of tabs) {
      if (!tab.active && !tab.discarded && !tab.audible) {
        try {
          await browser.tabs.discard(tab.id);
        } catch (err) {
          // Ignore tabs that can't be discarded
        }
      }
    }
    await renderTabs();
  });

  await renderTabs();
});
