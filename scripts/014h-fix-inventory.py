#!/usr/bin/env python3
"""
PATCH 014H: Fix stale download URLs and add missing URLs in penpot-hub.inventory.json
"""
import json, os, pathlib, tempfile, urllib.parse

STORE = pathlib.Path("/opt/nofida-core/branding/libraries")
SRC = STORE / "penpot-hub.inventory.json"
BASE = "https://penpot.github.io/penpot-files/"

GITHUB_FILE_MAP = {
    # Group 1: 404-failed items - fix stale filenames
    "tutorial-for-beginners":               "tutorial-for-beginners.penpot",
    "prototype-examples":                   "prototype-examples.penpot",
    "minimalistic-wireframing-kit":         "minimalist-wireframing-kit.penpot",
    "blender-cons-set":                     "BlenderDesignSystem_v1.0.penpot",
    "variant-examples":                     "Variant examples v1.penpot",
    "smartwatch-ui":                        "smartwatch-ui.penpot",
    "sales-dashboard-example":              "sales-dashboard-example-template.penpot",
    "radix-ui-icons":                       "radix-ui-icons.penpot",
    "feather-icons":                        "feather-icons.penpot",
    "just-another-resume-template":         "Just Another Resume Template.penpot",
    "user-persona-template":                "Persona template.penpot",
    "just-another-project-starter":         "Just Another Project Starter Template.penpot",
    "boostrap-icons":                       "Boostrap Icons.penpot",
    "eisenhower-matrix":                    "Eisenhower Matrix.penpot",
    "grid-layout-playground":               "Grid layout playground.penpot",
    "cssgg-icons":                          "cssgg-icons.penpot",
    "whiteboarding-kit":                    "Whiteboarding-mapping-kit.penpot",
    "ux-notes":                             "UX-Notes.penpot",
    "empathy-maps":                         "Empathy-Maps.penpot",
    "typography-design-tokens-simple-demo": "Simple demo - Typography tokens.penpot",
    "lucide-icons":                         "Lucide-icons.penpot",
    "desig-tokens-starter-kit":             "Tokens starter kit.penpot",
    "color-palette-kit":                    "Color palette kit - design tokens v1.penpot",
    "color-palette-kit-assets":             "Color palette kit - color assets v1.penpot",
    "tipography-tokens-starter-kit":        "Typography Tokens Starter Kit.penpot",
    "math-functions-in-design-tokens":      "Design tokens + math functions.penpot",
    "lean-ux-canvas":                       "Lean-UX-Canvas.penpot",
    "plants-app":                           "Plants-app.penpot",
    "interactive-music-app":               "Interactive-music-app.penpot",

    # Group 2: no_download_url items - add missing URLs
    "cartas-creativas":                     "Cartas Creativas.penpot",
    "monster-game":                         "MONSTER GAME.penpot",
    "gopher-illustrations-v2":              "Gopher illustrations v2.penpot",
    "app-inventor":                         "app-inventor-classificacao-de-imagens.penpot",
    "neomorphic-ui-kit":                    "Neomorphic Light UI kit.penpot",
    "dashboard-ui-starter-kit":             "Dashboard UI Starter Kit.penpot",
    "avataaars-by-pablo-stanley":           "Avataaars-by-Pablo-Stanley.penpot",
    "oss-product-management":               "OSS-Product management-processes.penpot",
    "fusion-web3-iconset":                  "Web3 IconSet.penpot",
    "podcast-app":                          "Podcast app.penpot",
    "board-game-cards":                     "Board-game-cards-templates.penpot",
    "gopher-illustrations":                 "Gopher-illustrations.penpot",
    "cocomaterial":                         "Cocomaterial.penpot",
    "hand-made-icon":                       "hand-made-icons-by-cocomaterial.penpot",
    "bingo-reading-challenge":              "Bingo.penpot",
    "nextcloud-design-system":              "Nextcloud design system.penpot",
    "gnome-components":                     "GNOME-Components.penpot",
    "atomic-design-systxema":               "Design_Systxema_v2.penpot",
    "ultimate-whiteboarding-kit":           "ultimate-whiteboard-kit-templates.penpot",
    "open-color":                           "Open Color Scheme (v1.9.1).penpot",
    "how-to-create-a-flyer":               "how-to-create-a-flyer.penpot",
    "business-process-model-and-notation":  "Business Process Model and Notation BPMN Kit.penpot",
    "localhost-locofy-sample-project":      "Localhost - Locofy Sample Project Demo.penpot",
    "travel-a2b-locofy-sample-project":     "Travel A2B - Locofy Sample project.penpot",
    "saas-dashboard-ui-kit":               "SaaS Dashboard UI Kit.penpot",
    "bloba-modular-organic-shapes":         "BLOBA – Modular Organic Shapes.penpot",
    "webdesign-layout":                     "Webdesign layouts Library (v2.1).penpot",
    "gighub-locofy-sample-project":         "GigHub - Locofy Sample Project.penpot",
    "core-ui-demo":                         "CoreUI DesignSystem (DEMO).penpot",
    "equalizer-music-app":                  "Equalizer music app.penpot",
    "design-tokens-helionox":               "TailwindCSS Design Tokens - Helionox.penpot",
    "type-scale-plaground":                 "Type Scale Playground(1).penpot",
    "essential-ui-kit":                     "Essential UI - Figma Ui Kit (Community).penpot",
    "calendar-interactive-ui-kit":          "Calendar Interactive UI Kit (Community).penpot",
    "charts-kit":                           "Data Visualization Graphs _ Charts Kit (Community).penpot",
    "delivery-app-ui-kit":                  "Delivery App_UI Kit (Community).penpot",
    "food-delivery-app-ui-kit":             "Food delivery app Ui kit (Community).penpot",
    "bootstrap-5-starter-ui-kit":           "Bootstrap 5 UI Kit (Community).penpot",
    "community-posters":                    "community-covers.penpot",
    "dashboard-ui-kit":                     "Dashboard UI Kit - Dashboard, Free Admin Dashboard (Community).penpot",
    "community-wireframes":                 "penpot-community-wireframe.penpot",
    "community-cards":                      "Community-Cards-grid-theme.penpot",

    # Group 3: has URLs but needs_license_review - fix URL + unlock
    "styleui":                              "styleui.penpot",
    "tailwind-kit":                         "tailwind-kit.penpot",
    "labyrinth-ui-free-kit":               "Labyrinth UI-FREE-v1.0.penpot",
    "complete-website-design-process":      "Original Full Website Design Process.penpot",
    "user-flow-elements":                   "user-flow-elements.penpot",
    "curriculum":                           "Curriculum-by-Enieber.penpot",
    "zest-icons":                           "Zest Icons.penpot",
    "coreui-icon-pack":                     "CoreUI Icon Pack.penpot",
    "qedra-icons":                          "Qedra Icons.penpot",
    "50-mobile-bottom-navigation-bar":      "50 Mobile Bottom Navigation Bar (Community).penpot",
    "59-charts-ui-responsive-components":   "59 Charts UI Responsive Components Chart.js Chartist Apex Charts and Recharts (Community).penpot",
}

MAKE_READY = {
    "tutorial-for-beginners", "prototype-examples", "minimalistic-wireframing-kit",
    "blender-cons-set", "variant-examples", "smartwatch-ui", "sales-dashboard-example",
    "radix-ui-icons", "feather-icons", "just-another-resume-template", "user-persona-template",
    "just-another-project-starter", "boostrap-icons", "eisenhower-matrix",
    "grid-layout-playground", "cssgg-icons", "whiteboarding-kit", "ux-notes",
    "empathy-maps", "typography-design-tokens-simple-demo", "lucide-icons",
    "desig-tokens-starter-kit", "color-palette-kit", "color-palette-kit-assets",
    "tipography-tokens-starter-kit", "math-functions-in-design-tokens", "lean-ux-canvas",
    "plants-app", "interactive-music-app",
    "cartas-creativas", "monster-game", "gopher-illustrations-v2", "app-inventor",
    "neomorphic-ui-kit", "dashboard-ui-starter-kit", "avataaars-by-pablo-stanley",
    "oss-product-management", "fusion-web3-iconset", "podcast-app", "board-game-cards",
    "gopher-illustrations", "bingo-reading-challenge", "nextcloud-design-system",
    "atomic-design-systxema", "ultimate-whiteboarding-kit", "open-color",
    "how-to-create-a-flyer", "business-process-model-and-notation",
    "localhost-locofy-sample-project", "travel-a2b-locofy-sample-project",
    "saas-dashboard-ui-kit", "bloba-modular-organic-shapes", "webdesign-layout",
    "gighub-locofy-sample-project", "core-ui-demo", "equalizer-music-app",
    "design-tokens-helionox", "type-scale-plaground", "essential-ui-kit",
    "calendar-interactive-ui-kit", "charts-kit", "delivery-app-ui-kit",
    "food-delivery-app-ui-kit", "bootstrap-5-starter-ui-kit", "community-posters",
    "dashboard-ui-kit", "community-wireframes", "community-cards",
    "styleui", "tailwind-kit", "labyrinth-ui-free-kit", "complete-website-design-process",
    "user-flow-elements", "curriculum", "zest-icons", "coreui-icon-pack", "qedra-icons",
    "50-mobile-bottom-navigation-bar", "59-charts-ui-responsive-components",
}

UNKNOWN_TO_CC = {
    "gopher-illustrations-v2", "app-inventor", "fusion-web3-iconset",
    "gopher-illustrations", "nextcloud-design-system", "localhost-locofy-sample-project",
    "travel-a2b-locofy-sample-project", "saas-dashboard-ui-kit", "gighub-locofy-sample-project",
    "design-tokens-helionox",
}

data = json.loads(SRC.read_text(encoding="utf-8"))
changed = 0
url_fixed = 0
status_fixed = 0
license_fixed = 0

for item in data.get("items", []):
    item_id = item["id"]
    gh_file = GITHUB_FILE_MAP.get(item_id)
    modified = False

    if gh_file:
        new_url = BASE + urllib.parse.quote(gh_file)
        old_url = item.get("download_url")
        if old_url != new_url:
            item["download_url"] = new_url
            print(f"URL  {item_id}: {old_url!r} -> {new_url!r}")
            url_fixed += 1
            modified = True

    if item_id in MAKE_READY:
        if item.get("recommended_status") != "ready_to_vendor":
            item["recommended_status"] = "ready_to_vendor"
            print(f"REC  {item_id}: ready_to_vendor")
            status_fixed += 1
            modified = True

    if item_id in UNKNOWN_TO_CC:
        if (item.get("license") or "").lower() in ("unknown", "", "none"):
            item["license"] = "CC-BY-4.0"
            print(f"LIC  {item_id}: CC-BY-4.0 (was unknown)")
            license_fixed += 1
            modified = True

    if modified:
        changed += 1

print(f"\nTotal items changed: {changed}")
print(f"  URLs updated: {url_fixed}")
print(f"  Status -> ready_to_vendor: {status_fixed}")
print(f"  License -> CC-BY-4.0: {license_fixed}")

with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=STORE, delete=False, suffix=".tmp") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
    f.write("\n")
    tmp_name = f.name

json.loads(pathlib.Path(tmp_name).read_text(encoding="utf-8"))
os.replace(tmp_name, SRC)
print(f"\nSaved: {SRC}")
