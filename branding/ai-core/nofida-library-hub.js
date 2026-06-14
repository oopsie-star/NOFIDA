/* ============================================================================
 * NOFIDA Library Hub  —  PATCH 014J
 * ---------------------------------------------------------------------------
 * Global internal catalog for every logged-in NOFIDA user.
 *
 * What this file does:
 *   1. Injects "Библиотеки NOFIDA" item into the left sidebar (any team).
 *   2. Shows a full-screen overlay catalog at #/nofida/libraries.
 *   3. Replaces / enhances the bottom "Библиотеки и шаблоны" gallery block
 *      so external Penpot.app links are never the primary action.
 *   4. Per-user / per-team import: downloads the vendored .penpot file from
 *      the internal engine URL and imports it into the current user's team
 *      using Penpot's native RPC endpoint.  Duplicate detection runs against
 *      the live Penpot API (localStorage is only a speed-cache).
 *
 * Constraints:
 *   - Works for any logged-in user, not only the service account.
 *   - Does NOT touch Caddy, does NOT run setup scripts, does NOT delete files.
 *   - No direct DB writes.  No external Penpot.app links as primary actions.
 *   - Asset tag __NOFIDA_ASSET_TAG__ is replaced at image-build time by
 *     branding/scripts/patch-frontend.sh.
 * ========================================================================== */
(function () {
  "use strict";

  if (window.NofidaLibraryHub) return;

  /* ── constants ─────────────────────────────────────────────────────────── */
  var ASSET_TAG    = "__NOFIDA_ASSET_TAG__";
  var CATALOG_URL  = "/nofida/libraries/catalog.json" + (ASSET_TAG ? "?v=" + ASSET_TAG : "");
  /* The engine host serves the vendored .penpot files and the catalog.
     The internal_url field is a path like /nofida/libraries/files/foo.penpot
     which nginx serves from the same origin — so we use a relative URL.      */
  var HUB_HASH     = "#/nofida/libraries";
  var STORE_NS     = "nofida-hub-v1:";
  var HUB_PROJECT  = "NOFIDA Hub";

  var BRAND = {
    bg:           "#0b1020",
    surface:      "#131e35",
    surfaceHard:  "#10192f",
    border:       "rgba(37,99,235,.24)",
    primary:      "#2563eb",
    primaryHov:   "#1d4ed8",
    accent:       "#bfff00",
    accentInk:    "#0b1020",
    text:         "#f8fafc",
    muted:        "#94a3b8",
    success:      "#22c55e",
    warning:      "#f59e0b",
    error:        "#f43f5e",
    font:         'Montserrat,Inter,"Segoe UI",system-ui,sans-serif'
  };

  var CATEGORIES = [
    { id: "all",           label: "Все" },
    { id: "design-system", label: "Дизайн-системы" },
    { id: "icon-set",      label: "Иконки" },
    { id: "ui-kit",        label: "UI киты" },
    { id: "library",       label: "Библиотеки" },
    { id: "wireframe",     label: "Вайрфреймы" },
    { id: "template",      label: "Шаблоны" },
    { id: "ux",            label: "UX" }
  ];

  /* Human-readable labels for import_skip_reason values */
  var SKIP_LABELS = {
    old_binary_format_v1:      "Старый формат файла",
    too_large:                 "Слишком большой файл",
    trademark_license_review:  "Проверка торговой марки",
    no_download_url:           "Нет ссылки на файл",
    download_failed:           "Ошибка загрузки"
  };

  /* ── mutable state ─────────────────────────────────────────────────────── */
  var S = {
    catalog:         null,   /* Array of catalog items once loaded */
    teamId:          null,   /* Current team UUID (from URL) */
    hubProjectId:    null,   /* "NOFIDA Hub" project id for this team */
    installed:       {},     /* itemId → {fileId, projectId} */
    importing:       {},     /* itemId → true (in-progress guard) */
    activeFilter:    "all",
    searchQuery:     "",
    overlayEl:       null,
    sidebarInjected: false,
    galleryPatched:  false,
    observerActive:  false
  };

  /* ============================================================
   * TRANSIT-JSON DECODER  (with key-caching support)
   * Penpot uses transit+json with key caching for repeated keys:
   *   first map:    ["^ ","~:id","~u...","~:name","Foo",...]
   *   second map:   ["^ ","^0","~u...","^5","Bar",...]
   *     where "^0" = cached "id", "^5" = cached "name"
   * Cache indices use base-44: 0-9 → '0'-'9', 10-35 → 'A'-'Z', 36-43 → 'a'-'g'.
   * ========================================================== */
  function makeTransitDecoder() {
    var cache = [];

    function cacheIdx(ref) {
      /* ref is the 1+ chars after "^" */
      if (ref.length === 0) return -1;
      var c = ref.charCodeAt(0);
      var base;
      if (c >= 48 && c <= 57)  base = c - 48;        /* '0'-'9' → 0-9  */
      else if (c >= 65 && c <= 90) base = c - 65 + 10; /* 'A'-'Z' → 10-35 */
      else if (c >= 97 && c <= 109) base = c - 97 + 36; /* 'a'-'n' → 36-50 */
      else return -1;
      if (ref.length === 1) return base;
      /* multi-char: rare but handle 2-char indices */
      var c2 = ref.charCodeAt(1);
      var base2;
      if (c2 >= 48 && c2 <= 57)  base2 = c2 - 48;
      else if (c2 >= 65 && c2 <= 90) base2 = c2 - 65 + 10;
      else if (c2 >= 97 && c2 <= 109) base2 = c2 - 97 + 36;
      else return -1;
      return base * 44 + base2;
    }

    function decode(v) {
      if (typeof v === "string") {
        /* cache ref: "^X" where X is one or two base-44 chars */
        if (v.length >= 2 && v[0] === "^") {
          var idx = cacheIdx(v.slice(1));
          if (idx >= 0 && idx < cache.length) return cache[idx];
          return v; /* unknown ref — return as-is */
        }
        /* UUID — strip "~u" prefix (Penpot uses no-space variant) */
        if (v.startsWith("~u") && v.length > 2 && /[0-9a-f-]/i.test(v[2])) return v.slice(2);
        if (v.startsWith("~u ")) return v.slice(3);
        /* keyword — strip "~:" and add to cache */
        if (v.startsWith("~:")) {
          var kw = v.slice(2);
          cache.push(kw);
          return kw;
        }
        return v;
      }
      if (Array.isArray(v)) {
        if (v.length > 0 && v[0] === "^ ") {
          /* transit map: ["^ ", k1, v1, k2, v2, …] */
          var obj = {};
          for (var i = 1; i < v.length - 1; i += 2) {
            obj[String(decode(v[i]))] = decode(v[i + 1]);
          }
          return obj;
        }
        return v.map(decode);
      }
      if (v !== null && typeof v === "object") {
        var r = {};
        Object.keys(v).forEach(function (k) {
          r[String(decode(k))] = decode(v[k]);
        });
        return r;
      }
      return v;
    }

    return decode;
  }

  /* Decode a single transit+json response (fresh cache per response) */
  function decodeTransit(v) {
    return makeTransitDecoder()(v);
  }

  /* ============================================================
   * PENPOT API HELPERS
   * ========================================================== */
  function apiGet(path) {
    return fetch(path, {
      credentials: "include",
      headers: { Accept: "application/transit+json" }
    }).then(function (r) {
      if (!r.ok) throw new Error("API " + r.status + " " + path);
      return r.json().then(decodeTransit);
    });
  }

  function getTeamId() {
    var m = (window.location.hash || "").match(
      /#\/dashboard\/team\/([0-9a-f-]{36})/
    );
    return m ? m[1] : null;
  }

  /* Async version: tries URL first, then Penpot profile API, then DOM links */
  function resolveTeamId() {
    var fromUrl = getTeamId();
    if (fromUrl) {
      S.teamId = fromUrl;
      return Promise.resolve(fromUrl);
    }
    if (S.teamId) return Promise.resolve(S.teamId);

    /* Try DOM links like /dashboard/team/<uuid>/ */
    var links = document.querySelectorAll("a[href]");
    for (var li = 0; li < links.length; li++) {
      var hm = (links[li].getAttribute("href") || "").match(
        /dashboard\/team\/([0-9a-f-]{36})/
      );
      if (hm) { S.teamId = hm[1]; return Promise.resolve(hm[1]); }
    }

    /* Fall back to Penpot profile API → default-team-id */
    return fetch("/api/rpc/command/get-profile", {
      credentials: "include",
      headers: { Accept: "application/transit+json" }
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (raw) {
        if (!raw) return null;
        var decoded = decodeTransit(raw);
        /* transit key is "default-team-id" */
        var tid = decoded["default-team-id"] || decoded["defaultTeamId"];
        if (tid) {
          S.teamId = tid;
          /* Also push the team into the URL hash so future calls use URL path */
          if (!getTeamId() && /^#\/dashboard/.test(window.location.hash || "")) {
            history.replaceState(null, "",
              window.location.pathname +
              "#/dashboard/team/" + tid + "/projects");
          }
        }
        return tid || null;
      })
      .catch(function () { return null; });
  }

  function loadTeamProjects(teamId) {
    return apiGet("/api/rpc/command/get-all-projects?team_id=" + teamId)
      .then(function (v) { return Array.isArray(v) ? v : []; });
  }

  function loadProjectFiles(projectId) {
    return apiGet("/api/rpc/command/get-project-files?project-id=" + projectId)
      .then(function (v) { return Array.isArray(v) ? v : []; });
  }

  /* Find or lazily create the per-team "NOFIDA Hub" project.
     Result is a project id string (UUID).
     If multiple "NOFIDA Hub" projects exist (e.g. from failed previous runs),
     we always use the OLDEST one (lowest created-at timestamp). */
  function ensureHubProject(teamId) {
    if (S.hubProjectId) return Promise.resolve(S.hubProjectId);
    return loadTeamProjects(teamId).then(function (projects) {
      /* Collect ALL hub projects and sort by creation time ascending */
      var hubProjects = projects.filter(function (p) { return p.name === HUB_PROJECT; });
      hubProjects.sort(function (a, b) {
        /* created-at is a millisecond timestamp; sort oldest first */
        return ((a["created-at"] || 0) - (b["created-at"] || 0));
      });
      if (hubProjects.length > 0) {
        S.hubProjectId = hubProjects[0].id;
        return hubProjects[0].id;
      }
      /* No hub project yet — create one */
      return fetch("/api/rpc/command/create-project", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/transit+json",
          Accept: "application/transit+json"
        },
        body: JSON.stringify(
          /* Penpot encodes UUIDs as "~u<uuid>" WITHOUT a space.
             Standard transit uses "~u <uuid>" (with space) but
             Penpot's server-side decoder strips exactly 2 chars ("~u"),
             so a leading space makes the UUID 37 chars → "too large".  */
          ["^ ", "~:team-id", "~u" + teamId, "~:name", HUB_PROJECT]
        )
      })
        .then(function (r) { return r.json().then(decodeTransit); })
        .then(function (p) {
          S.hubProjectId = p.id;
          return p.id;
        });
    });
  }

  /* ============================================================
   * INSTALLED-STATE DETECTION
   * Primary truth:  Penpot API (team projects + files)
   * Speed cache:    localStorage (stale entries auto-purged)
   * ========================================================== */
  function storageKey(teamId, itemId) {
    return STORE_NS + teamId + ":" + itemId;
  }

  function readCache(teamId, catalog) {
    var out = {};
    catalog.forEach(function (item) {
      var raw = localStorage.getItem(storageKey(teamId, item.id));
      if (raw) {
        try { out[item.id] = JSON.parse(raw); } catch (_) { /* ignore */ }
      }
    });
    return out;
  }

  /* Build a normalised filename key from any string */
  function slugify(s) {
    return (s || "").toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
  }

  function detectInstalledItems(teamId, catalog) {
    var cache = readCache(teamId, catalog);

    /* If we already have a hubProjectId, include it directly even if
       get-all-projects has a propagation delay and doesn't list it yet. */
    var extraProjects = S.hubProjectId ? [{ id: S.hubProjectId, name: HUB_PROJECT }] : [];

    return loadTeamProjects(teamId).then(function (projects) {
      /* Merge hub project into the list (dedup by id) */
      var merged = projects.slice();
      extraProjects.forEach(function (ep) {
        if (!merged.some(function (p) { return p.id === ep.id; })) {
          merged.push(ep);
        }
      });

      var fileRequests = merged.map(function (proj) {
        return loadProjectFiles(proj.id)
          .then(function (files) { return { proj: proj, files: files }; })
          .catch(function () { return { proj: proj, files: [] }; });
      });
      return Promise.all(fileRequests);
    }).then(function (pairs) {
      /* Build slug → entry map from all team files */
      var bySlug = {};
      pairs.forEach(function (pair) {
        pair.files.forEach(function (f) {
          var key = slugify(f.name);
          if (key) bySlug[key] = { fileId: f.id, projectId: pair.proj.id, name: f.name };
        });
      });

      /* Build set of all live file ids for cache validation */
      var liveIds = {};
      pairs.forEach(function (pair) {
        pair.files.forEach(function (f) { liveIds[f.id] = true; });
      });

      var installed = {};
      catalog.forEach(function (item) {
        /* 1. Validate / promote cached entry against live API */
        if (cache[item.id] && liveIds[cache[item.id].fileId]) {
          installed[item.id] = cache[item.id];
          return;
        }
        /* Stale cache entry — remove it */
        if (cache[item.id]) {
          localStorage.removeItem(storageKey(teamId, item.id));
        }

        /* 2. Try slug-based match against live files */
        var titleSlug  = slugify(item.title || item.id);
        var nameSlug   = slugify(item.penpot_file_name || "");
        var idSlug     = slugify(item.id);

        var match = bySlug[titleSlug] || bySlug[nameSlug] || bySlug[idSlug];
        if (match) {
          installed[item.id] = match;
          localStorage.setItem(
            storageKey(teamId, item.id),
            JSON.stringify(match)
          );
        }
      });

      S.installed = installed;
      return installed;
    }).catch(function () {
      /* If API is unreachable fall back to cache */
      S.installed = cache;
      return cache;
    });
  }

  /* ============================================================
   * IMPORT — download vendored file → POST to Penpot API
   * ========================================================== */
  function canImport(item) {
    return item.internal_url && !item.import_skip_reason && item.status === "available";
  }

  /* Read the SSE (Server-Sent Events) response from import-binfile and
     return the first file-id found in any progress or end event.
     Events look like:
       event: progress
       data: {"~:section":"~:file","~:file-id":"~u<uuid>"}   */
  function readSSEFileId(response) {
    /* Prefer streaming reader if available */
    if (response.body && response.body.getReader) {
      var reader  = response.body.getReader();
      var decoder = new TextDecoder();
      var buf     = "";
      var fileId  = null;

      function pump() {
        return reader.read().then(function (chunk) {
          if (chunk.done) return fileId;
          buf += decoder.decode(chunk.value, { stream: true });
          /* Each SSE data line is:  data: {...}\n */
          var lines = buf.split("\n");
          buf = lines.pop(); /* keep partial last line */
          lines.forEach(function (line) {
            if (!line.startsWith("data:")) return;
            var json = line.slice(5).trim();
            if (!json) return;
            try {
              var obj = decodeTransit(JSON.parse(json));
              /* The file-id is either "file-id" or buried in a section */
              if (obj["file-id"]) fileId = obj["file-id"];
            } catch (_) { /* ignore parse errors */ }
          });
          if (fileId) { reader.cancel(); return fileId; }
          return pump();
        });
      }
      return pump();
    }

    /* Fallback: read entire body as text and scan for file-id */
    return response.text().then(function (text) {
      var fileId = null;
      text.split("\n").forEach(function (line) {
        if (!line.startsWith("data:")) return;
        var json = line.slice(5).trim();
        if (!json) return;
        try {
          var obj = decodeTransit(JSON.parse(json));
          if (obj["file-id"]) fileId = obj["file-id"];
        } catch (_) { /* ignore */ }
      });
      return fileId;
    });
  }

  function importItem(item, teamId) {
    if (S.importing[item.id]) return Promise.reject(new Error("Already importing"));
    if (!canImport(item))     return Promise.reject(new Error("Item not importable"));

    S.importing[item.id] = true;
    updateCardState(item.id);

    return ensureHubProject(teamId)
      .then(function (projectId) {
        /* Fetch the vendored file from our own origin */
        return fetch(item.internal_url, {
          credentials: "same-origin",
          cache: "force-cache"
        }).then(function (r) {
          if (!r.ok) throw new Error("Download failed: " + r.status);
          return r.blob();
        }).then(function (blob) {
          var fd = new FormData();
          fd.append("name",        item.title || item.id);
          fd.append("project-id",  projectId);
          fd.append("project_id",  projectId);
          fd.append("file", blob, item.id + ".penpot");

          return fetch("/api/rpc/command/import-binfile", {
            method: "POST",
            credentials: "include",
            body: fd
          });
        }).then(function (r) {
          if (!r.ok) {
            return r.text().then(function (t) {
              throw new Error("Import API " + r.status + ": " + t.slice(0, 200));
            });
          }
          /* import-binfile returns SSE (text/event-stream), not JSON.
             We read the full stream as text and extract the file-id from
             the last progress or end event that contains one.             */
          return readSSEFileId(r);
        }).then(function (fileId) {
          if (!fileId) throw new Error("No file-id in import SSE stream");

          var entry = { fileId: fileId, projectId: projectId };
          S.installed[item.id] = entry;
          localStorage.setItem(
            storageKey(teamId, item.id),
            JSON.stringify(entry)
          );
          delete S.importing[item.id];
          updateCardState(item.id);
          updateStatusBar();
          return entry;
        });
      })
      .catch(function (err) {
        delete S.importing[item.id];
        updateCardState(item.id, "error");
        console.warn("[NofidaHub] import error for", item.id, ":", err.message);
        throw err;
      });
  }

  /* Open an already-imported file in the Penpot workspace */
  function openFile(item) {
    var e = S.installed[item.id];
    if (!e) return;
    window.location.href = "/#/workspace/" + e.projectId + "/" + e.fileId;
  }

  /* ============================================================
   * CARD / GRID RENDERING
   * ========================================================== */
  /* Human-readable type labels */
  var TYPE_LABELS = {
    "design-system": "Дизайн-система",
    "icon-set":      "Иконки",
    "ui-kit":        "UI кит",
    "library":       "Библиотека",
    "template":      "Шаблон",
    "ux":            "UX"
  };

  /* Is this item a reusable shared library (not just a template file)? */
  function isLibraryType(item) {
    return item.type === "design-system" ||
           item.type === "icon-set" ||
           item.type === "ui-kit" ||
           item.type === "library";
  }

  function itemAction(item) {
    if (S.importing[item.id])         return "importing";
    if (S.installed[item.id])         return "open";
    if (canImport(item))              return "add";
    if (item.import_skip_reason)      return "skip";
    if (item.status === "trademark_review" ||
        item.license_status === "trademark_review") return "review";
    return "unavailable";
  }

  function e(s) {
    return String(s || "")
      .replace(/&/g,"&amp;").replace(/</g,"&lt;")
      .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  function renderCard(item) {
    var action   = itemAction(item);
    var typeStr  = e(TYPE_LABELS[item.type] || item.type || "библиотека");
    var titleStr = e(item.title || item.id);
    var author   = item.author ? "Автор: " + e(item.author) : "";
    var sizeStr  = item.size_bytes
      ? (item.size_bytes / 1048576).toFixed(1) + " МБ"
      : "";
    var isLib = isLibraryType(item);

    /* status badge */
    var badge = "";
    if (S.installed[item.id]) {
      badge = isLib
        ? '<span class="nhb-badge nhb-ok">Библиотека добавлена</span>'
        : '<span class="nhb-badge nhb-ok">Шаблон добавлен</span>';
    } else if (action === "review") {
      badge = '<span class="nhb-badge nhb-warn">Лицензия на проверке</span>';
    } else if (action === "skip") {
      badge = '<span class="nhb-badge nhb-dim">' +
        e(SKIP_LABELS[item.import_skip_reason] || item.import_skip_reason) + '</span>';
    } else if (action === "unavailable") {
      badge = '<span class="nhb-badge nhb-dim">Недоступно</span>';
    }

    /* project location info (shown after install) */
    var locationHint = "";
    if (S.installed[item.id]) {
      locationHint = '<div class="nhb-location">📁 Проект: <strong>' +
        e(HUB_PROJECT) + '</strong></div>';
    }

    /* action button */
    var btnLabel = "";
    var btnMod   = "";
    var btnDis   = "";
    switch (action) {
      case "add":
        btnLabel = isLib ? "Добавить библиотеку" : "Добавить шаблон";
        btnMod   = "nhb-btn-add";
        break;
      case "open":
        btnLabel = isLib ? "Открыть файл библиотеки" : "Открыть шаблон";
        btnMod   = "nhb-btn-open";
        break;
      case "importing":
        btnLabel = "Добавляем…";
        btnMod   = "nhb-btn-dim nhb-spin";
        btnDis   = "disabled";
        break;
      case "skip":
        btnLabel = "Недоступно: " + e(SKIP_LABELS[item.import_skip_reason] || item.import_skip_reason);
        btnMod   = "nhb-btn-dim";
        btnDis   = "disabled";
        break;
      case "review":
        btnLabel = "Требует проверки лицензии";
        btnMod   = "nhb-btn-dim";
        btnDis   = "disabled";
        break;
      default:
        btnLabel = "Недоступно";
        btnMod   = "nhb-btn-dim";
        btnDis   = "disabled";
    }

    return [
      '<article class="nhb-card" data-id="' + e(item.id) + '">',
      '  <div class="nhb-card-top">',
      '    <span class="nhb-type">' + typeStr + '</span>',
      badge,
      '  </div>',
      '  <h3 class="nhb-card-title">' + titleStr + '</h3>',
      '  <div class="nhb-meta">',
      author   ? '<span>' + author + '</span>' : '',
      sizeStr  ? '<span>' + e(sizeStr) + '</span>' : '',
      item.license ? '<span>Лицензия: ' + e(item.license) + '</span>' : '',
      '  </div>',
      locationHint,
      '  <button class="nhb-btn ' + btnMod + '"',
      '    data-act="' + action + '" data-id="' + e(item.id) + '"',
      '    type="button" ' + btnDis + '>',
      btnLabel,
      '  </button>',
      '</article>'
    ].join("");
  }

  function filteredItems() {
    if (!S.catalog) return [];
    var q = S.searchQuery.toLowerCase();
    return S.catalog.filter(function (item) {
      var okCat = S.activeFilter === "all" || item.type === S.activeFilter;
      var okQ   = !q ||
        (item.title  || "").toLowerCase().includes(q) ||
        (item.author || "").toLowerCase().includes(q) ||
        (item.type   || "").toLowerCase().includes(q);
      return okCat && okQ;
    });
  }

  function refreshGrid() {
    if (!S.overlayEl) return;
    var grid = S.overlayEl.querySelector("#nhb-grid");
    if (!grid) return;
    var items = filteredItems();
    if (items.length === 0) {
      grid.innerHTML = '<div class="nhb-empty">Ничего не найдено</div>';
      return;
    }
    grid.innerHTML = items.map(renderCard).join("");
  }

  function updateCardState(itemId, override) {
    if (!S.overlayEl) return;
    var card = S.overlayEl.querySelector('.nhb-card[data-id="' + itemId + '"]');
    if (!card) return;
    var btn = card.querySelector(".nhb-btn");
    if (!btn) return;

    if (override === "error") {
      btn.className    = "nhb-btn nhb-btn-err";
      btn.textContent  = "Ошибка — повторить";
      btn.disabled     = false;
      btn.setAttribute("data-act", "add");
      return;
    }

    var action = itemAction({ id: itemId, import_skip_reason: null,
      internal_url: S.catalog && S.catalog.find(function(i){return i.id===itemId;})
        && S.catalog.find(function(i){return i.id===itemId;}).internal_url,
      status: "available" });
    /* simpler: just re-render the card */
    if (S.catalog) {
      var item = S.catalog.find(function (i) { return i.id === itemId; });
      if (item) card.outerHTML = renderCard(item);
    }
  }

  function updateStatusBar() {
    if (!S.overlayEl) return;
    var bar = S.overlayEl.querySelector("#nhb-status");
    if (!bar) return;
    if (!S.catalog) { bar.textContent = "Загрузка каталога…"; return; }
    var all   = S.catalog.length;
    var avail = S.catalog.filter(function (i) { return canImport(i); }).length;
    var inst  = Object.keys(S.installed).length;
    var shown = filteredItems().length;
    bar.textContent =
      "Показано: " + shown + " из " + all +
      " · Доступно для добавления: " + avail +
      " · Добавлено в эту команду: " + inst;
  }

  /* ============================================================
   * HUB OVERLAY  (full-screen, z-index > everything)
   * ========================================================== */
  var HUB_CSS = [
    "#nhb-overlay{position:fixed;inset:0;z-index:2147483500;",
      "background:" + BRAND.bg + ";overflow-y:auto;",
      "font-family:" + BRAND.font + ";color:" + BRAND.text + "}",
    "#nhb-overlay[hidden]{display:none!important}",
    ".nhb-inner{max-width:1280px;margin:0 auto;padding:28px 24px 80px}",
    /* header */
    ".nhb-hdr{display:flex;align-items:center;justify-content:space-between;",
      "margin-bottom:28px;gap:12px;flex-wrap:wrap}",
    ".nhb-hdr-left{display:flex;align-items:center;gap:10px;flex-wrap:wrap}",
    ".nhb-dot{width:10px;height:10px;border-radius:50%;background:" + BRAND.accent + "}",
    ".nhb-h1{margin:0;font-size:22px;font-weight:800;letter-spacing:-.02em}",
    ".nhb-sub{color:" + BRAND.muted + ";font-size:13px}",
    ".nhb-close{border:0;background:0;color:" + BRAND.muted + ";font-size:26px;",
      "line-height:1;cursor:pointer;padding:2px 8px;border-radius:8px}",
    ".nhb-close:hover{color:" + BRAND.text + "}",
    /* controls */
    ".nhb-ctrl{margin-bottom:20px}",
    ".nhb-search{width:100%;padding:10px 16px;",
      "border:1px solid " + BRAND.border + ";border-radius:12px;",
      "background:" + BRAND.surface + ";color:" + BRAND.text + ";",
      "font-size:14px;outline:none;box-sizing:border-box;font-family:inherit}",
    ".nhb-search:focus{border-color:" + BRAND.primary + "}",
    ".nhb-filters{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}",
    ".nhb-flt{border:1px solid " + BRAND.border + ";border-radius:999px;",
      "padding:5px 14px;background:0;color:" + BRAND.muted + ";",
      "font-size:12px;font-weight:600;cursor:pointer;transition:all .14s}",
    ".nhb-flt:hover{border-color:" + BRAND.primary + ";color:" + BRAND.text + "}",
    ".nhb-flt.on{border-color:" + BRAND.accent + ";color:" + BRAND.accent + ";",
      "background:rgba(191,255,0,.08)}",
    /* status bar */
    ".nhb-status{font-size:12px;color:" + BRAND.muted + ";margin-bottom:16px;min-height:18px}",
    /* grid */
    ".nhb-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}",
    ".nhb-empty{grid-column:1/-1;padding:48px;text-align:center;color:" + BRAND.muted + "}",
    /* card */
    ".nhb-card{background:" + BRAND.surface + ";border:1px solid " + BRAND.border + ";",
      "border-radius:16px;padding:18px;display:flex;flex-direction:column;gap:10px;",
      "transition:border-color .14s,transform .14s}",
    ".nhb-card:hover{border-color:rgba(37,99,235,.55);transform:translateY(-2px)}",
    ".nhb-card-top{display:flex;align-items:center;justify-content:space-between;gap:6px}",
    ".nhb-type{font-size:10px;font-weight:700;letter-spacing:.1em;",
      "text-transform:uppercase;color:" + BRAND.accent + "}",
    ".nhb-card-title{margin:0;font-size:15px;font-weight:700;line-height:1.3}",
    ".nhb-meta{display:flex;flex-direction:column;gap:3px}",
    ".nhb-meta span{font-size:11px;color:" + BRAND.muted + "}",
    ".nhb-badge{font-size:10px;font-weight:700;padding:3px 8px;border-radius:999px;",
      "letter-spacing:.06em;text-transform:uppercase}",
    ".nhb-ok{background:rgba(34,197,94,.14);color:" + BRAND.success + "}",
    ".nhb-warn{background:rgba(245,158,11,.12);color:" + BRAND.warning + "}",
    ".nhb-dim{background:rgba(148,163,184,.1);color:" + BRAND.muted + "}",
    /* buttons */
    ".nhb-btn{border:0;border-radius:10px;padding:9px 14px;font-size:13px;",
      "font-weight:700;cursor:pointer;transition:all .14s;width:100%;",
      "margin-top:auto;font-family:inherit}",
    ".nhb-btn-add{background:" + BRAND.primary + ";color:#fff}",
    ".nhb-btn-add:hover{background:" + BRAND.primaryHov + "}",
    ".nhb-btn-open{background:rgba(34,197,94,.14);color:" + BRAND.success + ";",
      "border:1px solid rgba(34,197,94,.28)}",
    ".nhb-btn-open:hover{background:rgba(34,197,94,.24)}",
    ".nhb-btn-err{background:rgba(244,63,94,.14);color:" + BRAND.error + ";",
      "border:1px solid rgba(244,63,94,.28)}",
    ".nhb-btn-err:hover{background:rgba(244,63,94,.24)}",
    ".nhb-btn-dim{background:" + BRAND.surfaceHard + ";color:" + BRAND.muted + ";",
      "cursor:not-allowed;opacity:.75}",
    ".nhb-spin{animation:nhb-pulse 1.1s ease-in-out infinite}",
    "@keyframes nhb-pulse{0%,100%{opacity:.65}50%{opacity:1}}",
    /* location hint shown after install */
    ".nhb-location{font-size:11px;color:" + BRAND.muted + ";padding:4px 0}",
    ".nhb-location strong{color:" + BRAND.accent + "}",
    /* open-hub-project link */
    ".nhb-open-proj{background:0;border:0;color:" + BRAND.muted + ";font-size:12px;",
      "cursor:pointer;padding:4px 8px;border-radius:8px;text-decoration:underline;font-family:inherit}",
    ".nhb-open-proj:hover{color:" + BRAND.text + "}",
    "@media(max-width:640px){.nhb-inner{padding:16px}.nhb-grid{grid-template-columns:1fr}}"
  ].join("");

  function buildOverlay() {
    if (S.overlayEl) return S.overlayEl;

    var style = document.createElement("style");
    style.id  = "nhb-styles";
    style.textContent = HUB_CSS;
    document.head.appendChild(style);

    var filterHtml = CATEGORIES.map(function (c) {
      return '<button class="nhb-flt' + (c.id === "all" ? " on" : "") +
        '" data-f="' + e(c.id) + '">' + e(c.label) + '</button>';
    }).join("");

    var div = document.createElement("div");
    div.id = "nhb-overlay";
    div.setAttribute("hidden", "");
    div.innerHTML = [
      '<div class="nhb-inner">',
      '  <div class="nhb-hdr">',
      '    <div class="nhb-hdr-left">',
      '      <span class="nhb-dot"></span>',
      '      <h1 class="nhb-h1">Библиотеки NOFIDA</h1>',
      '      <span class="nhb-sub">Глобальный каталог · для всех пользователей</span>',
      '    </div>',
      '    <div style="display:flex;align-items:center;gap:8px">',
      '      <button class="nhb-open-proj" id="nhb-open-proj" type="button"',
      '        title="Открыть проект Библиотеки NOFIDA в вашем дашборде">',
      '        📁 Открыть мои добавленные</button>',
      '      <button class="nhb-close" id="nhb-close" title="Закрыть" aria-label="Закрыть">×</button>',
      '    </div>',
      '  </div>',
      '  <div class="nhb-ctrl">',
      '    <input class="nhb-search" id="nhb-search" type="search"',
      '      placeholder="Поиск библиотек, иконок, шаблонов…" autocomplete="off" />',
      '    <div class="nhb-filters" id="nhb-filters">' + filterHtml + '</div>',
      '  </div>',
      '  <div class="nhb-status" id="nhb-status">Загрузка каталога…</div>',
      '  <div class="nhb-grid"  id="nhb-grid"></div>',
      '</div>'
    ].join("");

    document.body.appendChild(div);
    S.overlayEl = div;

    /* ── wire overlay-internal events ── */
    div.querySelector("#nhb-close").addEventListener("click", hideHub);

    div.querySelector("#nhb-open-proj").addEventListener("click", function () {
      hideHub();
      /* Navigate to user's hub project on the dashboard */
      resolveTeamId().then(function (tid) {
        if (!tid) return;
        /* If we already know the hub project id, navigate directly */
        var projId = S.hubProjectId;
        if (projId) {
          window.location.href = "/#/dashboard/team/" + tid + "/projects/" + projId;
        } else {
          /* Fall back to team projects page */
          window.location.href = "/#/dashboard/team/" + tid + "/projects";
        }
      });
    });

    div.querySelector("#nhb-search").addEventListener("input", function (ev) {
      S.searchQuery = ev.target.value;
      refreshGrid();
      updateStatusBar();
    });

    div.querySelector("#nhb-filters").addEventListener("click", function (ev) {
      var btn = ev.target.closest(".nhb-flt");
      if (!btn) return;
      S.activeFilter = btn.getAttribute("data-f") || "all";
      div.querySelectorAll(".nhb-flt").forEach(function (b) {
        b.classList.toggle("on", b.getAttribute("data-f") === S.activeFilter);
      });
      refreshGrid();
      updateStatusBar();
    });

    div.querySelector("#nhb-grid").addEventListener("click", function (ev) {
      var btn = ev.target.closest(".nhb-btn");
      if (!btn || btn.disabled) return;
      var act    = btn.getAttribute("data-act");
      var itemId = btn.getAttribute("data-id");
      var item   = S.catalog && S.catalog.find(function (i) { return i.id === itemId; });
      if (!item) return;

      if (act === "add") {
        resolveTeamId().then(function (tid) {
          if (!tid) {
            showMsg("Не удалось определить текущую команду. Перейдите на дашборд и попробуйте снова.");
            return;
          }
          importItem(item, tid);
        });
      } else if (act === "open") {
        openFile(item);
      }
    });

    return div;
  }

  function showHub() {
    var overlay = buildOverlay();
    overlay.removeAttribute("hidden");
    document.body.style.overflow = "hidden";
    /* Resolve team ID async — needed when user lands on /#/dashboard without UUID */
    resolveTeamId().then(function (tid) {
      if (tid && !S.teamId) S.teamId = tid;
      loadCatalogAndInstalled();
    });
  }

  function hideHub() {
    if (S.overlayEl) {
      S.overlayEl.setAttribute("hidden", "");
    }
    document.body.style.overflow = "";
    /* Return to dashboard if we're on the hub hash */
    if ((window.location.hash || "") === HUB_HASH) {
      var tid = S.teamId || getTeamId();
      var back = tid
        ? "#/dashboard/team/" + tid + "/projects"
        : "#/dashboard";
      history.replaceState(null, "", window.location.pathname + back);
    }
  }

  function state_teamId_refresh() {
    var tid = getTeamId();
    if (tid) S.teamId = tid;
  }

  /* ============================================================
   * CATALOG LOAD + INSTALLED DETECT
   * ========================================================== */
  function loadCatalogAndInstalled() {
    var catalogP = S.catalog
      ? Promise.resolve(S.catalog)
      : fetch(CATALOG_URL, { credentials: "same-origin" })
          .then(function (r) { return r.ok ? r.json() : { libraries: [] }; })
          .then(function (d) {
            S.catalog = Array.isArray(d.libraries) ? d.libraries : [];
            return S.catalog;
          });

    catalogP.then(function (catalog) {
      updateStatusBar();
      refreshGrid();
      /* Resolve team ID now (async, handles new users without team UUID in URL) */
      return resolveTeamId().then(function (tid) {
        if (!tid) return;
        return detectInstalledItems(tid, catalog).then(function () {
          refreshGrid();
          updateStatusBar();
        });
      });
    }).catch(function (err) {
      console.warn("[NofidaHub] catalog load error:", err.message);
      updateStatusBar();
    });
  }

  /* ============================================================
   * SIDEBAR INJECTION
   * Waits for the Penpot dashboard sidebar to appear in the DOM.
   * Uses MutationObserver + multiple selector fallbacks.
   * ========================================================== */
  function tryInjectSidebar() {
    if (S.sidebarInjected) return;
    if (!isDashboard()) return;
    if (document.getElementById("nhb-sidebar-btn")) {
      S.sidebarInjected = true;
      return;
    }

    /* ── find the sidebar nav container ── */
    var nav = null;

    /* 1. known Penpot 2.16 class patterns */
    var candidates = [
      ".main_ui_dashboard_sidebar__sidebar-nav",
      "[class*='dashboard_sidebar'][class*='nav']",
      "[class*='dashboard_sidebar'][class*='menu']",
      "[class*='dashboard-sidebar'] nav",
      "[class*='dashboard-sidebar'] ul"
    ];
    for (var ci = 0; ci < candidates.length; ci++) {
      nav = document.querySelector(candidates[ci]);
      if (nav) break;
    }

    /* 2. heuristic: element with "Черновики" or "Drafts" text inside */
    if (!nav) {
      var all = document.querySelectorAll("nav, [role='navigation'], aside ul");
      for (var ai = 0; ai < all.length; ai++) {
        if (/черновики|drafts|проекты|projects/i.test(all[ai].textContent || "")) {
          nav = all[ai];
          break;
        }
      }
    }

    /* 3. broadest fallback — any sidebar-like element */
    if (!nav) {
      nav = document.querySelector("[class*='dashboard_sidebar']");
    }

    if (!nav) return;   /* not rendered yet — observer will retry */

    S.sidebarInjected = true;

    var btn = document.createElement("a");
    btn.id            = "nhb-sidebar-btn";
    btn.href          = "javascript:void(0)"; /* eslint-disable-line no-script-url */
    btn.setAttribute("role", "menuitem");
    btn.setAttribute("aria-label", "Библиотеки NOFIDA");
    btn.textContent   = "📚 Библиотеки NOFIDA";
    btn.style.cssText =
      "display:flex;align-items:center;padding:8px 12px;margin:4px 6px;" +
      "border-radius:10px;font-size:13px;font-weight:700;" +
      "color:" + BRAND.accent + ";text-decoration:none;cursor:pointer;" +
      "background:rgba(191,255,0,.07);border:1px solid rgba(191,255,0,.18);" +
      "transition:all .15s;font-family:" + BRAND.font + ";box-sizing:border-box";

    btn.addEventListener("mouseenter", function () {
      btn.style.background   = "rgba(191,255,0,.14)";
      btn.style.borderColor  = "rgba(191,255,0,.38)";
    });
    btn.addEventListener("mouseleave", function () {
      btn.style.background   = "rgba(191,255,0,.07)";
      btn.style.borderColor  = "rgba(191,255,0,.18)";
    });
    btn.addEventListener("click", function (ev) {
      ev.preventDefault();
      state_teamId_refresh();
      window.location.hash = "/nofida/libraries";
    });

    nav.appendChild(btn);
  }

  /* ============================================================
   * BOTTOM GALLERY PATCH
   * Replace external penpot.app links in the "Libraries &
   * templates" section with internal-catalog openers.
   * ========================================================== */
  function tryPatchBottomGallery() {
    if (S.galleryPatched) return;
    if (!isDashboard()) return;

    /* Step 1: replace any external penpot.app links in the entire dashboard */
    var extLinks = document.querySelectorAll(
      "a[href*='penpot.app/penpothub'],a[href*='penpot.app/hub']"
    );
    if (extLinks.length === 0) return;   /* section not rendered yet */

    S.galleryPatched = true;
    extLinks.forEach(function (link) {
      var clone       = document.createElement("button");
      clone.type      = "button";
      clone.textContent = link.textContent || "Открыть каталог NOFIDA";
      /* preserve visual styling by copying inline style */
      if (link.getAttribute("style")) clone.setAttribute("style", link.getAttribute("style"));
      clone.style.cursor   = "pointer";
      clone.style.border   = "none";
      clone.style.background = "transparent";
      clone.style.color    = "inherit";
      clone.style.font     = "inherit";
      clone.style.padding  = link.style.padding || "0";
      clone.style.textDecoration = "none";
      clone.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        state_teamId_refresh();
        window.location.hash = "/nofida/libraries";
      });
      if (link.parentNode) link.parentNode.replaceChild(clone, link);
    });

    /* Step 2: inject a prominent "Библиотеки NOFIDA" card into the gallery
       grid / list that precedes or contains the section we just patched.    */
    var alreadyCard = document.getElementById("nhb-gallery-card");
    if (alreadyCard) return;

    /* find the section heading element */
    var heading = null;
    var allElems = document.querySelectorAll("h2,h3,span,p,div");
    for (var i = 0; i < allElems.length; i++) {
      var txt = (allElems[i].textContent || "").trim();
      if (/Библиотеки и шаблоны|Libraries.*templates/i.test(txt) && txt.length < 80) {
        heading = allElems[i];
        break;
      }
    }

    var container = heading
      ? heading.closest("section,article,div[class*='panel'],div[class*='section']")
      : null;

    if (!container) return;

    var grid = container.querySelector(
      "[class*='grid'],[class*='list'],ul,ol"
    );

    var card = document.createElement("div");
    card.id = "nhb-gallery-card";
    card.style.cssText =
      "display:flex;align-items:center;gap:10px;padding:10px 14px;" +
      "border-radius:12px;background:rgba(191,255,0,.08);" +
      "border:1px solid rgba(191,255,0,.22);cursor:pointer;" +
      "font-family:" + BRAND.font + ";margin:4px 0;user-select:none";
    card.innerHTML =
      '<span style="font-size:18px">📚</span>' +
      '<div>' +
        '<div style="font-size:13px;font-weight:700;color:#bfff00">Библиотеки NOFIDA</div>' +
        '<div style="font-size:11px;color:#94a3b8">Внутренний каталог для вашей команды</div>' +
      '</div>';
    card.addEventListener("click", function () {
      state_teamId_refresh();
      window.location.hash = "/nofida/libraries";
    });

    if (grid) {
      grid.insertBefore(card, grid.firstChild);
    } else {
      container.appendChild(card);
    }
  }

  /* ============================================================
   * DOM OBSERVER  (MutationObserver on body for SPA updates)
   * ========================================================== */
  function isDashboard() {
    return /^#\/dashboard/.test(window.location.hash || "");
  }

  /* Thumbnail fallback: when a dashboard file-card thumbnail image 404s,
     replace the broken img with a branded placeholder.  We attach onerror
     once per img element (tracked via dataset.nhbPatched).               */
  function patchThumbnailErrors() {
    var imgs = document.querySelectorAll(
      ".main_ui_dashboard_grid__grid-item-thumbnail-image:not([data-nhb-patched])"
    );
    imgs.forEach(function (img) {
      img.setAttribute("data-nhb-patched", "1");
      /* Apply immediately if already broken */
      if (img.complete && img.naturalWidth === 0 && img.src) {
        applyThumbFallback(img);
        return;
      }
      img.addEventListener("error", function () { applyThumbFallback(img); }, { once: true });
    });
  }

  function applyThumbFallback(img) {
    var card = img.closest("[class*='grid-item']");
    if (!card || card.dataset.nhbThumbFixed) return;
    card.dataset.nhbThumbFixed = "1";

    /* Hide the broken img */
    img.style.display = "none";

    /* Find the thumbnail container (parent of img) */
    var thumbContainer = img.parentElement || card;

    /* Inject branded fallback */
    var fallback = document.createElement("div");
    fallback.className = "nhb-thumb-fallback";
    fallback.innerHTML =
      '<span style="font-size:28px;line-height:1;display:block;margin-bottom:4px">📋</span>' +
      '<span style="font-size:11px;font-weight:700;color:#bfff00;letter-spacing:.06em;' +
      'text-transform:uppercase">NOFIDA Hub</span>';
    fallback.style.cssText =
      "position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;" +
      "justify-content:center;background:linear-gradient(135deg,#0b1020 0%,#131e35 100%);" +
      "border-radius:inherit;pointer-events:none";

    /* Ensure container is positioned */
    if (getComputedStyle(thumbContainer).position === "static") {
      thumbContainer.style.position = "relative";
    }
    thumbContainer.appendChild(fallback);
  }

  function runChecks() {
    tryInjectSidebar();
    tryPatchBottomGallery();
    if (isDashboard()) patchThumbnailErrors();
  }

  function startObserver() {
    if (S.observerActive) return;
    S.observerActive = true;
    var obs = new MutationObserver(function () { runChecks(); });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  /* ============================================================
   * HASH / ROUTE LISTENER
   * ========================================================== */
  function onHashChange() {
    var hash = window.location.hash || "";
    /* Sync URL-based team ID (may still be null for fresh users) */
    var fromUrl = getTeamId();
    if (fromUrl) S.teamId = fromUrl;

    if (hash === HUB_HASH || hash.indexOf(HUB_HASH + "/") === 0) {
      showHub();
      return;
    }

    /* If hub is open and user navigated to a real Penpot route → close hub */
    if (S.overlayEl && !S.overlayEl.hasAttribute("hidden")) {
      if (/^#\/(dashboard|workspace|auth|login)/.test(hash)) {
        hideHub();
      }
    }

    /* Sidebar / gallery may need re-injection after route change */
    if (isDashboard()) {
      S.sidebarInjected = false;
      S.galleryPatched  = false;
      /* Resolve team ID then inject; delay for Penpot React to commit new DOM */
      setTimeout(function () {
        resolveTeamId().then(function () { runChecks(); });
      }, 600);
    }
  }

  /* Toast helper for user-visible errors */
  function showMsg(text) {
    var toast = document.createElement("div");
    toast.style.cssText =
      "position:fixed;bottom:80px;left:50%;transform:translateX(-50%);" +
      "background:#1f2937;color:#f8fafc;padding:12px 20px;border-radius:12px;" +
      "font-size:13px;z-index:2147483600;font-family:" + BRAND.font + ";" +
      "box-shadow:0 8px 32px rgba(0,0,0,.5)";
    toast.textContent = text;
    document.body.appendChild(toast);
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 4000);
  }

  /* ============================================================
   * INIT
   * ========================================================== */
  function init() {
    /* Eagerly resolve team ID (async, covers new users without UUID in URL) */
    resolveTeamId();

    buildOverlay();          /* pre-build hidden overlay */
    startObserver();         /* watch DOM for sidebar/gallery */

    window.addEventListener("hashchange", onHashChange);

    /* Handle if page was opened directly at the hub hash */
    var h = window.location.hash || "";
    if (h === HUB_HASH || h.indexOf(HUB_HASH + "/") === 0) {
      showHub();
    } else if (isDashboard()) {
      /* Re-run sidebar injection after team ID resolves */
      resolveTeamId().then(function () { runChecks(); });
    }

    /* Expose global API for other scripts / console */
    window.NofidaLibraryHub = {
      open:    function () {
        resolveTeamId().then(function () {
          window.location.hash = "/nofida/libraries";
        });
      },
      close:   hideHub,
      reload:  function () {
        S.catalog      = null;
        S.installed    = {};
        S.hubProjectId = null;
        loadCatalogAndInstalled();
      },
      status:  function () {
        return {
          teamId:    S.teamId,
          installed: Object.keys(S.installed).length,
          catalog:   S.catalog ? S.catalog.length : 0
        };
      }
    };
  }

  /* Wait until the page is fully interactive before touching the DOM */
  function onReady(fn) {
    if (document.readyState === "complete") {
      requestAnimationFrame(function () { requestAnimationFrame(fn); });
    } else {
      window.addEventListener("load", function () {
        requestAnimationFrame(function () { requestAnimationFrame(fn); });
      }, { once: true });
    }
  }

  onReady(init);
})();
