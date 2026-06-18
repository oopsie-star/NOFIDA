(function () {
  "use strict";

  if (window.NofidaResources) return;

  var OVERLAY_ID = "nfr-overlay";
  var FONT_CATALOG_URL = "/nofida/fonts/catalog.json?v=__NOFIDA_ASSET_TAG__";
  var MEDIA_CATALOG_URL = "/nofida/media-store/catalog.json?v=__NOFIDA_ASSET_TAG__";

  var PAGE_ROUTES = {
    fonts: "#/nofida/fonts",
    media: "#/nofida/media",
    figma: "#/nofida/import/figma"
  };

  var RESOURCE_LINKS = [
    { id: "libraries", label: "Libraries", href: "#/nofida/libraries", kind: "external" },
    { id: "fonts", label: "Fonts", href: PAGE_ROUTES.fonts },
    { id: "media", label: "Media", href: PAGE_ROUTES.media },
    { id: "figma", label: "Figma Import", href: PAGE_ROUTES.figma }
  ];

  var PAGES = {
    fonts: {
      title: "NOFIDA Font Hub",
      badge: "Curated typography",
      intro: "A production-safe font layer for NOFIDA: approved open-license families, pairing guidance, language coverage, and the Penpot 2.16 install path that does not rely on direct database writes.",
      actions: [
        { label: "Open NOFIDA Hub", href: "#/nofida/libraries" },
        { label: "Open Media Bank", href: PAGE_ROUTES.media },
        { label: "Plan Figma migration", href: PAGE_ROUTES.figma }
      ],
      notice: "This patch ships metadata and install guidance first. It does not push custom font binaries into Penpot or mutate the database."
    },
    media: {
      title: "NOFIDA Media Bank",
      badge: "Same-origin catalog",
      intro: "A server-backed media foundation with lightweight placeholder assets, licensing notes, and metadata shaped for later AI-assisted selection without dumping the entire catalog into prompts.",
      actions: [
        { label: "Open Font Hub", href: PAGE_ROUTES.fonts },
        { label: "Open NOFIDA Hub", href: "#/nofida/libraries" },
        { label: "Plan Figma migration", href: PAGE_ROUTES.figma }
      ],
      notice: "The current bank uses tiny NOFIDA-authored placeholders only. Replace or extend them with approved media as the real catalog grows."
    },
    figma: {
      title: "Figma Migration Assistant",
      badge: "Strategy entry point",
      intro: "A realistic migration surface for teams coming from Figma: export intake placeholders, audit notes, and a scoped roadmap that does not promise pixel-perfect 1:1 conversion.",
      actions: [
        { label: "Open Font Hub", href: PAGE_ROUTES.fonts },
        { label: "Open Media Bank", href: PAGE_ROUTES.media },
        { label: "Open NOFIDA Hub", href: "#/nofida/libraries" }
      ],
      notice: "Analyze is intentionally stubbed in PATCH 018A. No live parser, token exchange, or file mutation ships in this patch."
    }
  };

  var state = {
    overlayEl: null,
    lastAppHash: "#/dashboard",
    currentPageId: "",
    fontCatalog: null,
    mediaCatalog: null,
    pending: {
      fontCatalog: null,
      mediaCatalog: null
    },
    renderToken: 0
  };

  var RESOURCE_CSS = [
    "#nfr-overlay{position:fixed;inset:0;z-index:2147483440;overflow-y:auto;color:#f8fafc;",
      "font-family:Montserrat,Inter,\"Segoe UI\",system-ui,sans-serif;",
      "background:",
      "radial-gradient(circle at top left,rgba(16,185,129,.12),transparent 32%),",
      "radial-gradient(circle at top right,rgba(37,99,235,.2),transparent 28%),",
      "linear-gradient(180deg,#07111d 0%,#091523 48%,#0a1324 100%)}",
    "#nfr-overlay[hidden]{display:none!important}",
    ".nfr-shell{max-width:1320px;margin:0 auto;padding:26px 20px 70px}",
    ".nfr-topbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}",
    ".nfr-back,.nfr-close,.nfr-ghost-btn,.nfr-disabled-btn{border:1px solid rgba(148,163,184,.2);",
      "background:rgba(8,17,31,.72);color:#cbd5e1;border-radius:999px;padding:10px 14px;",
      "font:inherit;font-size:13px;font-weight:700;cursor:pointer;",
      "transition:border-color .16s ease,color .16s ease,background .16s ease,transform .16s ease}",
    ".nfr-back:hover,.nfr-close:hover,.nfr-ghost-btn:hover{color:#f8fafc;border-color:rgba(37,99,235,.34);",
      "background:rgba(12,24,42,.92);transform:translateY(-1px)}",
    ".nfr-disabled-btn{opacity:.55;cursor:not-allowed}",
    ".nfr-layout{display:grid;grid-template-columns:270px minmax(0,1fr);gap:18px;align-items:start}",
    ".nfr-nav-panel,.nfr-hero,.nfr-panel,.nfr-card{border:1px solid rgba(37,99,235,.22);",
      "box-shadow:0 22px 58px rgba(2,6,23,.34)}",
    ".nfr-nav-panel{position:sticky;top:18px;border-radius:26px;background:rgba(7,12,24,.8);backdrop-filter:blur(16px);padding:18px}",
    ".nfr-nav-kicker,.nfr-section-kicker{margin:0 0 10px;color:#bfff00;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}",
    ".nfr-nav-list{display:flex;flex-direction:column;gap:8px}",
    ".nfr-nav-link{display:block;text-decoration:none;color:#94a3b8;padding:11px 12px;border-radius:14px;border:1px solid transparent;",
      "transition:color .16s ease,border-color .16s ease,background .16s ease,transform .16s ease}",
    ".nfr-nav-link:hover,.nfr-nav-link.active{color:#f8fafc;border-color:rgba(37,99,235,.3);background:rgba(19,30,53,.92);transform:translateX(2px)}",
    ".nfr-nav-link.external::after{content:\"Open\";float:right;font-size:10px;letter-spacing:.08em;text-transform:uppercase;opacity:.72}",
    ".nfr-main{display:flex;flex-direction:column;gap:18px}",
    ".nfr-hero{border-radius:30px;padding:30px;background:",
      "linear-gradient(135deg,rgba(19,30,53,.97),rgba(10,19,36,.97)),rgba(19,30,53,.96)}",
    ".nfr-hero-head{display:flex;flex-wrap:wrap;align-items:center;gap:12px}",
    ".nfr-badge{display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;background:rgba(16,185,129,.16);",
      "color:#a7f3d0;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}",
    ".nfr-hero h1{margin:0;font-size:clamp(30px,4.2vw,46px);line-height:1.04;letter-spacing:-.03em}",
    ".nfr-intro{margin:14px 0 0;max-width:860px;color:#cbd5e1;font-size:15px;line-height:1.72}",
    ".nfr-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}",
    ".nfr-btn{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:0 16px;border-radius:999px;text-decoration:none;",
      "font-size:13px;font-weight:800;transition:transform .16s ease,box-shadow .16s ease,background .16s ease,border-color .16s ease}",
    ".nfr-btn:hover{transform:translateY(-1px)}",
    ".nfr-btn-primary{background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;box-shadow:0 14px 30px rgba(37,99,235,.24)}",
    ".nfr-btn-secondary{color:#e2e8f0;border:1px solid rgba(37,99,235,.26);background:rgba(11,16,32,.66)}",
    ".nfr-notice{margin-top:18px;padding:14px 16px;border-radius:18px;border:1px solid rgba(245,158,11,.28);background:rgba(120,53,15,.22);color:#fde68a;font-size:13px;font-weight:700}",
    ".nfr-stack{display:flex;flex-direction:column;gap:18px}",
    ".nfr-stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}",
    ".nfr-stat{border-radius:20px;padding:18px;background:rgba(9,17,31,.7);border:1px solid rgba(56,189,248,.18)}",
    ".nfr-stat-value{display:block;font-size:28px;font-weight:800;line-height:1.05}",
    ".nfr-stat-label{display:block;margin-top:8px;color:#cbd5e1;font-size:13px;line-height:1.45}",
    ".nfr-panel{border-radius:26px;padding:22px;background:rgba(12,19,33,.78)}",
    ".nfr-panel h2,.nfr-panel h3,.nfr-card h3{margin:0;font-size:18px;line-height:1.28}",
    ".nfr-panel-copy{margin:10px 0 0;color:#cbd5e1;font-size:14px;line-height:1.68}",
    ".nfr-list{display:grid;gap:10px;margin:16px 0 0;padding:0;list-style:none}",
    ".nfr-list li{padding:12px 14px;border-radius:16px;background:rgba(19,30,53,.66);border:1px solid rgba(37,99,235,.16);color:#dbeafe;font-size:13px;line-height:1.6}",
    ".nfr-code{display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;background:rgba(7,12,24,.76);border:1px solid rgba(37,99,235,.2);color:#bfdbfe;font:600 12px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}",
    ".nfr-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}",
    ".nfr-card{display:flex;flex-direction:column;gap:12px;border-radius:24px;padding:20px;background:rgba(19,30,53,.9);animation:nfr-fade-up .22s ease both}",
    ".nfr-card-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}",
    ".nfr-card-copy{margin:0;color:#cbd5e1;font-size:13px;line-height:1.64}",
    ".nfr-pill-row,.nfr-tag-row{display:flex;flex-wrap:wrap;gap:8px}",
    ".nfr-pill,.nfr-tag{display:inline-flex;align-items:center;min-height:30px;padding:0 10px;border-radius:999px;border:1px solid rgba(37,99,235,.2);background:rgba(7,12,24,.64);color:#bfdbfe;font-size:11px;font-weight:800;letter-spacing:.01em}",
    ".nfr-pill.good{border-color:rgba(34,197,94,.24);color:#bbf7d0;background:rgba(20,83,45,.3)}",
    ".nfr-pill.warn{border-color:rgba(245,158,11,.24);color:#fde68a;background:rgba(120,53,15,.3)}",
    ".nfr-preview{padding:16px 18px;border-radius:18px;background:linear-gradient(135deg,rgba(255,255,255,.06),rgba(148,163,184,.05));border:1px solid rgba(148,163,184,.14);color:#f8fafc;font-size:24px;line-height:1.3;letter-spacing:-.02em}",
    ".nfr-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}",
    ".nfr-meta-block{padding:12px 14px;border-radius:16px;background:rgba(7,12,24,.58);border:1px solid rgba(37,99,235,.14)}",
    ".nfr-meta-block strong{display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#93c5fd}",
    ".nfr-meta-block span{display:block;margin-top:8px;color:#e2e8f0;font-size:13px;line-height:1.56}",
    ".nfr-media-thumb{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:18px;border:1px solid rgba(148,163,184,.14);background:#091523}",
    ".nfr-media-links{display:flex;flex-wrap:wrap;gap:8px;margin-top:auto}",
    ".nfr-media-links a{text-decoration:none}",
    ".nfr-link-btn{display:inline-flex;align-items:center;justify-content:center;min-height:36px;padding:0 12px;border-radius:999px;border:1px solid rgba(37,99,235,.24);background:rgba(11,16,32,.66);color:#e2e8f0;font-size:12px;font-weight:800;text-decoration:none}",
    ".nfr-link-btn:hover{border-color:rgba(37,99,235,.42);color:#fff}",
    ".nfr-columns{display:grid;grid-template-columns:1.1fr .9fr;gap:14px}",
    ".nfr-dropzone{display:grid;gap:14px;padding:22px;border-radius:24px;border:1px dashed rgba(96,165,250,.48);background:linear-gradient(135deg,rgba(37,99,235,.12),rgba(16,185,129,.08))}",
    ".nfr-dropzone-title{margin:0;font-size:22px;line-height:1.2}",
    ".nfr-dropzone-copy{margin:0;color:#cbd5e1;font-size:14px;line-height:1.65}",
    ".nfr-form-grid{display:grid;gap:12px}",
    ".nfr-field{display:grid;gap:6px}",
    ".nfr-field label{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#93c5fd}",
    ".nfr-field input,.nfr-field textarea{width:100%;border-radius:16px;border:1px solid rgba(37,99,235,.22);background:rgba(7,12,24,.74);color:#e2e8f0;padding:12px 14px;font:inherit;resize:vertical}",
    ".nfr-field input[disabled],.nfr-field textarea[disabled]{opacity:.72;cursor:not-allowed}",
    ".nfr-checklist{display:grid;gap:10px;margin-top:14px}",
    ".nfr-check{display:grid;grid-template-columns:24px minmax(0,1fr);gap:10px;align-items:start;padding:12px 14px;border-radius:16px;background:rgba(7,12,24,.58);border:1px solid rgba(37,99,235,.14)}",
    ".nfr-check-mark{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:999px;background:rgba(16,185,129,.16);color:#a7f3d0;font-size:12px;font-weight:900}",
    ".nfr-check-copy{color:#e2e8f0;font-size:13px;line-height:1.58}",
    ".nfr-feasibility{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}",
    ".nfr-tier{border-radius:20px;padding:18px;background:rgba(19,30,53,.88);border:1px solid rgba(37,99,235,.18)}",
    ".nfr-tier h3{margin:0;font-size:18px}",
    ".nfr-tier p{margin:10px 0 0;color:#cbd5e1;font-size:13px;line-height:1.65}",
    ".nfr-tier.easy{border-color:rgba(34,197,94,.26)}",
    ".nfr-tier.medium{border-color:rgba(56,189,248,.24)}",
    ".nfr-tier.hard{border-color:rgba(245,158,11,.26)}",
    ".nfr-tier.very-hard{border-color:rgba(244,63,94,.26)}",
    ".nfr-empty,.nfr-error{padding:22px;border-radius:22px;background:rgba(19,30,53,.9);border:1px solid rgba(37,99,235,.18);color:#cbd5e1;font-size:14px;line-height:1.7}",
    ".nfr-footer-note{margin:4px 0 0;color:#94a3b8;font-size:12px}",
    "@keyframes nfr-fade-up{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}",
    "@media (max-width:1080px){.nfr-layout{grid-template-columns:1fr}.nfr-nav-panel{position:static}.nfr-nav-list{flex-direction:row;flex-wrap:wrap}.nfr-columns{grid-template-columns:1fr}}",
    "@media (max-width:680px){.nfr-shell{padding:14px 12px 44px}.nfr-topbar{flex-direction:column;align-items:stretch}.nfr-hero,.nfr-panel,.nfr-card,.nfr-nav-panel,.nfr-dropzone,.nfr-tier{border-radius:18px}.nfr-hero{padding:22px}.nfr-back,.nfr-close,.nfr-btn,.nfr-link-btn,.nfr-ghost-btn,.nfr-disabled-btn{width:100%}.nfr-meta{grid-template-columns:1fr}.nfr-preview{font-size:20px}}"
  ].join("");

  function onReady(fn) {
    function afterPaint() {
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(fn);
      });
    }
    if (document.readyState === "complete") {
      afterPaint();
      return;
    }
    window.addEventListener("load", afterPaint, { once: true });
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeHash(hash) {
    if (!hash) return "#/dashboard";
    return hash.charAt(0) === "#" ? hash : "#" + hash;
  }

  function getHashPath() {
    var hash = window.location.hash || "";
    var queryIndex = hash.indexOf("?");
    return queryIndex >= 0 ? hash.slice(0, queryIndex) : hash;
  }

  function getPageIdFromHash(hash) {
    var path = hash || getHashPath();
    if (path === PAGE_ROUTES.fonts) return "fonts";
    if (path === PAGE_ROUTES.media) return "media";
    if (path === PAGE_ROUTES.figma) return "figma";
    return "";
  }

  function isResourceHash(hash) {
    return !!getPageIdFromHash(hash);
  }

  function rememberAppHash(hash) {
    var next = normalizeHash(hash || window.location.hash || "#/dashboard");
    if (isResourceHash(next)) return;
    state.lastAppHash = next;
  }

  function pageHref(pageId) {
    return PAGE_ROUTES[pageId] || "#/dashboard";
  }

  function renderActions(actions) {
    if (!Array.isArray(actions) || actions.length === 0) return "";
    return [
      '<div class="nfr-actions">',
      actions.map(function (action, index) {
        var klass = index === 0 ? "nfr-btn nfr-btn-primary" : "nfr-btn nfr-btn-secondary";
        return '<a class="' + klass + '" href="' + escapeHtml(action.href) + '">' + escapeHtml(action.label) + "</a>";
      }).join(""),
      "</div>"
    ].join("");
  }

  function renderNav(currentPageId) {
    return RESOURCE_LINKS.map(function (item) {
      var classes = ["nfr-nav-link"];
      if (item.kind === "external") classes.push("external");
      if (item.id === currentPageId) classes.push("active");
      return '<a class="' + classes.join(" ") + '" href="' + escapeHtml(item.href) + '">' + escapeHtml(item.label) + "</a>";
    }).join("");
  }

  function renderStats(stats) {
    return [
      '<section class="nfr-stat-grid">',
      stats.map(function (stat) {
        return [
          '<article class="nfr-stat">',
          '  <span class="nfr-stat-value">' + escapeHtml(stat.value) + "</span>",
          '  <span class="nfr-stat-label">' + escapeHtml(stat.label) + "</span>",
          "</article>"
        ].join("");
      }).join(""),
      "</section>"
    ].join("");
  }

  function renderAuditList(title, items) {
    return [
      '<section class="nfr-panel">',
      '  <p class="nfr-section-kicker">Operational notes</p>',
      '  <h2>' + escapeHtml(title) + "</h2>",
      '  <ul class="nfr-list">',
      items.map(function (item) {
        return "<li>" + escapeHtml(item) + "</li>";
      }).join(""),
      "  </ul>",
      "</section>"
    ].join("");
  }

  function renderMetaBlock(label, value) {
    return [
      '<div class="nfr-meta-block">',
      '  <strong>' + escapeHtml(label) + "</strong>",
      '  <span>' + escapeHtml(value) + "</span>",
      "</div>"
    ].join("");
  }

  function renderFontCard(font) {
    var previewStyle = "font-family:'" + String(font.family || "").replace(/'/g, "\\'") + "',Inter,\"Segoe UI\",system-ui,sans-serif";
    return [
      '<article class="nfr-card">',
      '  <div class="nfr-card-top">',
      '    <div>',
      '      <p class="nfr-section-kicker">Font family</p>',
      '      <h3>' + escapeHtml(font.family) + "</h3>",
      "    </div>",
      '    <div class="nfr-pill-row">',
      '      <span class="nfr-pill">' + escapeHtml(font.category) + "</span>",
      '      <span class="nfr-pill good">' + escapeHtml(font.license) + "</span>",
      "    </div>",
      "  </div>",
      '  <div class="nfr-preview" style="' + escapeHtml(previewStyle) + '">',
      "    " + escapeHtml(font.previewText || font.family),
      "  </div>",
      '  <p class="nfr-card-copy">' + escapeHtml(font.recommendedUseCase || "") + "</p>",
      '  <div class="nfr-meta">',
         renderMetaBlock("Language coverage", Array.isArray(font.languageCoverage) ? font.languageCoverage.join(", ") : String(font.languageCoverage || "")),
         renderMetaBlock("Install / use", font.installStatus || font.fileStatus || ""),
         renderMetaBlock("Pairings", Array.isArray(font.pairingSuggestions) ? font.pairingSuggestions.join(", ") : ""),
         renderMetaBlock("Mood", Array.isArray(font.mood) ? font.mood.join(", ") : String(font.mood || "")),
      "  </div>",
      '  <div class="nfr-tag-row">',
      (Array.isArray(font.useCases) ? font.useCases : []).map(function (tag) {
        return '<span class="nfr-tag">' + escapeHtml(tag) + "</span>";
      }).join(""),
      "  </div>",
      "</article>"
    ].join("");
  }

  function renderMediaCard(asset) {
    return [
      '<article class="nfr-card">',
      '  <img class="nfr-media-thumb" src="' + escapeHtml(asset.thumbnailUrl || "") + '" alt="' + escapeHtml(asset.title || asset.id || "Media thumbnail") + '"/>',
      '  <div class="nfr-card-top">',
      '    <div>',
      '      <p class="nfr-section-kicker">' + escapeHtml(asset.category || "media") + "</p>",
      '      <h3>' + escapeHtml(asset.title || asset.id || "Untitled") + "</h3>",
      "    </div>",
      '    <div class="nfr-pill-row">',
      '      <span class="nfr-pill">' + escapeHtml(asset.format || "asset") + "</span>",
      '      <span class="nfr-pill good">' + escapeHtml(asset.license || "review") + "</span>",
      "    </div>",
      "  </div>",
      '  <p class="nfr-card-copy">' + escapeHtml(asset.style || "") + " · " + escapeHtml(asset.mood || "") + " · " + escapeHtml(asset.audience || "") + "</p>",
      '  <div class="nfr-meta">',
         renderMetaBlock("Use cases", Array.isArray(asset.useCases) ? asset.useCases.join(", ") : String(asset.useCases || "")),
         renderMetaBlock("Source", asset.source || ""),
         renderMetaBlock("Colors", Array.isArray(asset.dominantColors) ? asset.dominantColors.join(", ") : ""),
         renderMetaBlock("Tags", Array.isArray(asset.tags) ? asset.tags.join(", ") : ""),
      "  </div>",
      '  <div class="nfr-media-links">',
      (asset.internalUrl
        ? '<a class="nfr-link-btn" href="' + escapeHtml(asset.internalUrl) + '" target="_blank" rel="noreferrer">Open placeholder</a>'
        : ""),
      (asset.thumbnailUrl
        ? '<a class="nfr-link-btn" href="' + escapeHtml(asset.thumbnailUrl) + '" target="_blank" rel="noreferrer">Open thumbnail</a>'
        : ""),
      '  </div>',
      "</article>"
    ].join("");
  }

  function renderFontBody(catalog) {
    var fonts = Array.isArray(catalog.fonts) ? catalog.fonts : [];
    var audit = catalog.penpotAudit || {};
    return [
      '<div class="nfr-stack">',
        renderStats([
          { value: String(fonts.length), label: "Approved open-license families" },
          { value: String(audit.customFontScope || "team"), label: "Supported custom font scope in Penpot 2.16" },
          { value: Array.isArray(audit.customUploadFormats) ? audit.customUploadFormats.join(" / ").toUpperCase() : "TTF / OTF / WOFF / WOFF2", label: "Supported custom upload formats" }
        ]),
        renderAuditList("Penpot 2.16 install path", [
          "Default catalog: " + String(audit.defaultCatalog || "Google Fonts"),
          "Team uploads are the supported custom-font path today; avoid database hacks.",
          "Use the dashboard Fonts section when a needed font is not already in the default catalog.",
          "Treat server-global font rollout as a separate operations spike with upgrade rehearsal."
        ]),
      '  <section class="nfr-panel">',
      '    <p class="nfr-section-kicker">Storage audit</p>',
      '    <h2>How NOFIDA treats custom fonts safely</h2>',
      '    <p class="nfr-panel-copy">' + escapeHtml(audit.storageInference || "") + "</p>",
      '    <ul class="nfr-list">',
      (Array.isArray(audit.recommendedInstallPath) ? audit.recommendedInstallPath : []).map(function (item) {
        return "<li>" + escapeHtml(item) + "</li>";
      }).join(""),
      "    </ul>",
      "  </section>",
      '  <section class="nfr-grid">',
      fonts.map(renderFontCard).join(""),
      "  </section>",
      "</div>"
    ].join("");
  }

  function renderMediaBody(catalog) {
    var assets = Array.isArray(catalog.assets) ? catalog.assets : [];
    var selection = catalog.selectionBoundary || {};
    return [
      '<div class="nfr-stack">',
        renderStats([
          { value: String(assets.length), label: "Placeholder assets in the current bank" },
          { value: String(catalog.storeRoot || "/opt/nofida-core/media-store"), label: "Canonical server-side store root" },
          { value: "Scoped", label: "AI context behavior: send only matched media, not the full catalog" }
        ]),
      '  <div class="nfr-columns">',
      '    <section class="nfr-panel">',
      '      <p class="nfr-section-kicker">Store contract</p>',
      '      <h2>Server-side structure</h2>',
      '      <p class="nfr-panel-copy">The Media Bank is backed by a same-origin store that can grow without bloating git with large binaries.</p>',
      '      <ul class="nfr-list">',
      '        <li><span class="nfr-code">catalog.json</span> approved metadata surfaced to the UI and future AI selectors</li>',
      '        <li><span class="nfr-code">files/</span> same-origin approved assets or lightweight placeholders</li>',
      '        <li><span class="nfr-code">thumbnails/</span> fast preview surfaces for dashboards and catalog cards</li>',
      '        <li><span class="nfr-code">licenses/</span> provenance and internal review notes</li>',
      '      </ul>',
      "    </section>",
      '    <section class="nfr-panel">',
      '      <p class="nfr-section-kicker">AI boundary</p>',
      '      <h2>Media Context Packer</h2>',
      '      <p class="nfr-panel-copy">' + escapeHtml(selection.purpose || "") + "</p>",
      '      <div class="nfr-tag-row">',
      (Array.isArray(selection.filters) ? selection.filters : []).map(function (filter) {
        return '<span class="nfr-tag">' + escapeHtml(filter) + "</span>";
      }).join(""),
      "      </div>",
      '      <p class="nfr-panel-copy">Future adapter boundary: <span class="nfr-code">' + escapeHtml(selection.futureAdapter || "") + "</span></p>",
      "    </section>",
      "  </div>",
      '  <section class="nfr-grid">',
      assets.map(renderMediaCard).join(""),
      "  </section>",
      "</div>"
    ].join("");
  }

  function renderFigmaBody() {
    return [
      '<div class="nfr-stack">',
        renderStats([
          { value: ".penpot / .zip", label: "Current native Penpot import targets" },
          { value: "SVG / PNG / PDF", label: "Easy migration layer for asset-first handoff" },
          { value: "No 1:1 promise", label: "Components, autolayout, and prototype fidelity remain hard problems" }
        ]),
      '  <div class="nfr-columns">',
      '    <section class="nfr-dropzone">',
      '      <p class="nfr-section-kicker">Intake surface</p>',
      '      <h2 class="nfr-dropzone-title">Upload or connect a Figma source</h2>',
      '      <p class="nfr-dropzone-copy">The next patch can accept a user-provided export bundle or a safe API/token-based connection. PATCH 018A ships the surface and checklist only.</p>',
      '      <div class="nfr-actions">',
      '        <button class="nfr-disabled-btn" type="button" disabled>Drop .fig export here</button>',
      '        <button class="nfr-disabled-btn" type="button" disabled>Analyze file - coming next</button>',
      "      </div>",
      "    </section>",
      '    <section class="nfr-panel">',
      '      <p class="nfr-section-kicker">Connection placeholders</p>',
      '      <h2>Safe connection fields</h2>',
      '      <div class="nfr-form-grid">',
      '        <div class="nfr-field"><label>Figma file URL</label><input type="text" disabled value="https://www.figma.com/file/..."/></div>',
      '        <div class="nfr-field"><label>Access token</label><input type="password" disabled value="********************"/></div>',
      '        <div class="nfr-field"><label>Notes</label><textarea rows="4" disabled>Analyze pages, frames, components, fonts, and exported assets before any conversion attempt.</textarea></div>',
      "      </div>",
      "    </section>",
      "  </div>",
      '  <section class="nfr-panel">',
      '    <p class="nfr-section-kicker">Migration checklist</p>',
      '    <h2>What NOFIDA will inspect first</h2>',
      '    <div class="nfr-checklist">',
      '      <div class="nfr-check"><span class="nfr-check-mark">1</span><div class="nfr-check-copy">Pages, frames, and exported assets are inventoried before any structure mapping is attempted.</div></div>',
      '      <div class="nfr-check"><span class="nfr-check-mark">2</span><div class="nfr-check-copy">Fonts are matched against NOFIDA Font Hub so unsupported or licensed fonts can be flagged early.</div></div>',
      '      <div class="nfr-check"><span class="nfr-check-mark">3</span><div class="nfr-check-copy">Illustrations, icons, and media are matched against the Media Bank and NOFIDA Hub before creating replacements.</div></div>',
      '      <div class="nfr-check"><span class="nfr-check-mark">4</span><div class="nfr-check-copy">A migration report is generated before any optional Penpot import adapter work is considered.</div></div>',
      "    </div>",
      "  </section>",
      '  <section class="nfr-feasibility">',
      '    <article class="nfr-tier easy"><p class="nfr-section-kicker">Easy</p><h3>Asset migration</h3><p>SVG, PNG, PDF, and raster exports can move into NOFIDA quickly as files, placeholders, or Hub-ready resources.</p></article>',
      '    <article class="nfr-tier medium"><p class="nfr-section-kicker">Medium</p><h3>Tokens and reports</h3><p>Design tokens JSON, asset extraction, and font replacement reporting are realistic next steps once exports are standardized.</p></article>',
      '    <article class="nfr-tier hard"><p class="nfr-section-kicker">Hard</p><h3>Native layer mapping</h3><p>Figma node trees, component variants, and autolayout fidelity require deliberate mapping into Penpot concepts.</p></article>',
      '    <article class="nfr-tier very-hard"><p class="nfr-section-kicker">Very hard</p><h3>Prototype parity</h3><p>Perfect 1:1 interactions, plugin-specific payloads, and hidden product logic should not be promised in the product UI.</p></article>',
      "  </section>",
      '  <section class="nfr-panel">',
      '    <p class="nfr-section-kicker">Future architecture</p>',
      '    <h2>Recommended importer pipeline</h2>',
      '    <ul class="nfr-list">',
      '      <li>Figma source reader</li>',
      '      <li>Asset exporter</li>',
      '      <li>Token mapper</li>',
      '      <li>Font mapper</li>',
      '      <li>Component mapper</li>',
      '      <li>NOFIDA Hub matcher</li>',
      '      <li>Migration report generator</li>',
      '      <li>Optional Penpot file generator or import adapter</li>',
      "    </ul>",
      "  </section>",
      "</div>"
    ].join("");
  }

  function renderError(message) {
    return '<div class="nfr-error">' + escapeHtml(message) + "</div>";
  }

  function renderLoading(copy) {
    return '<div class="nfr-empty">' + escapeHtml(copy) + "</div>";
  }

  function loadJson(cacheKey, url) {
    if (state[cacheKey]) return Promise.resolve(state[cacheKey]);
    if (state.pending[cacheKey]) return state.pending[cacheKey];

    state.pending[cacheKey] = fetch(url, {
      credentials: "same-origin",
      cache: "no-store"
    }).then(function (response) {
      if (!response.ok) throw new Error("Request failed with status " + response.status);
      return response.json();
    }).then(function (payload) {
      state[cacheKey] = payload;
      state.pending[cacheKey] = null;
      return payload;
    }).catch(function (error) {
      state.pending[cacheKey] = null;
      throw error;
    });

    return state.pending[cacheKey];
  }

  function renderBody(pageId, token) {
    var content = state.overlayEl.querySelector("#nfr-content");

    if (pageId === "figma") {
      content.innerHTML = renderFigmaBody();
      return;
    }

    if (pageId === "fonts") {
      content.innerHTML = renderLoading("Loading curated font catalog...");
      loadJson("fontCatalog", FONT_CATALOG_URL)
        .then(function (catalog) {
          if (state.renderToken !== token || state.currentPageId !== pageId) return;
          content.innerHTML = renderFontBody(catalog);
        })
        .catch(function (error) {
          if (state.renderToken !== token || state.currentPageId !== pageId) return;
          content.innerHTML = renderError("Could not load the font catalog. " + error.message);
        });
      return;
    }

    if (pageId === "media") {
      content.innerHTML = renderLoading("Loading same-origin media catalog...");
      loadJson("mediaCatalog", MEDIA_CATALOG_URL)
        .then(function (catalog) {
          if (state.renderToken !== token || state.currentPageId !== pageId) return;
          content.innerHTML = renderMediaBody(catalog);
        })
        .catch(function (error) {
          if (state.renderToken !== token || state.currentPageId !== pageId) return;
          content.innerHTML = renderError("Could not load the media catalog. " + error.message);
        });
    }
  }

  function ensureOverlay() {
    if (state.overlayEl) return state.overlayEl;

    var style = document.createElement("style");
    style.id = "nfr-styles";
    style.textContent = RESOURCE_CSS;
    document.head.appendChild(style);

    var overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.setAttribute("hidden", "");
    overlay.innerHTML = [
      '<div class="nfr-shell">',
      '  <div class="nfr-topbar">',
      '    <button class="nfr-back" id="nfr-back" type="button">Back to previous screen</button>',
      '    <button class="nfr-close" id="nfr-close" type="button" aria-label="Close resource page">Close</button>',
      "  </div>",
      '  <div class="nfr-layout">',
      '    <aside class="nfr-nav-panel">',
      '      <p class="nfr-nav-kicker">Resources</p>',
      '      <div class="nfr-nav-list" id="nfr-nav"></div>',
      "    </aside>",
      '    <main class="nfr-main" aria-live="polite">',
      '      <section class="nfr-hero">',
      '        <div class="nfr-hero-head">',
      '          <span class="nfr-badge" id="nfr-badge">Resource page</span>',
      '          <h1 id="nfr-title">NOFIDA Resources</h1>',
      "        </div>",
      '        <p class="nfr-intro" id="nfr-intro"></p>',
      '        <div id="nfr-actions"></div>',
      '        <div class="nfr-notice" id="nfr-notice"></div>',
      "      </section>",
      '      <section id="nfr-content"></section>',
      '      <p class="nfr-footer-note" id="nfr-footer-note">Internal NOFIDA resource page.</p>',
      "    </main>",
      "  </div>",
      "</div>"
    ].join("");

    document.body.appendChild(overlay);
    overlay.querySelector("#nfr-back").addEventListener("click", closeToPrevious);
    overlay.querySelector("#nfr-close").addEventListener("click", closeToPrevious);
    state.overlayEl = overlay;
    return overlay;
  }

  function renderPage(pageId) {
    var page = PAGES[pageId];
    if (!page) return;

    var overlay = ensureOverlay();
    var token = Date.now();
    state.renderToken = token;
    state.currentPageId = pageId;

    overlay.querySelector("#nfr-nav").innerHTML = renderNav(pageId);
    overlay.querySelector("#nfr-badge").textContent = page.badge;
    overlay.querySelector("#nfr-title").textContent = page.title;
    overlay.querySelector("#nfr-intro").textContent = page.intro;
    overlay.querySelector("#nfr-actions").innerHTML = renderActions(page.actions || []);
    overlay.querySelector("#nfr-notice").textContent = page.notice || "";
    overlay.querySelector("#nfr-footer-note").textContent =
      pageId === "figma"
        ? "Migration guidance only. Conversion engine not included in this patch."
        : "Internal NOFIDA resource page.";

    renderBody(pageId, token);
    overlay.scrollTop = 0;
  }

  function showPage(pageId) {
    var overlay = ensureOverlay();
    renderPage(pageId);
    overlay.removeAttribute("hidden");
    document.body.style.overflow = "hidden";
  }

  function hidePages() {
    if (!state.overlayEl) return;
    state.overlayEl.setAttribute("hidden", "");
    document.body.style.overflow = "";
  }

  function closeToPrevious() {
    var back = normalizeHash(state.lastAppHash || "#/dashboard");
    if (isResourceHash(back)) back = "#/dashboard";
    window.location.hash = back.slice(1);
  }

  function onHashChange() {
    var hash = normalizeHash(window.location.hash || "#/dashboard");
    var pageId = getPageIdFromHash(hash);

    if (pageId) {
      showPage(pageId);
      return;
    }

    rememberAppHash(hash);
    hidePages();
  }

  function onKeyDown(event) {
    if (event.key !== "Escape") return;
    if (!state.overlayEl || state.overlayEl.hasAttribute("hidden")) return;
    closeToPrevious();
  }

  function init() {
    rememberAppHash(window.location.hash || "#/dashboard");
    ensureOverlay();
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("keydown", onKeyDown);
    onHashChange();

    window.NofidaResources = {
      open: function (pageId) {
        var target = pageHref(pageId);
        window.location.hash = target.slice(1);
      },
      close: closeToPrevious,
      current: function () {
        return state.currentPageId || "";
      }
    };
  }

  onReady(init);
})();
