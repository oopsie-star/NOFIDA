#!/usr/bin/env python3
"""PATCH 014H/014L: stamp catalog.json with service-account import audit + user-facing statuses."""
import datetime
import json
import os
import pathlib
import tempfile

CATALOG   = pathlib.Path("/opt/nofida-core/library-store/catalog.json")
INVENTORY = pathlib.Path("/opt/nofida-core/library-store/inventory.json")
STORE_ROOT = CATALOG.parent
VERIFIED_IMPORT_MAX_BYTES = 64 * 1024 * 1024
OLD_BINARY_MAGIC = bytes.fromhex("010b1a865063a15f")
ZIP_MAGIC_PREFIXES = (
    b"PK\x03\x04",
    b"PK\x05\x06",
    b"PK\x07\x08",
)

NOW             = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
PENPOT_PROJECT  = "9e0caacb-e212-806e-8008-2cba2d8266cc"
PENPOT_ACCOUNT  = "oopsifymovie@gmail.com"
PENPOT_PROJECT_NAME = "NOFIDA Libraries"

# catalog_id -> (penpot_file_id, penpot_file_name)
# penpot_file_name = name as it appears in Penpot UI (embedded in archive)
IMPORTED = {
    "app-inventor":                        ("9e0caacb-e212-806e-8008-2cbc11c5e8e6", "App Inventor Classificação de Imagens"),
    "minimalistic-wireframing-kit":        ("9e0caacb-e212-806e-8008-2cbc88f1133e", "minimalist-wireframing-kit"),
    "blender-cons-set":                    ("9e0caacb-e212-806e-8008-2cbce08034a1", "Blender Design System 1.0"),
    "eisenhower-matrix":                   ("9e0caacb-e212-806e-8008-2cbcee6fe2e3", "Eisenhower Matrix"),
    "variant-examples":                    ("9e0caacb-e212-806e-8008-2cbe680c3926", "Variant examples v1"),
    "complete-website-design-process":     ("9e0caacb-e212-806e-8008-2cbe9caffcb0", "Wireframing kit"),
    "smartwatch-ui":                       ("9e0caacb-e212-806e-8008-2cbeac772b7e", "smartwatch-ui"),
    "user-flow-elements":                  ("9e0caacb-e212-806e-8008-2cbeae52ddba", "user-flow-elements"),
    "sales-dashboard-example":             ("9e0caacb-e212-806e-8008-2cbec9cf3690", "sales-dashboard-example-template"),
    "just-another-resume-template":        ("9e0caacb-e212-806e-8008-2cbece80ed84", "Just Another Resume Template"),
    "monster-game":                        ("9e0caacb-e212-806e-8008-2cbef311bcc0", "MONSTER GAME"),
    "gopher-illustrations-v2":             ("9e0caacb-e212-806e-8008-2cbf1cfb54bc", "Gopher illustrations v2"),
    "user-persona-template":               ("9e0caacb-e212-806e-8008-2cbf249d1ffa", "Persona template"),
    "just-another-project-starter":        ("9e0caacb-e212-806e-8008-2cbf25d0a012", "Just Another Project Starter Template"),
    "neomorphic-ui-kit":                   ("9e0caacb-e212-806e-8008-2cbf28b88e1f", "Neomorphic Light UI kit"),
    "dashboard-ui-starter-kit":            ("9e0caacb-e212-806e-8008-2cbf2e579200", "Dashboard UI Starter Kit"),
    "oss-product-management":              ("9e0caacb-e212-806e-8008-2cbf3e472e80", "OSS-Product management-processes"),
    "fusion-web3-iconset":                 ("9e0caacb-e212-806e-8008-2cbf4812b8ea", "Web3 IconSet"),
    "grid-layout-playground":              ("9e0caacb-e212-806e-8008-2cbf533865f9", "Grid layout playground"),
    "coreui-icon-pack":                    ("9e0caacb-e212-806e-8008-2cbf75a9e635", "CoreUI Icon Pack"),
    "gopher-illustrations":                ("9e0caacb-e212-806e-8008-2cbf94992428", "Gopher-illustrations"),
    "bingo-reading-challenge":             ("9e0caacb-e212-806e-8008-2cbf96f5e996", "Bingo"),
    "ultimate-whiteboarding-kit":          ("9e0caacb-e212-806e-8008-2cbf9eef61a9", "Ultimate Whiteboard Kit + Templates"),
    "how-to-create-a-flyer":               ("9e0caacb-e212-806e-8008-2cbfdf60b420", "How to create a Flyer"),
    "business-process-model-and-notation": ("9e0caacb-e212-806e-8008-2cbfe35bd55a", "Business Process Model and Notation BPMN Kit"),
    "localhost-locofy-sample-project":     ("9e0caacb-e212-806e-8008-2cc026a65be6", "Localhost - Locofy Sample Project Demo"),
    "travel-a2b-locofy-sample-project":    ("9e0caacb-e212-806e-8008-2cc052687949", "Travel A2B - Locofy Sample project"),
    "typography-design-tokens-simple-demo":("9e0caacb-e212-806e-8008-2cc0623936a8", "Simple demo: Typography tokens"),
    "saas-dashboard-ui-kit":               ("9e0caacb-e212-806e-8008-2cc0842f3417", "SaaS Dashboard UI Kit"),
    "bloba-modular-organic-shapes":        ("9e0caacb-e212-806e-8008-2cc08ea60c83", "BLOBA – Modular Organic Shapes"),
    "webdesign-layout":                    ("9e0caacb-e212-806e-8008-2cc0a9efa6fe", "Webdesign layouts Library (v2.1)"),
    "ajeen-icons":                         ("9e0caacb-e212-806e-8008-2ccfb03603fa", "Ajeen Icons"),
    "qedra-icons":                         ("9e0caacb-e212-806e-8008-2ccfc7f09cf7", "Qedra Icons"),
    "core-ui-demo":                        ("9e0caacb-e212-806e-8008-2cd16c17eb09", "CoreUI UI Kit (DEMO)"),
    "equalizer-music-app":                 ("9e0caacb-e212-806e-8008-2cd2c9096412", "Lucide-icons"),
    "design-tokens-helionox":              ("9e0caacb-e212-806e-8008-2cd2fd366f22", "TailwindCSS Design Tokens - Helionox"),
    "type-scale-plaground":                ("9e0caacb-e212-806e-8008-2cd31230a5b7", "Type Scale Playground"),
    "penpot-design-system":                ("9e0caacb-e212-806e-8008-2cd46fe05922", "Pencil | Penpot Design System"),
    "desig-tokens-starter-kit":            ("9e0caacb-e212-806e-8008-2cd499a9fd95", "Tokens starter kit"),
    "color-palette-kit":                   ("9e0caacb-e212-806e-8008-2cd4b980e4ca", "Color palette kit - design tokens v1"),
    "color-palette-kit-assets":            ("9e0caacb-e212-806e-8008-2cd4dc227fe8", "Color palette kit - color assets v1"),
    "tipography-tokens-starter-kit":       ("9e0caacb-e212-806e-8008-2cd4e99269ac", "Typography Tokens Starter Kit"),
    "100-card-design-templates-ui-kit":    ("9e0caacb-e212-806e-8008-2cd50a86b602", "100 card design templates UI kit (Community)"),
    "50-mobile-bottom-navigation-bar":     ("9e0caacb-e212-806e-8008-2cd665c8a40b", "50 Mobile Bottom Navigation Bar (Community)"),
    "essential-ui-kit":                    ("9e0caacb-e212-806e-8008-2cd6a4e39610", "Essential UI - Figma Ui Kit (Community)"),
    "calendar-interactive-ui-kit":         ("9e0caacb-e212-806e-8008-2cd6c8e22968", "Calendar Interactive UI Kit (Community)"),
    "59-charts-ui-responsive-components":  ("9e0caacb-e212-806e-8008-2cd7da2e93ea", "59 Charts UI Responsive Components Chart.js Chartist Apex Charts and Recharts (Community)"),
    "charts-kit":                          ("9e0caacb-e212-806e-8008-2cd80a080324", "Data Visualization Graphs / Charts Kit (Community)"),
    "math-functions-in-design-tokens":     ("9e0caacb-e212-806e-8008-2cd8140345ca", "Design tokens + math functions"),
    "delivery-app-ui-kit":                 ("9e0caacb-e212-806e-8008-2cd8ae614f63", "Delivery App_UI Kit (Community)"),
    "food-delivery-app-ui-kit":            ("9e0caacb-e212-806e-8008-2cd9a1bc4b67", "Food delivery app Ui kit (Community)"),
    "bootstrap-5-starter-ui-kit":          ("9e0caacb-e212-806e-8008-2cda5443d39a", "Bootstrap 5 UI Kit (Community)"),
    "community-posters":                   ("9e0caacb-e212-806e-8008-2cda61402edf", "community-covers"),
    "dashboard-ui-kit":                    ("9e0caacb-e212-806e-8008-2cdb2c85e231", "Dashboard UI Kit - Dashboard, Free Admin Dashboard (Community)"),
    "community-wireframes":                ("9e0caacb-e212-806e-8008-2cdb3fcd19cb", "penpot-community-wireframe"),
    "community-cards":                     ("9e0caacb-e212-806e-8008-2cdb5176391c", "Community-Cards-grid-theme"),
    "plants-app":                          ("9e0caacb-e212-806e-8008-2cdbb37f6787", "Plants-app"),
    "interactive-music-app":               ("9e0caacb-e212-806e-8008-2cdc08f93b15", "Interactive-music-app"),
}

# Load inventory to determine reason for non-imported files
inv_data = json.loads(INVENTORY.read_text(encoding="utf-8"))
inv_map = {item["id"]: item for item in inv_data.get("items", [])}

def file_path_for(item):
    rel = item.get("file")
    if not rel:
        return None
    return STORE_ROOT / rel


def sniff_file_format(item):
    fmt = item.get("file_format")
    if fmt:
        return fmt

    path = file_path_for(item)
    if not path or not path.exists():
        return None

    with path.open("rb") as handle:
        head = handle.read(8)

    if any(head.startswith(prefix) for prefix in ZIP_MAGIC_PREFIXES):
        return "modern_penpot_archive"
    if head.startswith(OLD_BINARY_MAGIC):
        return "old_binary_format_v1"
    return "unknown_binary"


def user_import_reason(item):
    reason = item.get("user_import_reason")
    if reason:
        return reason

    manual_upload = bool(item.get("manual_upload"))
    fmt = sniff_file_format(item)
    if manual_upload and fmt == "old_binary_format_v1":
        return "needs_manual_conversion"
    if item.get("quality_status") == "empty_or_broken" or item.get("status") == "rejected":
        return "invalid_manual_file"
    if item.get("import_verification_status") == "import_failed" or item.get("verified_importable") is False:
        return "manual_import_failed"

    license_status = item.get("license_status") or ""
    if license_status in {"trademark_review", "needs_license_review", "needs_review"}:
        return "trademark_license_review" if license_status == "trademark_review" else "needs_license_review"
    if item.get("status") == "download_failed":
        return "download_failed"
    if item.get("status") == "no_download_url" and not item.get("file"):
        return "no_download_url"
    size_bytes = item.get("size_bytes") or item.get("known_size_bytes") or 0
    if fmt == "old_binary_format_v1":
        return "needs_manual_conversion"
    if item.get("status") == "too_large" and not item.get("file"):
        if size_bytes and size_bytes <= VERIFIED_IMPORT_MAX_BYTES:
            return "needs_manual_large_import"
        return "too_large_hard_limit"
    if fmt == "modern_penpot_archive" and size_bytes and size_bytes > VERIFIED_IMPORT_MAX_BYTES:
        return "needs_manual_large_import"
    return None


def user_catalog_status(item):
    state = item.get("user_import_status")
    if state == "available":
        return "available"
    if state == "conversion_required":
        return "conversion_required"
    if state == "large_import_required":
        return "large_import_required"
    if state == "review_required":
        return "review_required"
    if state == "rejected":
        return "rejected"
    if state == "import_failed":
        return "import_failed"
    if state in {"download_failed", "no_download_url", "too_large"}:
        return state

    reason = user_import_reason(item)
    if reason is None and item.get("file") and sniff_file_format(item) == "modern_penpot_archive":
        return "available"

    return {
        "needs_manual_conversion": "conversion_required",
        "needs_manual_large_import": "large_import_required",
        "trademark_license_review": "review_required",
        "invalid_manual_file": "rejected",
        "manual_import_failed": "import_failed",
        "download_failed": "download_failed",
        "no_download_url": "no_download_url",
        "too_large_hard_limit": "too_large",
    }.get(reason, item.get("status") or "download_failed")

cat_data = json.loads(CATALOG.read_text(encoding="utf-8"))

imported_count = 0
not_imported_count = 0

for item in cat_data.get("libraries", []):
    fid = item.get("id", "")
    inv_item = inv_map.get(fid, {})
    if inv_item:
        user_reason = user_import_reason(inv_item)
        item["status"] = user_catalog_status(inv_item)
        item["file_format"] = sniff_file_format(inv_item)
        item["recovery_status"] = inv_item.get("recovery_status")
        item["recovered_at"] = inv_item.get("recovered_at")
        item["manual_upload"] = bool(inv_item.get("manual_upload"))
        item["operator_supplied"] = bool(inv_item.get("operator_supplied"))
        item["quality_status"] = inv_item.get("quality_status")
        item["quality_notes"] = inv_item.get("quality_notes")
        item["open_default_page"] = inv_item.get("open_default_page")
        item["open_default_page_id"] = inv_item.get("open_default_page_id")
        item["pages_count"] = inv_item.get("pages_count")
        item["components_count"] = inv_item.get("components_count")
        item["useful_pages_count"] = inv_item.get("useful_pages_count")
        item["broken_media_placeholders"] = inv_item.get("broken_media_placeholders")
        item["verified_importable"] = inv_item.get("verified_importable")
        item["import_verification_status"] = inv_item.get("import_verification_status")
        item["import_verification_checked_at"] = inv_item.get("import_verification_checked_at")
        if user_reason:
            item["import_skip_reason"] = user_reason
        else:
            item.pop("import_skip_reason", None)

    if fid in IMPORTED:
        pf_id, pf_name = IMPORTED[fid]
        item["import_status"]         = "imported"
        item["service_account_import_status"] = "imported"
        item["penpot_file_id"]        = pf_id
        item["penpot_file_name"]      = pf_name
        item["imported_into"]         = PENPOT_PROJECT_NAME
        item["penpot_project_id"]     = PENPOT_PROJECT
        item["penpot_account"]        = PENPOT_ACCOUNT
        item["imported_at"]           = NOW
        item["shared_library_status"] = "enabled"
        item["is_shared"]             = True
        imported_count += 1
    else:
        item["import_status"]         = "not_imported"
        item["service_account_import_status"] = "not_imported"
        item.pop("penpot_file_id",     None)
        item.pop("penpot_file_name",   None)
        item.pop("imported_into",      None)
        item.pop("penpot_project_id",  None)
        item.pop("imported_at",        None)
        item.pop("shared_library_status", None)
        item.pop("is_shared",          None)
        not_imported_count += 1

print(f"imported: {imported_count}  not-imported: {not_imported_count}  total: {imported_count+not_imported_count}")

# Atomic write + validate
store = CATALOG.parent
with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=store, delete=False, suffix=".tmp") as f:
    json.dump(cat_data, f, ensure_ascii=False, indent=2)
    f.write("\n")
    tmp = f.name

# Validate
parsed = json.loads(pathlib.Path(tmp).read_text(encoding="utf-8"))
assert len(parsed.get("libraries", [])) > 0, "catalog is empty after update"
os.replace(tmp, CATALOG)
print(f"Saved: {CATALOG}")

# Quick spot-checks
imp = [f for f in parsed["libraries"] if f.get("import_status") == "imported"]
assert len(imp) == len(IMPORTED), f"expected {len(IMPORTED)} imported, got {len(imp)}"
missing_id   = [f["id"] for f in imp if not f.get("penpot_file_id")]
missing_name = [f["id"] for f in imp if not f.get("penpot_file_name")]
missing_ts   = [f["id"] for f in imp if not f.get("imported_at")]
not_imp = [f for f in parsed["libraries"] if f.get("import_status") == "not_imported"]
blocked = [f for f in parsed["libraries"] if f.get("import_skip_reason")]
available_not_preseeded = [f["id"] for f in not_imp if f.get("status") == "available"]
missing_reason = [f["id"] for f in blocked if not f.get("import_skip_reason")]
print(f"Spot-checks → missing penpot_file_id: {missing_id or 'none'}")
print(f"             missing penpot_file_name: {missing_name or 'none'}")
print(f"             missing imported_at:      {missing_ts or 'none'}")
print(f"             user-blocked no reason:   {missing_reason or 'none'}")
print(f"             available not preseeded:  {available_not_preseeded or 'none'}")
print("catalog.json update: PASS")
