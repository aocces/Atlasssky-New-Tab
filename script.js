const STORAGE_SITES = "sites";
const STORAGE_HISTORY = "history";
const STORAGE_SETTINGS = "settings";

const center = document.querySelector(".center");

const searchForm = document.getElementById("searchForm");
const searchInput = document.getElementById("searchInput");
const suggestPanel = document.getElementById("suggestPanel");
const suggestList = document.getElementById("suggestList");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");

const shortcutBar = document.getElementById("shortcutBar");
const shortcutSection = document.getElementById("shortcutSection");
const addSiteBtn = document.getElementById("addSiteBtn");

const modalOverlay = document.getElementById("modalOverlay");
const addSiteModal = document.getElementById("addSiteModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const cancelAddBtn = document.getElementById("cancelAddBtn");
const confirmAddBtn = document.getElementById("confirmAddBtn");
const siteNameInput = document.getElementById("siteNameInput");
const siteUrlInput = document.getElementById("siteUrlInput");

const settingsBtn = document.getElementById("settingsBtn");
const settingsPanel = document.getElementById("settingsPanel");

const bgSelector = document.getElementById("bgSelector");
const engineSelector = document.getElementById("engineSelector");
const toggleShortcuts = document.getElementById("toggleShortcuts");
const toggleWeather = document.getElementById("toggleWeather");

const weatherBox = document.getElementById("weatherBox");
const weatherText = document.getElementById("weatherText");

const toast = document.getElementById("toast");

/* 不再使用默认建议词 */
const DEFAULT_SUGGESTIONS = [];

const SEARCH_ENGINES = {
  google: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
  bing: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
  duckduckgo: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
  baidu: (q) => `https://www.baidu.com/s?wd=${encodeURIComponent(q)}`
};

let settings = load(STORAGE_SETTINGS, {
  bg: "gradient",
  engine: "google",
  shortcuts: true,
  weather: false
});

let currentSuggestions = [];
let activeSuggestionIndex = -1;
let toastTimer = null;
let suggestRequestId = 0;

/* =========================
   工具函数
========================= */

function load(key, defaultValue) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return defaultValue;
    return JSON.parse(raw);
  } catch (error) {
    return defaultValue;
  }
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function showToast(text) {
  if (!toast) return;

  toast.textContent = text;
  toast.classList.add("show");

  if (toastTimer) clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2000);
}

function debounce(fn, delay = 300) {

  let timer = null;

  return function (...args) {

    clearTimeout(timer);

    timer = setTimeout(() => {
      fn.apply(this, args);
    }, delay);

  };

}

function normalizeUrl(url) {
  const value = url.trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return "https://" + value;
}

function isValidUrl(url) {
  try {
    const parsed = new URL(normalizeUrl(url));
    return Boolean(parsed.hostname);
  } catch (error) {
    return false;
  }
}

function getFaviconUrl(url) {
  try {
    const parsed = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=64`;
  } catch (error) {
    return "";
  }
}

function setSearchActive(isActive) {
  if (!center) return;
  center.classList.toggle("search-active", isActive);
}

/* =========================
   设置
========================= */

function applySettings() {
  document.body.dataset.bg = settings.bg;

  if (bgSelector) bgSelector.value = settings.bg;
  if (engineSelector) engineSelector.value = settings.engine;
  if (toggleShortcuts) toggleShortcuts.checked = settings.shortcuts;
  if (toggleWeather) toggleWeather.checked = settings.weather;

  if (shortcutSection) {
    shortcutSection.classList.toggle("hidden-shortcuts", !settings.shortcuts);
  }

  if (weatherBox) {
    weatherBox.classList.toggle("hidden", !settings.weather);
  }
}

function persistSettings() {
  save(STORAGE_SETTINGS, settings);
}

/* =========================
   搜索历史
========================= */

function getHistory() {
  return load(STORAGE_HISTORY, []);
}

function addHistory(keyword) {
  const value = keyword.trim();
  if (!value) return;

  let history = getHistory();
  history = history.filter((item) => item !== value);
  history.unshift(value);

  save(STORAGE_HISTORY, history.slice(0, 20));
}

function clearHistory() {
  localStorage.removeItem(STORAGE_HISTORY);
}

/* =========================
   搜索建议：搜索引擎接口
========================= */

async function fetchSearchSuggestions(keyword) {
  if (!keyword.trim()) return [];

  const engine = settings.engine;

  try {
    if (engine === "google") {
      const url =
          `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(keyword)}`;

      const res = await fetch(url);
      const data = await res.json();

      return data[1] || [];
    }

    if (engine === "bing") {
      const url =
          `https://api.bing.com/osjson.aspx?query=${encodeURIComponent(keyword)}`;

      const res = await fetch(url);
      const data = await res.json();

      return data[1] || [];
    }

    if (engine === "duckduckgo") {
      const url =
          `https://duckduckgo.com/ac/?q=${encodeURIComponent(keyword)}&type=list`;

      const res = await fetch(url);
      const data = await res.json();

      return Array.isArray(data) ? data.map((item) => item.phrase) : [];
    }

    if (engine === "baidu") {
      const callbackName = "baiduSuggestionCallback";
      const url =
          `https://suggestion.baidu.com/su?wd=${encodeURIComponent(keyword)}&json=1&cb=${callbackName}`;

      const res = await fetch(url);
      const text = await res.text();

      const match = text.match(/baiduSuggestionCallback\((.*)\)/);
      if (!match) return [];

      const data = JSON.parse(match[1]);
      return data.s || [];
    }

    return [];
  } catch (error) {
    console.error("搜索建议失败：", error);
    return [];
  }
}

/* =========================
   搜索建议：整合历史 + 接口建议
========================= */

async function getSuggestions(keyword) {
  const value = keyword.trim().toLowerCase();
  const history = getHistory();

  if (!value) {
    return history.slice(0, 8);
  }

  const matchedHistory = history.filter((item) =>
      item.toLowerCase().includes(value)
  );

  const engineSuggestions = await fetchSearchSuggestions(keyword);

  const merged = [...matchedHistory, ...engineSuggestions];
  return [...new Set(merged)].slice(0, 8);
}

function renderSuggestions(list) {
  if (!suggestList) return;

  suggestList.innerHTML = "";

  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "suggest-empty";
    empty.textContent = "暂无搜索记录";
    suggestList.appendChild(empty);
    return;
  }

  list.forEach((text, index) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "suggest-item";
    btn.dataset.index = String(index);

    btn.innerHTML = `
      <span class="suggest-item-icon">⌕</span>
      <span class="suggest-item-text">${text}</span>
    `;

    btn.addEventListener("mouseenter", () => {
      activeSuggestionIndex = index;
      refreshSuggestionActiveState();
    });

    btn.addEventListener("click", () => {
      searchInput.value = text;
      closeSuggestPanel();

      setTimeout(() => {
        submitSearch(text);
      }, 180);
    });

    suggestList.appendChild(btn);
  });
}

function refreshSuggestionActiveState() {
  if (!suggestList) return;

  const items = suggestList.querySelectorAll(".suggest-item");
  items.forEach((item, index) => {
    item.classList.toggle("active", index === activeSuggestionIndex);
  });
}

async function openSuggestPanel() {
  const requestId = ++suggestRequestId;

  currentSuggestions = await getSuggestions(searchInput.value);

  if (requestId !== suggestRequestId) return;

  activeSuggestionIndex = -1;
  renderSuggestions(currentSuggestions);
  setSearchActive(true);

  if (suggestPanel) {
    requestAnimationFrame(() => {
      suggestPanel.classList.add("active");
    });
  }
}

function closeSuggestPanel() {
  if (suggestPanel) {
    suggestPanel.classList.remove("active");
  }
  activeSuggestionIndex = -1;
  setSearchActive(false);
}

async function updateSuggestPanel() {
  const requestId = ++suggestRequestId;

  currentSuggestions = await getSuggestions(searchInput.value);

  if (requestId !== suggestRequestId) return;

  activeSuggestionIndex = -1;
  renderSuggestions(currentSuggestions);
  setSearchActive(true);

  if (suggestPanel && !suggestPanel.classList.contains("active")) {
    requestAnimationFrame(() => {
      suggestPanel.classList.add("active");
    });
  }
}

const debouncedUpdateSuggestPanel =
    debounce(updateSuggestPanel, 300);

function submitSearch(keyword) {
  const q = keyword.trim();
  if (!q) return;

  addHistory(q);
  closeSuggestPanel();

  const engine = SEARCH_ENGINES[settings.engine] ? settings.engine : "google";
  const url = SEARCH_ENGINES[engine](q);

  setTimeout(() => {
    location.href = url;
  }, 120);
}

/* =========================
   快捷网站
========================= */

function getSites() {
  return load(STORAGE_SITES, []);
}

function saveSites(data) {
  save(STORAGE_SITES, data);
}

function renderSites() {
  if (!shortcutBar) return;

  shortcutBar.innerHTML = "";
  const sites = getSites();

  sites.forEach((site, index) => {
    const link = document.createElement("a");
    link.href = site.url;
    link.className = "shortcut-item";
    link.title = site.title;
    link.target = "_self";

    link.innerHTML = `
      <img class="shortcut-favicon" src="${getFaviconUrl(site.url)}" alt="">
      <span class="shortcut-title">${site.title}</span>
      <button class="shortcut-delete" type="button" aria-label="删除 ${site.title}">×</button>
    `;

    const deleteBtn = link.querySelector(".shortcut-delete");
    deleteBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      deleteSite(index, link);
    });

    shortcutBar.appendChild(link);
  });
}

function deleteSite(index, element) {
  if (element) {
    element.classList.add("removing");
    setTimeout(() => {
      const sites = getSites();
      sites.splice(index, 1);
      saveSites(sites);
      renderSites();
      showToast("已删除网站");
    }, 220);
    return;
  }

  const sites = getSites();
  sites.splice(index, 1);
  saveSites(sites);
  renderSites();
  showToast("已删除网站");
}

/* =========================
   添加网站弹窗
========================= */

function updateAddButtonState() {
  const valid =
      siteNameInput &&
      siteUrlInput &&
      siteNameInput.value.trim() &&
      isValidUrl(siteUrlInput.value);

  if (!confirmAddBtn) return;

  confirmAddBtn.disabled = !valid;
  confirmAddBtn.classList.toggle("enabled", Boolean(valid));
}

function openModal() {
  if (!modalOverlay) return;

  modalOverlay.classList.add("active");

  if (siteNameInput) siteNameInput.value = "";
  if (siteUrlInput) siteUrlInput.value = "";

  updateAddButtonState();

  setTimeout(() => {
    if (siteNameInput) siteNameInput.focus();
  }, 0);
}

function closeModal() {
  if (!modalOverlay) return;
  modalOverlay.classList.remove("active");
}

function addSite() {
  const title = siteNameInput.value.trim();
  const url = normalizeUrl(siteUrlInput.value);

  if (!title || !isValidUrl(url)) return;

  const sites = getSites();
  sites.push({ title, url });
  saveSites(sites);
  renderSites();
  closeModal();
  showToast("网站已添加");
}

/* =========================
   设置面板
========================= */

function closeSettingsPanel() {
  if (settingsPanel) {
    settingsPanel.classList.remove("active");
  }
}

function toggleSettingsPanel() {
  if (settingsPanel) {
    settingsPanel.classList.toggle("active");
  }
}

function refreshWeatherView() {
  if (!weatherBox) return;

  weatherBox.classList.toggle("hidden", !settings.weather);

  if (!settings.weather) return;

  if (typeof initWeather === "function") {
    initWeather();
  } else if (weatherText) {
    weatherText.textContent = "天气加载中...";
  }
}

/* =========================
   绑定事件
========================= */

if (bgSelector) {
  bgSelector.addEventListener("change", () => {
    settings.bg = bgSelector.value;
    persistSettings();
    applySettings();
  });
}

if (engineSelector) {
  engineSelector.addEventListener("change", () => {
    settings.engine = engineSelector.value;
    persistSettings();
  });
}

if (toggleShortcuts) {
  toggleShortcuts.addEventListener("change", () => {
    settings.shortcuts = toggleShortcuts.checked;
    persistSettings();
    applySettings();
  });
}

if (toggleWeather) {
  toggleWeather.addEventListener("change", () => {
    settings.weather = toggleWeather.checked;
    persistSettings();
    applySettings();
    refreshWeatherView();
  });
}

if (searchForm) {
  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitSearch(searchInput.value);
  });
}

if (searchInput) {
  searchInput.addEventListener("focus", () => {
    openSuggestPanel();
  });

  searchInput.addEventListener("input", () => {
    debouncedUpdateSuggestPanel();
  });

  searchInput.addEventListener("keydown", (event) => {
    if (!suggestPanel || !suggestPanel.classList.contains("active")) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!currentSuggestions.length) return;

      activeSuggestionIndex =
          (activeSuggestionIndex + 1) % currentSuggestions.length;

      refreshSuggestionActiveState();
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!currentSuggestions.length) return;

      activeSuggestionIndex =
          activeSuggestionIndex <= 0
              ? currentSuggestions.length - 1
              : activeSuggestionIndex - 1;

      refreshSuggestionActiveState();
    }

    if (
        event.key === "Enter" &&
        activeSuggestionIndex >= 0 &&
        currentSuggestions[activeSuggestionIndex]
    ) {
      event.preventDefault();

      const selected = currentSuggestions[activeSuggestionIndex];
      searchInput.value = selected;
      closeSuggestPanel();

      setTimeout(() => {
        submitSearch(selected);
      }, 180);
    }

    if (event.key === "Escape") {
      closeSuggestPanel();
      searchInput.blur();
    }
  });
}

if (clearHistoryBtn) {
  clearHistoryBtn.addEventListener("click", () => {
    clearHistory();
    currentSuggestions = [];
    activeSuggestionIndex = -1;
    if (searchInput) searchInput.value = "";
    renderSuggestions([]);
    showToast("历史记录已清除");
  });
}

if (addSiteBtn) {
  addSiteBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    openModal();
  });
}

if (closeModalBtn) closeModalBtn.addEventListener("click", closeModal);
if (cancelAddBtn) cancelAddBtn.addEventListener("click", closeModal);
if (siteNameInput) siteNameInput.addEventListener("input", updateAddButtonState);
if (siteUrlInput) siteUrlInput.addEventListener("input", updateAddButtonState);
if (confirmAddBtn) confirmAddBtn.addEventListener("click", addSite);

if (settingsBtn) {
  settingsBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleSettingsPanel();
  });
}

document.addEventListener("click", (event) => {
  const clickedInsideSearch =
      (searchForm && searchForm.contains(event.target)) ||
      (suggestPanel && suggestPanel.contains(event.target));

  if (!clickedInsideSearch) {
    closeSuggestPanel();
  }

  const clickedInsideSettings =
      settingsPanel && settingsPanel.contains(event.target);
  const clickedOnSettingsBtn =
      settingsBtn && settingsBtn.contains(event.target);

  if (!clickedInsideSettings && !clickedOnSettingsBtn) {
    closeSettingsPanel();
  }

  if (modalOverlay && modalOverlay.classList.contains("active")) {
    const clickedInsideModal =
        addSiteModal && addSiteModal.contains(event.target);

    if (!clickedInsideModal && event.target === modalOverlay) {
      closeModal();
    }
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;

  if (modalOverlay && modalOverlay.classList.contains("active")) {
    closeModal();
  }

  closeSettingsPanel();
  closeSuggestPanel();
});

/* =========================
   初始化
========================= */

function init() {
  applySettings();
  renderSites();
  refreshWeatherView();

  setTimeout(() => {
    if (searchInput) searchInput.focus();
  }, 80);
}

init();