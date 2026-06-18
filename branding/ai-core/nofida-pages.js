(function () {
  "use strict";

  if (window.NofidaPages) return;

  var OVERLAY_ID = "nfp-overlay";
  var PAGE_IDS = [
    "help",
    "learn",
    "repository",
    "community",
    "releases",
    "changelog",
    "terms",
    "privacy",
    "open-source-notices"
  ];

  var NAV_ITEMS = [
    { id: "help", label: "Help" },
    { id: "learn", label: "Learn" },
    { id: "repository", label: "Repository" },
    { id: "community", label: "Community" },
    { id: "releases", label: "Releases" },
    { id: "changelog", label: "Changelog" },
    { id: "terms", label: "Terms" },
    { id: "privacy", label: "Privacy" },
    { id: "open-source-notices", label: "Notices" }
  ];

  var state = {
    overlayEl: null,
    lastAppHash: "#/dashboard",
    currentPageId: ""
  };

  var PAGES = {
    help: {
      title: "Help Center",
      badge: "Internal guide",
      intro: "Practical NOFIDA help for everyday work: files, libraries, fonts, media, migration prep, AI settings, and support.",
      actions: [
        { label: "Open dashboard", href: "#/dashboard" },
        { label: "Open font catalog", href: "#/nofida/fonts" },
        { label: "Open NOFIDA Hub", href: "#/nofida/libraries" },
        { label: "AI settings", href: "#/settings/options?nofida=ai&tab=api" }
      ],
      sections: [
        {
          title: "Create files",
          text: "Start from a team project, create a file, and keep one flow per page so handoff stays easy to scan.",
          links: [
            { label: "Dashboard", href: "#/dashboard" },
            { label: "Learn basics", href: "#/nofida/learn" }
          ]
        },
        {
          title: "Import templates",
          text: "Use the built-in import flow for local .penpot files, or add approved templates from the internal catalog.",
          links: [
            { label: "NOFIDA Hub", href: "#/nofida/libraries" },
            { label: "Release notes", href: "#/nofida/releases" }
          ]
        },
        {
          title: "Use NOFIDA Hub",
          text: "Browse libraries, icon sets, UI kits, and templates from one internal route without leaving your workspace.",
          links: [
            { label: "Open catalog", href: "#/nofida/libraries" },
            { label: "Open source notices", href: "#/nofida/open-source-notices" }
          ]
        },
        {
          title: "Resource foundations",
          text: "Use the Fonts workspace for recommended typography, the font catalog for pairings and license checks, Media Bank for same-origin assets, and the Figma migration page for report-first migration planning.",
          links: [
            { label: "Font catalog", href: "#/nofida/fonts" },
            { label: "Media Bank", href: "#/nofida/media" },
            { label: "Figma import", href: "#/nofida/import/figma" }
          ]
        },
        {
          title: "Pages, layers, and components",
          text: "Keep page names clean, group related layers, and move shared UI into components before the file grows.",
          links: [
            { label: "Components guide", href: "#/nofida/learn" },
            { label: "Team practices", href: "#/nofida/community" }
          ]
        },
        {
          title: "AI settings",
          text: "Provider keys are configured in account settings. Models can be assigned by role so fast and deep tasks stay separate.",
          links: [
            { label: "Open AI settings", href: "#/settings/options?nofida=ai&tab=api" },
            { label: "AI safety notes", href: "#/nofida/learn" }
          ]
        },
        {
          title: "Support path",
          text: "Use the community page for support routing, feedback intake, and admin follow-up when your team needs help.",
          links: [
            { label: "Community", href: "#/nofida/community" },
            { label: "Privacy draft", href: "#/nofida/privacy" }
          ]
        }
      ]
    },
    learn: {
      title: "Learning Center",
      badge: "Short guides",
      intro: "Compact learning tracks for designers and admins who want to get productive in NOFIDA quickly.",
      actions: [
        { label: "Back to help", href: "#/nofida/help" },
        { label: "Open font catalog", href: "#/nofida/fonts" },
        { label: "Open NOFIDA Hub", href: "#/nofida/libraries" },
        { label: "Figma import", href: "#/nofida/import/figma" },
        { label: "Model setup", href: "#/settings/options?nofida=ai&tab=models" }
      ],
      sections: [
        {
          title: "Start your first design file",
          text: "Create one focused file, name the main pages early, and use frames to separate screens from experiments.",
          links: [
            { label: "Help center", href: "#/nofida/help" },
            { label: "Dashboard", href: "#/dashboard" }
          ]
        },
        {
          title: "Use libraries and templates",
          text: "Pull in a baseline kit from the internal catalog instead of rebuilding buttons, icons, and spacing rules from scratch.",
          links: [
            { label: "NOFIDA Hub", href: "#/nofida/libraries" },
            { label: "Recent updates", href: "#/nofida/releases" }
          ]
        },
        {
          title: "Choose typography and media early",
          text: "Lock type systems and asset direction before detailed screens so migration work and component decisions do not drift later.",
          links: [
            { label: "Font catalog", href: "#/nofida/fonts" },
            { label: "Media Bank", href: "#/nofida/media" }
          ]
        },
        {
          title: "Build with components",
          text: "Turn repeated UI into components early, then evolve variants only after naming and usage patterns are stable.",
          links: [
            { label: "Repository page", href: "#/nofida/repository" },
            { label: "Changelog", href: "#/nofida/changelog" }
          ]
        },
        {
          title: "Organize design systems",
          text: "Keep tokens, shared components, and examples close together so new teammates can learn the system by opening one file.",
          links: [
            { label: "Community practices", href: "#/nofida/community" },
            { label: "Open source notices", href: "#/nofida/open-source-notices" }
          ]
        },
        {
          title: "Use NOFIDA AI safely",
          text: "Only enable external providers that your team approves, test prompts on non-sensitive work, and review AI output before shipping.",
          links: [
            { label: "AI settings", href: "#/settings/options?nofida=ai&tab=api" },
            { label: "Privacy draft", href: "#/nofida/privacy" }
          ]
        },
        {
          title: "Migrate from Figma realistically",
          text: "Start with exports, asset extraction, and migration reporting. Treat 1:1 component and prototype fidelity as follow-up engineering work, not a promise.",
          links: [
            { label: "Figma import", href: "#/nofida/import/figma" },
            { label: "Font catalog", href: "#/nofida/fonts" }
          ]
        }
      ]
    },
    repository: {
      title: "Repository",
      badge: "Product distribution",
      intro: "This page explains how NOFIDA is packaged and maintained as an internal product distribution for your organization.",
      actions: [
        { label: "Open source notices", href: "#/nofida/open-source-notices" },
        { label: "Release notes", href: "#/nofida/releases" },
        { label: "Back to help", href: "#/nofida/help" }
      ],
      sections: [
        {
          title: "What this repository is",
          text: "It is the internal delivery layer for the branded NOFIDA workspace, including product pages, UI overlays, and deploy scripts.",
          links: [
            { label: "Changelog", href: "#/nofida/changelog" },
            { label: "Release notes", href: "#/nofida/releases" }
          ]
        },
        {
          title: "How updates move",
          text: "Work is changed here first, verified against the live workspace, then deployed as a same-origin NOFIDA build.",
          links: [
            { label: "Community process", href: "#/nofida/community" },
            { label: "Help center", href: "#/nofida/help" }
          ]
        },
        {
          title: "What users receive",
          text: "Users stay inside one NOFIDA application for help, learning, the Fonts workspace and font catalog, Media Bank, NOFIDA Hub, migration prep, and account-level AI configuration.",
          links: [
            { label: "NOFIDA Hub", href: "#/nofida/libraries" },
            { label: "Font catalog", href: "#/nofida/fonts" },
            { label: "Media Bank", href: "#/nofida/media" }
          ]
        },
        {
          title: "Open source notices",
          text: "Licensing and attribution belong in a neutral notices page, not in a marketing or outbound product navigation flow.",
          links: [
            { label: "View notices", href: "#/nofida/open-source-notices" },
            { label: "Terms draft", href: "#/nofida/terms" }
          ]
        },
        {
          title: "Admin checks",
          text: "Before rollout, confirm build routing, internal links, AI provider policy, and notices text for your deployment policy.",
          links: [
            { label: "Privacy draft", href: "#/nofida/privacy" },
            { label: "Release notes", href: "#/nofida/releases" }
          ]
        }
      ]
    },
    community: {
      title: "Community",
      badge: "Support and feedback",
      intro: "A simple NOFIDA page for team support, rollout guidance, feedback intake, and future community planning.",
      actions: [
        { label: "Help center", href: "#/nofida/help" },
        { label: "Repository", href: "#/nofida/repository" },
        { label: "Open dashboard", href: "#/dashboard" }
      ],
      sections: [
        {
          title: "Team workspace guidance",
          text: "Use one shared file for patterns, one file for active product work, and a clear owner for system-level components.",
          links: [
            { label: "Learning center", href: "#/nofida/learn" },
            { label: "Changelog", href: "#/nofida/changelog" }
          ]
        },
        {
          title: "Support channel",
          text: "Route product questions through your internal NOFIDA support owner so issues stay tied to the right team and deployment.",
          links: [
            { label: "Help center", href: "#/nofida/help" },
            { label: "Privacy draft", href: "#/nofida/privacy" }
          ]
        },
        {
          title: "Feedback intake",
          text: "Collect broken flows, upgrade pain points, and missing library requests in one place before planning the next patch.",
          links: [
            { label: "Release notes", href: "#/nofida/releases" },
            { label: "Repository", href: "#/nofida/repository" }
          ]
        },
        {
          title: "Future community space",
          text: "This area can later expand into announcements, office hours, shared examples, or internal design standards.",
          links: [
            { label: "Open source notices", href: "#/nofida/open-source-notices" },
            { label: "Terms draft", href: "#/nofida/terms" }
          ]
        },
        {
          title: "Escalation path",
          text: "If an issue affects access, data safety, or provider configuration, escalate through the admin path before general rollout.",
          links: [
            { label: "AI settings", href: "#/settings/options?nofida=ai&tab=api" },
            { label: "Privacy draft", href: "#/nofida/privacy" }
          ]
        }
      ]
    },
    releases: {
      title: "Release Notes",
      badge: "Current line",
      intro: "Recent NOFIDA changes for the current product line built on the 2.16.0 base with NOFIDA patch overlays.",
      actions: [
        { label: "View changelog", href: "#/nofida/changelog" },
        { label: "Open NOFIDA Hub", href: "#/nofida/libraries" },
        { label: "Repository", href: "#/nofida/repository" }
      ],
      sections: [
        {
          title: "Current release focus",
          text: "PATCH 018B turns the resource foundation into a product layer: native Fonts guidance, Media Bank inventory, a UI pattern registry, and a report-first Figma migration assistant.",
          links: [
            { label: "Font catalog", href: "#/nofida/fonts" },
            { label: "Media Bank", href: "#/nofida/media" },
            { label: "Figma import", href: "#/nofida/import/figma" }
          ]
        },
        {
          title: "Hub updates",
          text: "The NOFIDA Hub remains the internal route for libraries, templates, UI kits, and starter assets, now linked to the newer resource surfaces.",
          links: [
            { label: "Open catalog", href: "#/nofida/libraries" },
            { label: "Repository", href: "#/nofida/repository" },
            { label: "Font catalog", href: "#/nofida/fonts" }
          ]
        },
        {
          title: "AI settings updates",
          text: "Account-level provider configuration, model assignment, and engine role controls stay available inside the same workspace.",
          links: [
            { label: "AI settings", href: "#/settings/options?nofida=ai&tab=api" },
            { label: "Learning center", href: "#/nofida/learn" }
          ]
        },
        {
          title: "Branding cleanup",
          text: "User-facing help, learn, repository, community, release, changelog, terms, and privacy flows now stay under NOFIDA routes.",
          links: [
            { label: "Terms draft", href: "#/nofida/terms" },
            { label: "Privacy draft", href: "#/nofida/privacy" }
          ]
        },
        {
          title: "Admin follow-up",
          text: "After each deploy, verify internal routes, provider configuration, notices text, and same-origin behavior from the live domain.",
          links: [
            { label: "Open source notices", href: "#/nofida/open-source-notices" },
            { label: "Community", href: "#/nofida/community" }
          ]
        }
      ]
    },
    changelog: {
      title: "Changelog",
      badge: "Patch history",
      intro: "A short chronological NOFIDA record of the changes that shape the current branded workspace.",
      actions: [
        { label: "Release notes", href: "#/nofida/releases" },
        { label: "Repository", href: "#/nofida/repository" },
        { label: "Help center", href: "#/nofida/help" }
      ],
      sections: [
        {
          title: "PATCH 018A",
          text: "NOFIDA now includes a resource product layer with a native-font workflow, the font catalog, Media Bank, UI patterns, and a report-first Figma migration assistant backed by same-origin metadata.",
          links: [
            { label: "Font catalog", href: "#/nofida/fonts" },
            { label: "Media Bank", href: "#/nofida/media" },
            { label: "Figma import", href: "#/nofida/import/figma" }
          ]
        },
        {
          title: "PATCH 017A",
          text: "Internal NOFIDA pages now cover help, learn, repository, community, releases, changelog, terms, privacy, and notices.",
          links: [
            { label: "Help center", href: "#/nofida/help" },
            { label: "Privacy draft", href: "#/nofida/privacy" }
          ]
        },
        {
          title: "PATCH 016B-016C",
          text: "Account-level AI settings were added, and external product links began routing back into branded NOFIDA surfaces.",
          links: [
            { label: "AI settings", href: "#/settings/options?nofida=ai&tab=api" },
            { label: "Release notes", href: "#/nofida/releases" }
          ]
        },
        {
          title: "PATCH 015B",
          text: "NOFIDA Hub became a full internal catalog route for team libraries, templates, and reusable design assets.",
          links: [
            { label: "NOFIDA Hub", href: "#/nofida/libraries" },
            { label: "Learning center", href: "#/nofida/learn" }
          ]
        },
        {
          title: "PATCH 014H-014M",
          text: "Native import adapter, inventory cleanup, file quality checks, and thumbnail reliability improvements were introduced.",
          links: [
            { label: "Repository", href: "#/nofida/repository" },
            { label: "Release notes", href: "#/nofida/releases" }
          ]
        }
      ]
    },
    terms: {
      title: "Terms of Use",
      badge: "Draft placeholder",
      intro: "This is a product placeholder for NOFIDA terms. It provides structure only and is not final legal advice or a finished legal document.",
      notice: "Draft. Replace with legal-approved text before public/commercial launch.",
      actions: [
        { label: "Privacy draft", href: "#/nofida/privacy" },
        { label: "Open source notices", href: "#/nofida/open-source-notices" },
        { label: "Back to help", href: "#/nofida/help" }
      ],
      sections: [
        {
          title: "Use scope",
          text: "NOFIDA is presented here as an internal or self-hosted workspace operated under the deployment rules of your organization.",
          links: [
            { label: "Repository", href: "#/nofida/repository" },
            { label: "Community", href: "#/nofida/community" }
          ]
        },
        {
          title: "Accounts and access",
          text: "Access, team membership, and role permissions should be managed by the responsible admin or workspace owner.",
          links: [
            { label: "Help center", href: "#/nofida/help" },
            { label: "Privacy draft", href: "#/nofida/privacy" }
          ]
        },
        {
          title: "User content",
          text: "User-created files, libraries, and project content remain user or organization content, subject to your internal policy.",
          links: [
            { label: "NOFIDA Hub", href: "#/nofida/libraries" },
            { label: "Open source notices", href: "#/nofida/open-source-notices" }
          ]
        },
        {
          title: "External AI providers",
          text: "External LLM providers may be connected by the user or admin. Those integrations should be enabled only under approved policy.",
          links: [
            { label: "AI settings", href: "#/settings/options?nofida=ai&tab=api" },
            { label: "Learning center", href: "#/nofida/learn" }
          ]
        },
        {
          title: "Draft status",
          text: "This page is a placeholder structure for future legal review and should not be treated as the final legal agreement.",
          links: [
            { label: "Release notes", href: "#/nofida/releases" },
            { label: "Back to repository", href: "#/nofida/repository" }
          ]
        }
      ]
    },
    privacy: {
      title: "Privacy / Data",
      badge: "Draft placeholder",
      intro: "This is a NOFIDA privacy placeholder that explains the intended data flow at a high level without claiming legal finality.",
      notice: "Draft. Replace with legal-approved text before public/commercial launch.",
      actions: [
        { label: "Terms draft", href: "#/nofida/terms" },
        { label: "AI settings", href: "#/settings/options?nofida=ai&tab=api" },
        { label: "Back to help", href: "#/nofida/help" }
      ],
      sections: [
        {
          title: "Stored workspace data",
          text: "NOFIDA stores account, team, project, and design-file data on the configured server used by your deployment.",
          links: [
            { label: "Repository", href: "#/nofida/repository" },
            { label: "Community", href: "#/nofida/community" }
          ]
        },
        {
          title: "Provider keys",
          text: "AI provider keys are stored server-side and are masked in the UI so raw secrets are not exposed to the frontend.",
          links: [
            { label: "AI settings", href: "#/settings/options?nofida=ai&tab=api" },
            { label: "Learning center", href: "#/nofida/learn" }
          ]
        },
        {
          title: "External AI calls",
          text: "Calls to external LLM providers happen only when an approved provider is configured and a NOFIDA AI action is used.",
          links: [
            { label: "Help center", href: "#/nofida/help" },
            { label: "Release notes", href: "#/nofida/releases" }
          ]
        },
        {
          title: "Operational visibility",
          text: "Admins may need access to logs, health checks, and deploy status to operate the service safely inside the organization.",
          links: [
            { label: "Open source notices", href: "#/nofida/open-source-notices" },
            { label: "Repository", href: "#/nofida/repository" }
          ]
        },
        {
          title: "Draft status",
          text: "This page is a structural placeholder only and should be replaced with legal-approved privacy text before wider launch.",
          links: [
            { label: "Terms draft", href: "#/nofida/terms" },
            { label: "Changelog", href: "#/nofida/changelog" }
          ]
        }
      ]
    },
    "open-source-notices": {
      title: "Open Source Notices",
      badge: "Neutral attribution",
      intro: "A neutral place for licensing, attribution, source-model disclosures, and adapted-resource notices that should stay separate from product marketing navigation.",
      actions: [
        { label: "Repository", href: "#/nofida/repository" },
        { label: "Terms draft", href: "#/nofida/terms" },
        { label: "Privacy draft", href: "#/nofida/privacy" }
      ],
      sections: [
        {
          title: "Base application notice",
          text: "NOFIDA includes open source components that power the editor, service layer, and reviewed resource stores inside the branded workspace.",
          links: [
            { label: "Repository", href: "#/nofida/repository" },
            { label: "Release notes", href: "#/nofida/releases" }
          ]
        },
        {
          title: "NOFIDA overlay layer",
          text: "Brand assets, internal pages, AI settings UI, the NOFIDA Hub route, and native-resource overlays are part of the NOFIDA-specific integration layer.",
          links: [
            { label: "Help center", href: "#/nofida/help" },
            { label: "Changelog", href: "#/nofida/changelog" }
          ]
        },
        {
          title: "Library and template content",
          text: "Reviewed font files, media assets, UI pattern source models, and imported libraries may carry their own license, attribution, or approval requirements and should be checked before broad reuse.",
          links: [
            { label: "NOFIDA Hub", href: "#/nofida/libraries" },
            { label: "Font catalog", href: "#/nofida/fonts" },
            { label: "Media Bank", href: "#/nofida/media" }
          ]
        },
        {
          title: "Resource sources",
          text: "Current reviewed sources include Google Fonts open-license families for the font store, NOFIDA-authored CC0 SVG media assets, and NOFIDA-authored UI pattern summaries that record shadcn/ui or Radix UI as source models where applicable.",
          links: [
            { label: "Terms draft", href: "#/nofida/terms" },
            { label: "Privacy draft", href: "#/nofida/privacy" }
          ]
        },
        {
          title: "Admin reminder",
          text: "Re-check versions, license allowlists, attribution requirements, and approval states whenever the base product line or the reviewed resource inventory changes.",
          links: [
            { label: "Release notes", href: "#/nofida/releases" },
            { label: "Repository", href: "#/nofida/repository" }
          ]
        }
      ]
    }
  };

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

  function getHashPath() {
    var hash = window.location.hash || "";
    var queryIndex = hash.indexOf("?");
    return queryIndex >= 0 ? hash.slice(0, queryIndex) : hash;
  }

  function normalizeHash(hash) {
    if (!hash) return "#/dashboard";
    return hash.charAt(0) === "#" ? hash : "#" + hash;
  }

  function getPageIdFromHash(hash) {
    var path = hash || getHashPath();
    var match = path.match(/^#\/nofida\/([a-z0-9-]+)$/);
    if (!match) return "";
    return PAGE_IDS.indexOf(match[1]) >= 0 ? match[1] : "";
  }

  function isPageHash(hash) {
    return !!getPageIdFromHash(hash);
  }

  function rememberAppHash(hash) {
    var next = normalizeHash(hash || window.location.hash || "#/dashboard");
    if (isPageHash(next)) return;
    state.lastAppHash = next;
  }

  function renderLinks(links) {
    if (!Array.isArray(links) || links.length === 0) return "";
    return [
      '<div class="nfp-links">',
      links.map(function (link) {
        return '<a href="' + escapeHtml(link.href) + '">' + escapeHtml(link.label) + "</a>";
      }).join(""),
      "</div>"
    ].join("");
  }

  function renderActions(actions) {
    if (!Array.isArray(actions) || actions.length === 0) return "";
    return [
      '<div class="nfp-actions">',
      actions.map(function (action, index) {
        var klass = index === 0 ? "nfp-btn nfp-btn-primary" : "nfp-btn nfp-btn-secondary";
        return '<a class="' + klass + '" href="' + escapeHtml(action.href) + '">' + escapeHtml(action.label) + "</a>";
      }).join(""),
      "</div>"
    ].join("");
  }

  function renderSections(sections) {
    return sections.map(function (section) {
      return [
        '<article class="nfp-card">',
        '  <p class="nfp-card-kicker">NOFIDA</p>',
        '  <h3>' + escapeHtml(section.title) + "</h3>",
        '  <p class="nfp-card-copy">' + escapeHtml(section.text) + "</p>",
           renderLinks(section.links),
        "</article>"
      ].join("");
    }).join("");
  }

  function renderNav(currentPageId) {
    return NAV_ITEMS.map(function (item) {
      var classes = ["nfp-nav-link"];
      if (item.id === currentPageId) classes.push("active");
      return '<a class="' + classes.join(" ") + '" href="#/nofida/' + item.id + '">' +
        escapeHtml(item.label) + "</a>";
    }).join("");
  }

  function renderPage(pageId) {
    var page = PAGES[pageId];
    if (!page || !state.overlayEl) return;
    state.currentPageId = pageId;

    var overlay = state.overlayEl;
    overlay.querySelector("#nfp-nav").innerHTML = renderNav(pageId);
    overlay.querySelector("#nfp-badge").textContent = page.badge || "Internal page";
    overlay.querySelector("#nfp-title").textContent = page.title;
    overlay.querySelector("#nfp-intro").textContent = page.intro;
    overlay.querySelector("#nfp-actions-wrap").innerHTML = renderActions(page.actions || []);

    var noticeEl = overlay.querySelector("#nfp-notice");
    if (page.notice) {
      noticeEl.textContent = page.notice;
      noticeEl.hidden = false;
    } else {
      noticeEl.hidden = true;
      noticeEl.textContent = "";
    }

    overlay.querySelector("#nfp-grid").innerHTML = renderSections(page.sections || []);
    overlay.querySelector("#nfp-footer-note").textContent =
      pageId === "terms" || pageId === "privacy"
        ? "Placeholder only. Replace after legal review."
        : "Internal NOFIDA product page.";
    overlay.scrollTop = 0;
  }

  function buildOverlay() {
    if (state.overlayEl) return state.overlayEl;

    var overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.setAttribute("hidden", "");
    overlay.innerHTML = [
      '<div class="nfp-shell">',
      '  <div class="nfp-topbar">',
      '    <button class="nfp-back" id="nfp-back" type="button">Back to previous screen</button>',
      '    <button class="nfp-close" id="nfp-close" type="button" aria-label="Close NOFIDA page">Close</button>',
      "  </div>",
      '  <div class="nfp-layout">',
      '    <aside class="nfp-nav-panel">',
      '      <p class="nfp-nav-kicker">NOFIDA pages</p>',
      '      <div class="nfp-nav" id="nfp-nav"></div>',
      "    </aside>",
      '    <main class="nfp-main" aria-live="polite">',
      '      <section class="nfp-hero">',
      '        <div class="nfp-hero-head">',
      '          <span class="nfp-badge" id="nfp-badge">Internal page</span>',
      '          <h1 id="nfp-title">NOFIDA</h1>',
      "        </div>",
      '        <p class="nfp-intro" id="nfp-intro"></p>',
      '        <div class="nfp-actions-wrap" id="nfp-actions-wrap"></div>',
      '        <div class="nfp-notice" id="nfp-notice" hidden></div>',
      "      </section>",
      '      <section class="nfp-grid" id="nfp-grid"></section>',
      '      <p class="nfp-footer-note" id="nfp-footer-note"></p>',
      "    </main>",
      "  </div>",
      "</div>"
    ].join("");

    document.body.appendChild(overlay);
    overlay.querySelector("#nfp-back").addEventListener("click", closeToPrevious);
    overlay.querySelector("#nfp-close").addEventListener("click", closeToPrevious);

    state.overlayEl = overlay;
    return overlay;
  }

  function showPage(pageId) {
    var overlay = buildOverlay();
    renderPage(pageId);
    overlay.removeAttribute("hidden");
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(function () {
      if (state.overlayEl && !state.overlayEl.hasAttribute("hidden")) {
        document.body.style.overflow = "hidden";
      }
    });
  }

  function hidePages() {
    if (!state.overlayEl) return;
    state.overlayEl.setAttribute("hidden", "");
    document.body.style.overflow = "";
  }

  function closeToPrevious() {
    var back = normalizeHash(state.lastAppHash || "#/dashboard");
    if (isPageHash(back)) back = "#/dashboard";
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

  function onKeyDown(ev) {
    if (ev.key !== "Escape") return;
    if (!state.overlayEl || state.overlayEl.hasAttribute("hidden")) return;
    closeToPrevious();
  }

  function init() {
    rememberAppHash(window.location.hash || "#/dashboard");
    buildOverlay();
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("keydown", onKeyDown);
    onHashChange();

    window.NofidaPages = {
      open: function (pageId) {
        if (PAGE_IDS.indexOf(pageId) === -1) pageId = "help";
        window.location.hash = "/nofida/" + pageId;
      },
      close: closeToPrevious,
      current: function () {
        return state.currentPageId || "";
      }
    };
  }

  onReady(init);
})();
