(() => {
  "use strict";

  const FAVORITES_KEY = "zhengli:favorites";
  const THEME_KEY = "zhengli:theme";
  const MOBILE_QUERY = "(max-width: 900px)";

  const MODULE_META = {
    "马原": {
      slug: "maya",
      icon: "fa-solid fa-atom",
      description: "马克思主义基本原理"
    },
    "毛概": {
      slug: "maogai",
      icon: "fa-solid fa-flag",
      description: "毛泽东思想与中国特色社会主义理论体系"
    },
    "史纲": {
      slug: "shigang",
      icon: "fa-solid fa-landmark",
      description: "中国近现代史纲要"
    },
    "思修": {
      slug: "sixiu",
      icon: "fa-solid fa-scale-balanced",
      description: "思想道德与法治"
    },
    "时政": {
      slug: "shizheng",
      icon: "fa-solid fa-newspaper",
      description: "形势与政策"
    }
  };

  const allConcepts = [];
  const conceptById = new Map();
  const dom = {};
  const mobileMedia = window.matchMedia(MOBILE_QUERY);

  let favorites = new Set();
  let currentConceptId = "";
  let currentSearchMatches = [];
  let showingFavorites = false;
  let toastTimer = null;
  let overlayTimer = null;

  function buildConceptIndex() {
    Object.entries(concepts).forEach(([moduleName, categories]) => {
      Object.entries(categories).forEach(([categoryName, items]) => {
        items.forEach((concept) => {
          const record = {
            ...concept,
            module: moduleName,
            category: categoryName
          };
          allConcepts.push(record);
          conceptById.set(record.id, record);
        });
      });
    });
  }

  function cacheDom() {
    dom.body = document.body;
    dom.root = document.documentElement;
    dom.moduleList = document.querySelector(".module-list");
    dom.conceptContent = document.getElementById("concept-content");
    dom.mainContent = document.getElementById("main-content");
    dom.searchForm = document.getElementById("search-form");
    dom.searchInput = document.getElementById("concept-search");
    dom.searchResults = document.getElementById("search-results");
    dom.searchResultsTitle = dom.searchResults.querySelector("h2");
    dom.searchResultsList = document.getElementById("search-results-list");
    dom.favoritesButton = document.getElementById("favorites-button");
    dom.favoritesCount = document.getElementById("favorites-count");
    dom.themeToggle = document.getElementById("theme-toggle");
    dom.themeIcon = document.getElementById("theme-icon");
    dom.themeLabel = document.getElementById("theme-label");
    dom.sidebar = document.getElementById("sidebar");
    dom.sidebarToggle = document.getElementById("sidebar-toggle");
    dom.sidebarClose = document.getElementById("sidebar-close");
    dom.sidebarOverlay = document.getElementById("sidebar-overlay");
    dom.toast = document.getElementById("toast");
  }

  function escapeHtml(value) {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };

    return String(value).replace(/[&<>"']/g, (character) => entities[character]);
  }

  function highlightText(text, query) {
    const normalizedText = text.toLocaleLowerCase("zh-CN");
    const normalizedQuery = query.toLocaleLowerCase("zh-CN");
    const matchIndex = normalizedText.indexOf(normalizedQuery);

    if (matchIndex === -1) {
      return escapeHtml(text);
    }

    const matchEnd = matchIndex + query.length;
    return `${escapeHtml(text.slice(0, matchIndex))}<mark class="search-highlight">${escapeHtml(text.slice(matchIndex, matchEnd))}</mark>${escapeHtml(text.slice(matchEnd))}`;
  }

  function readFavorites() {
    try {
      const storedValue = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
      return Array.isArray(storedValue)
        ? storedValue.filter((id) => conceptById.has(id))
        : [];
    } catch (error) {
      return [];
    }
  }

  function saveFavorites() {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
    } catch (error) {
      showToast("浏览器未允许本地存储，收藏仅在当前页面有效。");
    }
  }

  function getInitialTheme() {
    try {
      const savedTheme = localStorage.getItem(THEME_KEY);
      if (savedTheme === "light" || savedTheme === "dark") {
        return savedTheme;
      }
    } catch (error) {
      // 无法读取存储时使用系统主题。
    }

    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  function applyTheme(theme) {
    const isDark = theme === "dark";
    const nextThemeLabel = isDark ? "浅色模式" : "深色模式";

    dom.root.dataset.theme = isDark ? "dark" : "light";
    dom.themeIcon.className = isDark ? "fa-solid fa-sun" : "fa-solid fa-moon";
    dom.themeLabel.textContent = nextThemeLabel;
    dom.themeToggle.setAttribute("aria-label", `切换到${nextThemeLabel}`);
    dom.themeToggle.title = `切换到${nextThemeLabel}`;

    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) {
      themeColor.content = isDark ? "#151817" : "#f7f6f2";
    }
  }

  function toggleTheme() {
    const nextTheme = dom.root.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);

    try {
      localStorage.setItem(THEME_KEY, nextTheme);
    } catch (error) {
      showToast("浏览器未允许本地存储，主题偏好无法保存。");
    }
  }

  function renderNav() {
    dom.moduleList.innerHTML = Object.entries(concepts)
      .map(([moduleName, categories]) => {
        const meta = MODULE_META[moduleName] || {
          slug: `module-${moduleName}`,
          icon: "fa-solid fa-book",
          description: moduleName
        };
        const currentConcept = conceptById.get(currentConceptId);
        const isCurrentModule = currentConcept && currentConcept.module === moduleName;

        const links = Object.entries(categories)
          .flatMap(([categoryName, items]) =>
            items.map((concept) => ({
              ...concept,
              category: categoryName
            }))
          )
          .map((concept) => {
            const isActive = concept.id === currentConceptId;
            const star = favorites.has(concept.id)
              ? '<i class="fa-solid fa-star nav-favorite-star" aria-hidden="true"></i>'
              : "";

            return `
              <li>
                <a
                  class="concept-link${isActive ? " is-active" : ""}"
                  href="#${escapeHtml(concept.id)}"
                  data-concept-id="${escapeHtml(concept.id)}"
                  aria-label="${escapeHtml(concept.name)}${favorites.has(concept.id) ? "，已收藏" : ""}"
                  ${isActive ? 'aria-current="page"' : ""}
                >
                  <span><small class="nav-category">${escapeHtml(concept.category)} · </small>${escapeHtml(concept.name)}</span>
                  ${star}
                </a>
              </li>
            `;
          })
          .join("");

        return `
          <li class="module-item">
            <details class="module" id="module-${escapeHtml(meta.slug)}" ${isCurrentModule ? "open" : ""}>
              <summary>
                <span class="module-title">
                  <i class="${escapeHtml(meta.icon)}" aria-hidden="true"></i>
                  <span>
                    <strong>${escapeHtml(moduleName)}</strong>
                    <small>${escapeHtml(meta.description)}</small>
                  </span>
                </span>
                <i class="fa-solid fa-chevron-down module-chevron" aria-hidden="true"></i>
              </summary>
              <ul class="concept-list">
                ${links || '<li class="concept-empty">内容待补充</li>'}
              </ul>
            </details>
          </li>
        `;
      })
      .join("");
  }

  function updateActiveNav() {
    document.querySelectorAll(".concept-link[data-concept-id]").forEach((link) => {
      const isActive = link.dataset.conceptId === currentConceptId;
      link.classList.toggle("is-active", isActive);

      if (isActive) {
        link.setAttribute("aria-current", "page");
        const parentModule = link.closest("details.module");
        if (parentModule) {
          parentModule.open = true;
        }
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  function getNextConcept(id) {
    const currentIndex = allConcepts.findIndex((concept) => concept.id === id);
    if (currentIndex === -1 || allConcepts.length < 2) {
      return null;
    }
    return allConcepts[(currentIndex + 1) % allConcepts.length];
  }

  function renderConcept(id, updateHistory = true) {
    const concept = conceptById.get(id);
    if (!concept) {
      return;
    }

    currentConceptId = concept.id;
    const isFavorite = favorites.has(concept.id);
    const nextConcept = getNextConcept(concept.id);

    resetResults();

    dom.conceptContent.dataset.currentConcept = concept.id;
    dom.conceptContent.innerHTML = `
      <header class="concept-header">
        <nav class="breadcrumb" aria-label="当前位置">
          <ol>
            <li><a href="#module-${escapeHtml(MODULE_META[concept.module]?.slug || concept.module)}">${escapeHtml(concept.module)}</a></li>
            <li aria-current="page">${escapeHtml(concept.name)}</li>
          </ol>
        </nav>

        <div class="concept-heading-row">
          <div>
            <p class="concept-kicker">${escapeHtml(concept.category)} · 概念自学</p>
            <h1 id="concept-title">${escapeHtml(concept.name)}</h1>
            <p class="concept-summary">从定义、直觉与理论脉络理解“${escapeHtml(concept.name)}”，并把概念放入现实情境中思考。</p>
          </div>
          <button
            class="save-concept-button${isFavorite ? " is-favorite" : ""}"
            id="favorite-concept"
            type="button"
            aria-label="${isFavorite ? "取消收藏" : "收藏"}“${escapeHtml(concept.name)}”"
            aria-pressed="${String(isFavorite)}"
          >
            <i class="${isFavorite ? "fa-solid fa-star" : "fa-regular fa-bookmark"}" aria-hidden="true"></i>
            <span>${isFavorite ? "已收藏" : "收藏概念"}</span>
          </button>
        </div>
      </header>

      <section class="concept-section" id="definition" aria-labelledby="definition-title">
        <div class="section-heading">
          <span class="section-number" aria-hidden="true">01</span>
          <div>
            <p class="section-eyebrow">Definition</p>
            <h2 id="definition-title">概念定义</h2>
          </div>
        </div>
        <div class="section-body">
          <p>${escapeHtml(concept.definition)}</p>
        </div>
      </section>

      <section class="concept-section" id="intuition" aria-labelledby="intuition-title">
        <div class="section-heading">
          <span class="section-number" aria-hidden="true">02</span>
          <div>
            <p class="section-eyebrow">Intuition</p>
            <h2 id="intuition-title">直觉理解</h2>
          </div>
        </div>
        <div class="section-body">
          <div class="example-card">
            <h3><i class="fa-solid fa-lightbulb" aria-hidden="true"></i> 建立直觉</h3>
            <p>${escapeHtml(concept.intuition)}</p>
          </div>
        </div>
      </section>

      <section class="concept-section" id="derivation" aria-labelledby="derivation-title">
        <div
          class="section-heading"
          role="button"
          tabindex="0"
          aria-expanded="false"
          aria-controls="derivation-body"
          aria-label="展开或折叠理论推导"
        >
          <span class="section-number" aria-hidden="true">03</span>
          <div>
            <p class="section-eyebrow">Derivation</p>
            <h2 id="derivation-title">理论推导</h2>
          </div>
        </div>
        <div class="section-body" id="derivation-body">
          <ol class="argument-chain">
            <li><strong>理论脉络：</strong>${escapeHtml(concept.derivation)}</li>
          </ol>
        </div>
      </section>

      <section class="concept-section" id="reality" aria-labelledby="reality-title">
        <div class="section-heading">
          <span class="section-number" aria-hidden="true">04</span>
          <div>
            <p class="section-eyebrow">In Reality</p>
            <h2 id="reality-title">现实联系</h2>
          </div>
        </div>
        <div class="section-body reality-grid">
          <section class="reality-card">
            <i class="fa-solid fa-link" aria-hidden="true"></i>
            <h3>现实案例</h3>
            <p>${escapeHtml(concept.reality)}</p>
          </section>
        </div>
      </section>

      <section class="concept-section" id="application" aria-labelledby="application-title">
        <div class="section-heading">
          <span class="section-number" aria-hidden="true">05</span>
          <div>
            <p class="section-eyebrow">Use &amp; Limits</p>
            <h2 id="application-title">概念用途</h2>
          </div>
        </div>
        <div class="section-body">
          <ul class="use-list">
            <li><strong>用途：</strong>${escapeHtml(concept.usage)}</li>
          </ul>
        </div>
      </section>

      <footer class="concept-footer">
        <p><i class="fa-solid fa-circle-info" aria-hidden="true"></i> 当前内容根据概念数据动态渲染。</p>
        ${nextConcept ? `
          <a class="next-concept" href="#${escapeHtml(nextConcept.id)}" data-concept-id="${escapeHtml(nextConcept.id)}">
            <span>
              <small>下一概念</small>
              <strong>${escapeHtml(nextConcept.name)}</strong>
            </span>
            <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
          </a>
        ` : ""}
      </footer>
    `;

    document.title = `${concept.name}｜政理`;
    updateActiveNav();
    updateFavoritesButton();

    if (updateHistory) {
      history.replaceState(null, "", `#${encodeURIComponent(concept.id)}`);
    }

    if (mobileMedia.matches) {
      closeMobileSidebar();
    }

    dom.mainContent.focus({ preventScroll: true });
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
    });
  }

  function createResultItem(concept, query = "") {
    const name = query
      ? highlightText(concept.name, query)
      : escapeHtml(concept.name);

    return `
      <a class="search-result-item" href="#${escapeHtml(concept.id)}" data-concept-id="${escapeHtml(concept.id)}">
        <strong>${name}</strong>
        <small>${escapeHtml(concept.module)} · ${escapeHtml(concept.category)}</small>
      </a>
    `;
  }

  function resetResults() {
    showingFavorites = false;
    currentSearchMatches = [];
    dom.searchInput.value = "";
    dom.searchResults.hidden = true;
    dom.searchResultsTitle.textContent = "搜索结果";
    dom.searchResultsList.innerHTML = "";
    updateFavoritesButton();
  }

  function renderSearchResults() {
    const query = dom.searchInput.value.trim();
    showingFavorites = false;
    updateFavoritesButton();

    if (!query) {
      currentSearchMatches = [];
      dom.searchResults.hidden = true;
      dom.searchResultsList.innerHTML = "";
      return;
    }

    const normalizedQuery = query.toLocaleLowerCase("zh-CN");
    currentSearchMatches = allConcepts.filter((concept) =>
      concept.name.toLocaleLowerCase("zh-CN").includes(normalizedQuery)
    );

    dom.searchResultsTitle.textContent = `搜索“${query}”`;
    dom.searchResultsList.innerHTML = currentSearchMatches.length
      ? currentSearchMatches.map((concept) => createResultItem(concept, query)).join("")
      : '<p class="empty-results">未找到匹配的概念，请尝试其他关键词。</p>';
    dom.searchResults.hidden = false;
  }

  function renderFavoritesView() {
    showingFavorites = true;
    currentSearchMatches = [];
    dom.searchInput.value = "";

    const favoriteConcepts = allConcepts.filter((concept) => favorites.has(concept.id));
    dom.searchResultsTitle.textContent = "我的收藏";
    dom.searchResultsList.innerHTML = favoriteConcepts.length
      ? favoriteConcepts.map((concept) => createResultItem(concept)).join("")
      : '<p class="empty-results">还没有收藏概念。打开概念卡片，点击“收藏概念”即可添加。</p>';
    dom.searchResults.hidden = false;
    updateFavoritesButton();
  }

  function updateFavoritesButton() {
    dom.favoritesCount.textContent = String(favorites.size);
    dom.favoritesCount.setAttribute("aria-label", `${favorites.size} 个收藏`);
    dom.favoritesButton.setAttribute("aria-pressed", String(showingFavorites));
    dom.favoritesButton.setAttribute("aria-label", showingFavorites ? "关闭收藏列表" : "查看收藏的概念");
    dom.favoritesButton.title = showingFavorites ? "关闭收藏列表" : "查看收藏的概念";

    const icon = dom.favoritesButton.querySelector("i");
    if (icon) {
      icon.className = showingFavorites ? "fa-solid fa-star" : "fa-regular fa-bookmark";
    }
  }

  function updateNavFavoriteStars() {
    document.querySelectorAll(".concept-link[data-concept-id]").forEach((link) => {
      const concept = conceptById.get(link.dataset.conceptId);
      const isFavorite = favorites.has(link.dataset.conceptId);
      const existingStar = link.querySelector(".nav-favorite-star");

      if (isFavorite && !existingStar) {
        const star = document.createElement("i");
        star.className = "fa-solid fa-star nav-favorite-star";
        star.setAttribute("aria-hidden", "true");
        link.appendChild(star);
      } else if (!isFavorite && existingStar) {
        existingStar.remove();
      }

      if (concept) {
        link.setAttribute("aria-label", `${concept.name}${isFavorite ? "，已收藏" : ""}`);
      }
    });
  }

  function updateCurrentFavoriteControl() {
    const button = document.getElementById("favorite-concept");
    if (!button) {
      return;
    }

    const concept = conceptById.get(currentConceptId);
    const isFavorite = favorites.has(currentConceptId);
    button.setAttribute("aria-pressed", String(isFavorite));
    button.setAttribute("aria-label", `${isFavorite ? "取消收藏" : "收藏"}“${concept.name}”`);
    button.classList.toggle("is-favorite", isFavorite);
    button.querySelector("i").className = isFavorite ? "fa-solid fa-star" : "fa-regular fa-bookmark";
    button.querySelector("span").textContent = isFavorite ? "已收藏" : "收藏概念";
  }

  function toggleCurrentFavorite() {
    if (!conceptById.has(currentConceptId)) {
      return;
    }

    const concept = conceptById.get(currentConceptId);
    const willFavorite = !favorites.has(currentConceptId);

    if (willFavorite) {
      favorites.add(currentConceptId);
    } else {
      favorites.delete(currentConceptId);
    }

    saveFavorites();
    updateCurrentFavoriteControl();
    updateNavFavoriteStars();
    updateFavoritesButton();

    if (showingFavorites) {
      renderFavoritesView();
    }

    showToast(willFavorite ? `已收藏“${concept.name}”` : `已取消收藏“${concept.name}”`);
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    dom.toast.textContent = message;
    dom.toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => {
      dom.toast.classList.remove("is-visible");
    }, 2400);
  }

  function toggleDerivation(heading) {
    const section = heading.closest("#derivation");
    const isOpen = section.classList.toggle("is-open");
    heading.setAttribute("aria-expanded", String(isOpen));
  }

  function syncSidebarControls() {
    const isExpanded = mobileMedia.matches
      ? dom.body.classList.contains("sidebar-open")
      : !dom.body.classList.contains("sidebar-collapsed");
    const toggleLabel = mobileMedia.matches ? "展开导航栏" : "展开或收起导航栏";

    dom.sidebarToggle.setAttribute("aria-expanded", String(isExpanded));
    dom.sidebarToggle.setAttribute("aria-label", toggleLabel);
    dom.sidebarClose.setAttribute("aria-expanded", String(isExpanded));
    dom.sidebarClose.setAttribute("aria-label", mobileMedia.matches ? "关闭导航栏" : "收起导航栏");
  }

  function openMobileSidebar() {
    window.clearTimeout(overlayTimer);
    dom.sidebarOverlay.hidden = false;
    dom.body.classList.add("sidebar-open");
    syncSidebarControls();
    dom.sidebarClose.focus();
  }

  function closeMobileSidebar() {
    dom.body.classList.remove("sidebar-open");
    syncSidebarControls();
    window.clearTimeout(overlayTimer);
    overlayTimer = window.setTimeout(() => {
      if (!dom.body.classList.contains("sidebar-open")) {
        dom.sidebarOverlay.hidden = true;
      }
    }, 240);
  }

  function handleSidebarToggle() {
    if (mobileMedia.matches) {
      if (dom.body.classList.contains("sidebar-open")) {
        closeMobileSidebar();
      } else {
        openMobileSidebar();
      }
      return;
    }

    dom.body.classList.toggle("sidebar-collapsed");
    syncSidebarControls();
  }

  function handleSidebarClose() {
    if (mobileMedia.matches) {
      closeMobileSidebar();
      dom.sidebarToggle.focus();
      return;
    }

    dom.body.classList.add("sidebar-collapsed");
    syncSidebarControls();
    dom.sidebarToggle.focus();
  }

  function handleViewportChange() {
    window.clearTimeout(overlayTimer);
    dom.body.classList.remove("sidebar-open", "sidebar-collapsed");
    dom.sidebarOverlay.hidden = true;
    syncSidebarControls();
  }

  function bindEvents() {
    dom.themeToggle.addEventListener("click", toggleTheme);
    dom.searchInput.addEventListener("input", renderSearchResults);
    dom.sidebarToggle.addEventListener("click", handleSidebarToggle);
    dom.sidebarClose.addEventListener("click", handleSidebarClose);
    dom.sidebarOverlay.addEventListener("click", closeMobileSidebar);
    mobileMedia.addEventListener("change", handleViewportChange);

    dom.searchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (currentSearchMatches.length > 0) {
        renderConcept(currentSearchMatches[0].id);
      }
    });

    dom.favoritesButton.addEventListener("click", () => {
      if (showingFavorites) {
        resetResults();
      } else {
        renderFavoritesView();
      }
    });

    document.addEventListener("click", (event) => {
      const favoriteButton = event.target.closest("#favorite-concept");
      if (favoriteButton) {
        toggleCurrentFavorite();
        return;
      }

      const derivationHeading = event.target.closest("#derivation .section-heading");
      if (derivationHeading) {
        toggleDerivation(derivationHeading);
        return;
      }

      const conceptLink = event.target.closest("[data-concept-id]");
      if (conceptLink && conceptById.has(conceptLink.dataset.conceptId)) {
        event.preventDefault();
        renderConcept(conceptLink.dataset.conceptId);
      }
    });

    document.addEventListener("keydown", (event) => {
      const derivationHeading = event.target.closest("#derivation .section-heading");
      if (derivationHeading && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        toggleDerivation(derivationHeading);
        return;
      }

      if (event.key === "Escape") {
        if (dom.body.classList.contains("sidebar-open")) {
          closeMobileSidebar();
          dom.sidebarToggle.focus();
        } else if (dom.searchInput.value || showingFavorites) {
          resetResults();
          dom.searchInput.focus();
        }
      }
    });
  }

  function init() {
    cacheDom();
    buildConceptIndex();
    favorites = new Set(readFavorites());
    applyTheme(getInitialTheme());
    bindEvents();
    handleViewportChange();

    const requestedId = decodeURIComponent(window.location.hash.slice(1));
    const initialConcept = conceptById.has(requestedId)
      ? requestedId
      : allConcepts[0]?.id;

    if (!initialConcept) {
      dom.moduleList.innerHTML = "";
      dom.conceptContent.innerHTML = '<p class="empty-results">暂无概念数据。</p>';
      return;
    }

    currentConceptId = initialConcept;
    renderNav();
    renderConcept(initialConcept, false);
    updateFavoritesButton();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
