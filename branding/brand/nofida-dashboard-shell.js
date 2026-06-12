(function () {
  "use strict";

  if (window.NofidaDashboardShell) return;

  const FEATUREABLE_STATUSES = new Set([
    "vendored",
    "ready_to_vendor",
    "preseed-pending",
    "internal-file"
  ]);
  const STATE = {
    catalogPromise: null,
    catalogData: null,
    panelRoot: null,
    panelFilter: "all",
    panelQuery: "",
    focusItemId: null,
    showcaseTimer: null
  };

  const STRINGS = {
    ru: {
      sidebarTitle: "Каталог NOFIDA",
      sidebarSubtitle: "Внутренние библиотеки и шаблоны",
      openCatalog: "Открыть каталог",
      curatedCount: "проверено",
      featuredCount: "подобрано",
      showcaseTitle: "Библиотеки и шаблоны",
      showcaseDescription: "Курируемые наборы для внутреннего потока NOFIDA без ухода в внешний Hub.",
      showcaseCta: "Открыть каталог",
      showcasePrev: "Назад",
      showcaseNext: "Далее",
      panelTitle: "Внутренний каталог NOFIDA",
      panelSubtitle: "Открывайте библиотеки, шаблоны и наборы иконок внутри текущего пространства.",
      panelClose: "Закрыть каталог",
      searchPlaceholder: "Поиск по названию, автору или типу",
      clearSearch: "Сбросить",
      filterAll: "Все",
      filterLibrary: "Библиотеки",
      filterTemplate: "Шаблоны",
      filterIcons: "Иконки",
      filterSystems: "Системы",
      filterUx: "UX",
      badgeCatalog: "В каталоге",
      badgeInternal: "Доступно внутри NOFIDA",
      badgeReview: "Нужна проверка",
      badgeBlocked: "Заблокировано",
      actionView: "Смотреть",
      actionOpen: "Открыть",
      openInternalFile: "Открыть внутренний файл",
      noResults: "Подходящие элементы не найдены. Попробуйте другой фильтр или запрос.",
      statusLabel: "Статус",
      sourceLabel: "Источник",
      licenseLabel: "Лицензия",
      importLabel: "Режим импорта",
      authorLabel: "Автор",
      cardEyebrowCreate: "Создание",
      cardEyebrowImport: "Импорт",
      cardEyebrowCatalog: "Каталог NOFIDA",
      cardHintCreate: "Новый документ",
      cardHintImport: "Импорт .penpot",
      cardHintCatalog: "Внутренние наборы",
      availabilityInternal: "Внутри NOFIDA",
      availabilityCatalog: "Доступно в каталоге",
      typeDesignSystem: "Design system",
      typeLibrary: "Библиотека",
      typeTemplate: "Шаблон",
      typeUiKit: "UI kit",
      typeIconSet: "Набор иконок",
      typeUx: "UX",
      typeDefault: "Каталог",
      importModeManual: "Ручной импорт",
      importModePreseed: "Ожидает preseeding",
      importModeInternal: "Внутренний файл",
      importModeDefault: "Каталожная запись"
    },
    en: {
      sidebarTitle: "NOFIDA Catalog",
      sidebarSubtitle: "Internal libraries and templates",
      openCatalog: "Open catalog",
      curatedCount: "reviewed",
      featuredCount: "featured",
      showcaseTitle: "Libraries and templates",
      showcaseDescription: "Curated assets for the internal NOFIDA flow without sending users to the external Hub.",
      showcaseCta: "Open catalog",
      showcasePrev: "Previous",
      showcaseNext: "Next",
      panelTitle: "NOFIDA Internal Catalog",
      panelSubtitle: "Browse libraries, templates, and icon packs inside the current NOFIDA workspace.",
      panelClose: "Close catalog",
      searchPlaceholder: "Search by name, author, or type",
      clearSearch: "Clear",
      filterAll: "All",
      filterLibrary: "Libraries",
      filterTemplate: "Templates",
      filterIcons: "Icon sets",
      filterSystems: "Systems",
      filterUx: "UX",
      badgeCatalog: "Available in catalog",
      badgeInternal: "Internally available",
      badgeReview: "Needs review",
      badgeBlocked: "Blocked",
      actionView: "View",
      actionOpen: "Open",
      openInternalFile: "Open internal file",
      noResults: "No matching catalog items yet. Try another filter or search term.",
      statusLabel: "Status",
      sourceLabel: "Source",
      licenseLabel: "License",
      importLabel: "Import mode",
      authorLabel: "Author",
      cardEyebrowCreate: "Creation",
      cardEyebrowImport: "Import",
      cardEyebrowCatalog: "NOFIDA Catalog",
      cardHintCreate: "New document",
      cardHintImport: "Import .penpot",
      cardHintCatalog: "Internal kits",
      availabilityInternal: "Inside NOFIDA",
      availabilityCatalog: "Catalog metadata",
      typeDesignSystem: "Design system",
      typeLibrary: "Library",
      typeTemplate: "Template",
      typeUiKit: "UI kit",
      typeIconSet: "Icon set",
      typeUx: "UX",
      typeDefault: "Catalog",
      importModeManual: "Manual import",
      importModePreseed: "Preseed pending",
      importModeInternal: "Internal file",
      importModeDefault: "Catalog entry"
    }
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getLocale() {
    const librariesLabel = document.querySelector("[data-testid='libs-link-sidebar'] .main_ui_dashboard_sidebar__element-title")?.textContent ?? "";
    return /[А-Яа-яЁё]/.test(librariesLabel) ? "ru" : "en";
  }

  function strings() {
    return STRINGS[getLocale()] || STRINGS.en;
  }

  function typeLabel(item, localeStrings) {
    switch (item.type) {
      case "design-system":
        return localeStrings.typeDesignSystem;
      case "library":
        return localeStrings.typeLibrary;
      case "template":
        return localeStrings.typeTemplate;
      case "ui-kit":
        return localeStrings.typeUiKit;
      case "icon-set":
        return localeStrings.typeIconSet;
      case "ux":
        return localeStrings.typeUx;
      default:
        return localeStrings.typeDefault;
    }
  }

  function importModeLabel(item, localeStrings) {
    switch (item.import_mode) {
      case "manual-from-hub":
        return localeStrings.importModeManual;
      case "preseed-pending":
        return localeStrings.importModePreseed;
      case "internal-file":
        return localeStrings.importModeInternal;
      default:
        return localeStrings.importModeDefault;
    }
  }

  function inventoryThumbnail(item) {
    return "/images/thumbnails/template-" + encodeURIComponent(item.id) + ".jpg";
  }

  function statusBadge(item, localeStrings) {
    if (item.internal_url) return localeStrings.badgeInternal;
    if (item.status === "needs_license_review") return localeStrings.badgeReview;
    if (item.status === "skip") return localeStrings.badgeBlocked;
    return localeStrings.badgeCatalog;
  }

  function statusClass(item) {
    if (item.internal_url) return "is-internal";
    if (item.status === "needs_license_review") return "is-review";
    if (item.status === "skip") return "is-blocked";
    return "is-catalog";
  }

  function featuredScore(item) {
    let score = 0;
    if (item.internal_url) score += 80;
    if (item.status === "vendored") score += 55;
    if (item.author === "Penpot") score += 40;
    if (item.type === "template") score += 26;
    if (item.type === "icon-set") score += 24;
    if (item.type === "design-system") score += 22;
    if (item.type === "ui-kit") score += 18;
    if (/MIT|ISC|Apache-2\.0|CC-BY-4\.0/i.test(item.license || "")) score += 18;
    if (item.status === "ready_to_vendor") score += 16;
    if (item.status === "preseed-pending") score += 10;
    return score;
  }

  async function loadCatalog() {
    if (STATE.catalogPromise) return STATE.catalogPromise;

    STATE.catalogPromise = Promise.all([
      fetch("/nofida/libraries/catalog.json", { cache: "no-store" }).then((res) => {
        if (!res.ok) throw new Error("catalog.json request failed");
        return res.json();
      }),
      fetch("/nofida/libraries/penpot-hub.inventory.json", { cache: "no-store" }).then((res) => {
        if (!res.ok) throw new Error("penpot-hub.inventory.json request failed");
        return res.json();
      })
    ]).then(([catalog, inventory]) => {
      const inventoryById = new Map((inventory.items || []).map((item) => [item.id, item]));
      const items = (catalog.libraries || []).map((item) => {
        const inventoryItem = inventoryById.get(item.id) || {};
        return {
          ...inventoryItem,
          ...item,
          title: item.name || inventoryItem.title || item.id,
          displayType: item.type || inventoryItem.type || "catalog",
          internalReady: Boolean(item.internal_url),
          featureable: FEATUREABLE_STATUSES.has(item.status),
          thumbnail_url: inventoryThumbnail(item)
        };
      });

      const featured = items
        .filter((item) => item.featureable && item.status !== "skip")
        .sort((left, right) => {
          return featuredScore(right) - featuredScore(left) || left.title.localeCompare(right.title);
        });

      const typeCounts = items.reduce((acc, item) => {
        acc[item.type] = (acc[item.type] || 0) + 1;
        return acc;
      }, {});

      const statusCounts = items.reduce((acc, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1;
        return acc;
      }, {});

      STATE.catalogData = {
        catalog,
        inventory,
        items,
        featured,
        inventoryCount: inventory.items_count || (inventory.items || []).length,
        curatedCount: items.length,
        typeCounts,
        statusCounts
      };

      return STATE.catalogData;
    });

    return STATE.catalogPromise;
  }

  function isDashboardVisible() {
    return Boolean(
      document.querySelector(".main_ui_dashboard__dashboard-content") &&
        document.querySelector(".main_ui_dashboard_sidebar__dashboard-sidebar")
    );
  }

  function openPanel(focusItemId) {
    const panel = ensurePanel();
    STATE.focusItemId = focusItemId || null;
    panel.hidden = false;
    panel.classList.add("is-open");
    document.body.classList.add("nofida-library-panel-open");
    renderPanelList();
  }

  function closePanel() {
    if (!STATE.panelRoot) return;
    STATE.panelRoot.classList.remove("is-open");
    STATE.panelRoot.hidden = true;
    document.body.classList.remove("nofida-library-panel-open");
    STATE.focusItemId = null;
  }

  function ensurePanel() {
    if (STATE.panelRoot) return STATE.panelRoot;

    const panel = document.createElement("div");
    panel.id = "nofida-library-panel";
    panel.className = "nofida-library-panel";
    panel.hidden = true;
    panel.innerHTML = [
      '<button type="button" class="nofida-library-panel__backdrop" data-nofida-close-panel aria-label="Close"></button>',
      '<aside class="nofida-library-panel__surface" role="dialog" aria-modal="true" aria-label="NOFIDA catalog">',
      '  <div class="nofida-library-panel__header">',
      '    <div>',
      '      <p class="nofida-library-panel__eyebrow">NOFIDA</p>',
      '      <h2 class="nofida-library-panel__title"></h2>',
      '      <p class="nofida-library-panel__subtitle"></p>',
      '    </div>',
      '    <button type="button" class="nofida-library-panel__close" data-nofida-close-panel>×</button>',
      "  </div>",
      '  <div class="nofida-library-panel__stats"></div>',
      '  <div class="nofida-library-panel__toolbar">',
      '    <input type="search" class="nofida-library-panel__search" />',
      '    <button type="button" class="nofida-library-panel__clear" data-nofida-clear-search>Clear</button>',
      "  </div>",
      '  <div class="nofida-library-panel__filters"></div>',
      '  <div class="nofida-library-panel__list"></div>',
      " </aside>"
    ].join("");

    panel.addEventListener("click", (event) => {
      const closeTrigger = event.target.closest("[data-nofida-close-panel]");
      if (closeTrigger) {
        event.preventDefault();
        closePanel();
        return;
      }

      const openItem = event.target.closest("[data-nofida-item-id]");
      if (openItem && !event.target.closest("a")) {
        const itemId = openItem.getAttribute("data-nofida-item-id");
        if (itemId) {
          STATE.focusItemId = itemId;
          renderPanelList();
        }
      }
    });

    panel.querySelector(".nofida-library-panel__search").addEventListener("input", (event) => {
      STATE.panelQuery = event.target.value.trim().toLowerCase();
      renderPanelList();
    });

    panel.querySelector("[data-nofida-clear-search]").addEventListener("click", () => {
      STATE.panelQuery = "";
      const search = panel.querySelector(".nofida-library-panel__search");
      search.value = "";
      renderPanelList();
    });

    panel.querySelector(".nofida-library-panel__filters").addEventListener("click", (event) => {
      const filter = event.target.closest("[data-nofida-filter]");
      if (!filter) return;
      STATE.panelFilter = filter.getAttribute("data-nofida-filter");
      renderPanelList();
    });

    document.body.appendChild(panel);
    STATE.panelRoot = panel;
    return panel;
  }

  function filteredItems() {
    if (!STATE.catalogData) return [];
    const query = STATE.panelQuery;
    const filter = STATE.panelFilter;
    return STATE.catalogData.items.filter((item) => {
      if (item.status === "skip") return false;
      if (filter !== "all") {
        if (filter === "icons" && item.type !== "icon-set") return false;
        if (filter === "systems" && item.type !== "design-system" && item.type !== "ui-kit") return false;
        if (filter === "ux" && item.type !== "ux") return false;
        if (filter === "library" && item.type !== "library") return false;
        if (filter === "template" && item.type !== "template") return false;
      }
      if (!query) return true;
      const haystack = [
        item.title,
        item.author,
        item.type,
        item.source,
        item.license,
        item.risk_notes
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }

  function renderPanelList() {
    if (!STATE.panelRoot || !STATE.catalogData) return;

    const localeStrings = strings();
    const visibleItems = filteredItems();
    const stats = STATE.panelRoot.querySelector(".nofida-library-panel__stats");
    const title = STATE.panelRoot.querySelector(".nofida-library-panel__title");
    const subtitle = STATE.panelRoot.querySelector(".nofida-library-panel__subtitle");
    const search = STATE.panelRoot.querySelector(".nofida-library-panel__search");
    const clear = STATE.panelRoot.querySelector(".nofida-library-panel__clear");
    const closeButton = STATE.panelRoot.querySelector(".nofida-library-panel__close");
    const backdrop = STATE.panelRoot.querySelector(".nofida-library-panel__backdrop");
    const filters = STATE.panelRoot.querySelector(".nofida-library-panel__filters");
    const list = STATE.panelRoot.querySelector(".nofida-library-panel__list");

    title.textContent = localeStrings.panelTitle;
    subtitle.textContent = localeStrings.panelSubtitle;
    search.placeholder = localeStrings.searchPlaceholder;
    clear.textContent = localeStrings.clearSearch;
    closeButton.setAttribute("title", localeStrings.panelClose);
    closeButton.setAttribute("aria-label", localeStrings.panelClose);
    backdrop.setAttribute("aria-label", localeStrings.panelClose);

    stats.innerHTML = [
      '<div class="nofida-library-panel__stat">',
      "  <strong>" + escapeHtml(STATE.catalogData.curatedCount) + "</strong>",
      "  <span>" + escapeHtml(localeStrings.featuredCount) + "</span>",
      "</div>",
      '<div class="nofida-library-panel__stat">',
      "  <strong>" + escapeHtml(STATE.catalogData.inventoryCount) + "</strong>",
      "  <span>" + escapeHtml(localeStrings.curatedCount) + "</span>",
      "</div>",
      '<div class="nofida-library-panel__stat">',
      "  <strong>" + escapeHtml(STATE.catalogData.statusCounts.ready_to_vendor || 0) + "</strong>",
      "  <span>" + escapeHtml(localeStrings.badgeCatalog) + "</span>",
      "</div>"
    ].join("");

    filters.innerHTML = [
      { id: "all", label: localeStrings.filterAll },
      { id: "library", label: localeStrings.filterLibrary },
      { id: "template", label: localeStrings.filterTemplate },
      { id: "icons", label: localeStrings.filterIcons },
      { id: "systems", label: localeStrings.filterSystems },
      { id: "ux", label: localeStrings.filterUx }
    ]
      .map((filter) => {
        const active = STATE.panelFilter === filter.id ? " is-active" : "";
        return (
          '<button type="button" class="nofida-library-panel__filter' +
          active +
          '" data-nofida-filter="' +
          escapeHtml(filter.id) +
          '">' +
          escapeHtml(filter.label) +
          "</button>"
        );
      })
      .join("");

    if (visibleItems.length === 0) {
      list.innerHTML = '<div class="nofida-library-panel__empty">' + escapeHtml(localeStrings.noResults) + "</div>";
      return;
    }

    list.innerHTML = visibleItems
      .map((item) => {
        const focused = item.id === STATE.focusItemId ? " is-focused" : "";
        const primaryAction = item.internal_url
          ? '<a class="nofida-library-panel__item-link" href="' +
            escapeHtml(item.internal_url) +
            '" target="_blank" rel="noopener">' +
            escapeHtml(localeStrings.openInternalFile) +
            "</a>"
          : '<span class="nofida-library-panel__item-link is-muted">' +
            escapeHtml(localeStrings.badgeCatalog) +
            "</span>";

        return [
          '<article class="nofida-library-panel__item' +
            focused +
            '" data-nofida-item-id="' +
            escapeHtml(item.id) +
            '">',
          '  <div class="nofida-library-panel__item-media">',
          '    <img src="' +
            escapeHtml(item.thumbnail_url) +
            '" alt="' +
            escapeHtml(item.title) +
            '" loading="lazy" onerror="this.dataset.broken=1;this.style.display=\'none\';this.nextElementSibling.style.display=\'grid\';">',
          '    <div class="nofida-library-panel__item-fallback" style="display:none;">' +
            escapeHtml(typeLabel(item, localeStrings)) +
            "</div>",
          '    <span class="nofida-library-panel__item-badge ' +
            escapeHtml(statusClass(item)) +
            '">' +
            escapeHtml(statusBadge(item, localeStrings)) +
            "</span>",
          "  </div>",
          '  <div class="nofida-library-panel__item-body">',
          '    <div class="nofida-library-panel__item-meta">' +
            escapeHtml(typeLabel(item, localeStrings)) +
            " · " +
            escapeHtml(item.source || "NOFIDA") +
            "</div>",
          "    <h3>" + escapeHtml(item.title) + "</h3>",
          '    <p class="nofida-library-panel__item-subtitle">' +
            escapeHtml(item.author || item.source || "NOFIDA") +
            "</p>",
          '    <dl class="nofida-library-panel__item-facts">',
          "      <div><dt>" + escapeHtml(localeStrings.statusLabel) + "</dt><dd>" + escapeHtml(statusBadge(item, localeStrings)) + "</dd></div>",
          "      <div><dt>" + escapeHtml(localeStrings.sourceLabel) + "</dt><dd>" + escapeHtml(item.source || "NOFIDA") + "</dd></div>",
          "      <div><dt>" + escapeHtml(localeStrings.licenseLabel) + "</dt><dd>" + escapeHtml(item.license || "—") + "</dd></div>",
          "      <div><dt>" + escapeHtml(localeStrings.importLabel) + "</dt><dd>" + escapeHtml(importModeLabel(item, localeStrings)) + "</dd></div>",
          "    </dl>",
          '    <p class="nofida-library-panel__item-note">' + escapeHtml(item.risk_notes || "") + "</p>",
          '    <div class="nofida-library-panel__item-actions">' + primaryAction + "</div>",
          "  </div>",
          "</article>"
        ].join("");
      })
      .join("");

    if (STATE.focusItemId) {
      const focusNode = Array.from(list.querySelectorAll("[data-nofida-item-id]")).find((node) => {
        return node.getAttribute("data-nofida-item-id") === STATE.focusItemId;
      });
      if (focusNode) {
        focusNode.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }

  function enhanceActionCards() {
    const localeStrings = strings();
    const cards = Array.from(document.querySelectorAll(".main_ui_dashboard_placeholder__empty-project-card"));
    const definitions = [
      { action: "create", eyebrow: localeStrings.cardEyebrowCreate, hint: localeStrings.cardHintCreate },
      { action: "import", eyebrow: localeStrings.cardEyebrowImport, hint: localeStrings.cardHintImport },
      { action: "libraries", eyebrow: localeStrings.cardEyebrowCatalog, hint: localeStrings.cardHintCatalog }
    ];

    cards.forEach((card, index) => {
      const definition = definitions[index];
      if (!definition) return;

      card.dataset.nofidaAction = definition.action;

      let eyebrow = card.querySelector(".nofida-action-card__eyebrow");
      if (!eyebrow) {
        eyebrow = document.createElement("div");
        eyebrow.className = "nofida-action-card__eyebrow";
        card.prepend(eyebrow);
      }
      eyebrow.textContent = definition.eyebrow;

      let hint = card.querySelector(".nofida-action-card__hint");
      if (!hint) {
        hint = document.createElement("div");
        hint.className = "nofida-action-card__hint";
        card.append(hint);
      }
      hint.textContent = definition.hint;

      if (definition.action === "libraries" && !card.dataset.nofidaLibrariesBound) {
        const openCatalog = (event) => {
          event.preventDefault();
          event.stopPropagation();
          openPanel();
        };
        card.addEventListener("click", openCatalog, true);
        card.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") openCatalog(event);
        });
        card.dataset.nofidaLibrariesBound = "true";
        card.setAttribute("tabindex", "0");
        card.setAttribute("role", "button");
      }
    });
  }

  function enhanceLibrariesNav() {
    if (!STATE.catalogData) return;
    const localeStrings = strings();
    const link = document.querySelector("[data-testid='libs-link-sidebar']");
    if (!link) return;

    let badge = link.querySelector(".nofida-sidebar-nav__badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "nofida-sidebar-nav__badge";
      link.appendChild(badge);
    }
    badge.textContent = String(STATE.catalogData.curatedCount);

    if (!link.dataset.nofidaBound) {
      link.addEventListener(
        "click",
        (event) => {
          event.preventDefault();
          event.stopPropagation();
          openPanel();
        },
        true
      );
      link.setAttribute("title", localeStrings.openCatalog);
      link.dataset.nofidaBound = "true";
    }
  }

  function renderSidebarShelf() {
    if (!STATE.catalogData) return;
    const localeStrings = strings();
    const sidebarContent = document.querySelector(".main_ui_dashboard_sidebar__sidebar-content");
    const librariesSection = document.querySelector("[data-testid='libs-link-sidebar']")?.closest(".main_ui_dashboard_sidebar__sidebar-content-section");
    if (!sidebarContent || !librariesSection) return;

    let shelf = document.querySelector(".nofida-sidebar-libraries");
    if (!shelf) {
      shelf = document.createElement("section");
      shelf.className = "nofida-sidebar-libraries";
      librariesSection.insertAdjacentElement("afterend", shelf);
    }

    const previewItems = STATE.catalogData.featured.slice(0, 4);

    shelf.innerHTML = [
      '<div class="nofida-sidebar-libraries__header">',
      "  <div>",
      '    <p class="nofida-sidebar-libraries__eyebrow">NOFIDA</p>',
      "    <h3>" + escapeHtml(localeStrings.sidebarTitle) + "</h3>",
      "    <p>" + escapeHtml(localeStrings.sidebarSubtitle) + "</p>",
      "  </div>",
      '  <button type="button" class="nofida-sidebar-libraries__cta" data-nofida-open-catalog>' +
        escapeHtml(localeStrings.openCatalog) +
        "</button>",
      "</div>",
      '<div class="nofida-sidebar-libraries__stats">',
      '  <div class="nofida-sidebar-libraries__stat"><strong>' +
        escapeHtml(STATE.catalogData.curatedCount) +
        "</strong><span>" +
        escapeHtml(localeStrings.featuredCount) +
        "</span></div>",
      '  <div class="nofida-sidebar-libraries__stat"><strong>' +
        escapeHtml(STATE.catalogData.inventoryCount) +
        "</strong><span>" +
        escapeHtml(localeStrings.curatedCount) +
        "</span></div>",
      "</div>",
      '<div class="nofida-sidebar-libraries__items">',
      previewItems
        .map((item) => {
          return (
            '<button type="button" class="nofida-sidebar-libraries__item" data-nofida-open-item="' +
            escapeHtml(item.id) +
            '">' +
            '<span class="nofida-sidebar-libraries__item-name">' +
            escapeHtml(item.title) +
            "</span>" +
            '<span class="nofida-sidebar-libraries__item-meta">' +
            escapeHtml(typeLabel(item, localeStrings)) +
            " · " +
            escapeHtml(statusBadge(item, localeStrings)) +
            "</span>" +
            "</button>"
          );
        })
        .join(""),
      "</div>"
    ].join("");

    if (!shelf.dataset.nofidaBound) {
      shelf.addEventListener("click", (event) => {
        const openCatalogTrigger = event.target.closest("[data-nofida-open-catalog]");
        if (openCatalogTrigger) {
          event.preventDefault();
          openPanel();
          return;
        }

        const itemTrigger = event.target.closest("[data-nofida-open-item]");
        if (itemTrigger) {
          event.preventDefault();
          openPanel(itemTrigger.getAttribute("data-nofida-open-item"));
        }
      });
      shelf.dataset.nofidaBound = "true";
    }
  }

  function bindShowcaseEvents(shell) {
    if (shell.dataset.nofidaBound) return;

    shell.addEventListener("click", (event) => {
      const rail = shell.querySelector(".nofida-library-showcase__rail");
      const openCatalog = event.target.closest("[data-nofida-open-catalog]");
      if (openCatalog) {
        event.preventDefault();
        openPanel();
        return;
      }

      const control = event.target.closest("[data-nofida-scroll]");
      if (control && rail) {
        const direction = control.getAttribute("data-nofida-scroll") === "prev" ? -1 : 1;
        const card = rail.querySelector(".nofida-library-showcase__card");
        const amount = (card?.getBoundingClientRect().width || 280) + 20;
        const atEnd = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 16;
        const atStart = rail.scrollLeft <= 8;
        if (direction > 0 && atEnd) {
          rail.scrollTo({ left: 0, behavior: "smooth" });
          return;
        }
        if (direction < 0 && atStart) {
          rail.scrollTo({ left: rail.scrollWidth, behavior: "smooth" });
          return;
        }
        rail.scrollBy({ left: amount * direction, behavior: "smooth" });
        return;
      }

      const openItem = event.target.closest("[data-nofida-showcase-item]");
      if (openItem) {
        event.preventDefault();
        openPanel(openItem.getAttribute("data-nofida-showcase-item"));
      }
    });

    shell.addEventListener("mouseenter", () => {
      if (STATE.showcaseTimer) {
        clearInterval(STATE.showcaseTimer);
        STATE.showcaseTimer = null;
      }
    });

    shell.addEventListener("mouseleave", () => {
      scheduleShowcaseAutoScroll(shell);
    });

    shell.dataset.nofidaBound = "true";
  }

  function scheduleShowcaseAutoScroll(shell) {
    const rail = shell.querySelector(".nofida-library-showcase__rail");
    if (!rail) return;

    if (STATE.showcaseTimer) {
      clearInterval(STATE.showcaseTimer);
      STATE.showcaseTimer = null;
    }

    STATE.showcaseTimer = setInterval(() => {
      if (!document.body.contains(shell)) return;
      const card = rail.querySelector(".nofida-library-showcase__card");
      const amount = (card?.getBoundingClientRect().width || 280) + 20;
      const atEnd = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 16;
      if (atEnd) {
        rail.scrollTo({ left: 0, behavior: "smooth" });
      } else {
        rail.scrollBy({ left: amount, behavior: "smooth" });
      }
    }, 6500);
  }

  function renderShowcase() {
    if (!STATE.catalogData) return;
    const localeStrings = strings();
    const section = document.querySelector(".main_ui_dashboard_templates__dashboard-templates-section");
    if (!section) return;

    section.classList.add("nofida-library-showcase--enhanced");

    let shell = section.querySelector(".nofida-library-showcase");
    if (!shell) {
      shell = document.createElement("section");
      shell.className = "nofida-library-showcase";
      section.appendChild(shell);
    }

    const items = STATE.catalogData.featured.slice(0, 12);

    shell.innerHTML = [
      '<div class="nofida-library-showcase__header">',
      '  <div class="nofida-library-showcase__intro">',
      '    <p class="nofida-library-showcase__eyebrow">NOFIDA</p>',
      "    <h2>" + escapeHtml(localeStrings.showcaseTitle) + "</h2>",
      "    <p>" + escapeHtml(localeStrings.showcaseDescription) + "</p>",
      "  </div>",
      '  <div class="nofida-library-showcase__controls">',
      '    <button type="button" class="nofida-library-showcase__catalog-button" data-nofida-open-catalog>' +
        escapeHtml(localeStrings.showcaseCta) +
        "</button>",
      '    <button type="button" class="nofida-library-showcase__nav" data-nofida-scroll="prev" aria-label="' +
        escapeHtml(localeStrings.showcasePrev) +
        '">←</button>',
      '    <button type="button" class="nofida-library-showcase__nav" data-nofida-scroll="next" aria-label="' +
        escapeHtml(localeStrings.showcaseNext) +
        '">→</button>',
      "  </div>",
      "</div>",
      '<div class="nofida-library-showcase__rail">',
      items
        .map((item) => {
          return [
            '<article class="nofida-library-showcase__card" data-nofida-showcase-item="' +
              escapeHtml(item.id) +
              '">',
            '  <div class="nofida-library-showcase__media">',
            '    <img src="' +
              escapeHtml(item.thumbnail_url) +
              '" alt="' +
              escapeHtml(item.title) +
              '" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'grid\';">',
            '    <div class="nofida-library-showcase__fallback" style="display:none;">' +
              escapeHtml(typeLabel(item, localeStrings)) +
              "</div>",
            '    <span class="nofida-library-showcase__badge ' +
              escapeHtml(statusClass(item)) +
              '">' +
              escapeHtml(item.internal_url ? localeStrings.availabilityInternal : localeStrings.availabilityCatalog) +
              "</span>",
            "  </div>",
            '  <div class="nofida-library-showcase__body">',
            '    <div class="nofida-library-showcase__meta">' +
              escapeHtml(typeLabel(item, localeStrings)) +
              "</div>",
            "    <h3>" + escapeHtml(item.title) + "</h3>",
            '    <p>' + escapeHtml(item.author || item.source || "NOFIDA") + "</p>",
            '    <div class="nofida-library-showcase__footer">',
            '      <span class="nofida-library-showcase__status">' +
              escapeHtml(statusBadge(item, localeStrings)) +
              "</span>",
            '      <span class="nofida-library-showcase__action">' +
              escapeHtml(item.internal_url ? localeStrings.actionOpen : localeStrings.actionView) +
              " +</span>",
            "    </div>",
            "  </div>",
            "</article>"
          ].join("");
        })
        .join(""),
      "</div>"
    ].join("");

    bindShowcaseEvents(shell);

    scheduleShowcaseAutoScroll(shell);
  }

  async function enhanceDashboard() {
    if (!isDashboardVisible()) return;

    try {
      await loadCatalog();
      enhanceActionCards();
      enhanceLibrariesNav();
      renderSidebarShelf();
      renderShowcase();
      renderPanelList();
    } catch (error) {
      console.error("[Nofida Dashboard Shell] Failed to enhance dashboard", error);
    }
  }

  let enhanceQueued = false;
  function scheduleEnhance() {
    if (enhanceQueued) return;
    enhanceQueued = true;
    window.requestAnimationFrame(() => {
      enhanceQueued = false;
      enhanceDashboard();
    });
  }

  function start() {
    ensurePanel();
    scheduleEnhance();
    window.addEventListener("hashchange", scheduleEnhance);
    window.addEventListener("popstate", scheduleEnhance);
    const observer = new MutationObserver(scheduleEnhance);
    observer.observe(document.body, { childList: true, subtree: true });
    window.NofidaDashboardShell = {
      openCatalog: openPanel,
      closeCatalog: closePanel,
      refresh: scheduleEnhance
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
