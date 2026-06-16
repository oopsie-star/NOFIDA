#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

export NOFIDA_REPO_ROOT="${REPO_ROOT}"

python3 - "$@" <<'PY'
import argparse
import datetime as dt
import hashlib
import json
import os
import pathlib
import re
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request


VERSION = 1
USER_AGENT = "nofida-library-sync/1.0"
DEFAULT_MAX_SIZE_BYTES = 50 * 1024 * 1024
DEFAULT_HARD_MAX_SIZE_BYTES = 64 * 1024 * 1024
DEFAULT_VERIFIED_IMPORT_MAX_SIZE_BYTES = 64 * 1024 * 1024
DEFAULT_HUB_DELAY_MS = 1200
TRUSTED_LICENSES = {
    "apache-2.0",
    "bsd-2-clause",
    "bsd-3-clause",
    "cc-by-4.0",
    "cc0-1.0",
    "isc",
    "mit",
}
SIZE_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(KB|MB|GB)\b", re.IGNORECASE)
HTML_MARKERS = (
    b"<!doctype html",
    b"<html",
    b"<body",
    b"no matching published entries found",
)
NEXT_DATA_RE = re.compile(
    r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
    re.DOTALL,
)
PENPOT_FILE_URL_RE = re.compile(r"https://penpot\.github\.io/penpot-files/[^\"'<>\\\s]+\.penpot")
OLD_BINARY_MAGIC = bytes.fromhex("010b1a865063a15f")
ZIP_MAGIC_PREFIXES = (
    b"PK\x03\x04",
    b"PK\x05\x06",
    b"PK\x07\x08",
)

LEGAL_REVIEW_IDS = {
    "android-and-ios-keyboards-kit",
    "android-ui-kit",
    "ant-design-system",
    "ant-design-ui-kit-lite",
    "company-logos",
    "firefox-mockup",
    "google-maps-ui-kit",
    "ios-icon-template",
    "mastodon-app",
    "material-design-baselineal",
    "material-design-icons",
    "material-design-icons-light",
    "safari-os-15",
    "social-media-icons",
    "ui-kit-for-aws-amplify",
}

EXAMPLE_ONLY_IDS = {
    "core-ui-demo",
    "flex-layout-playground",
    "gighub-locofy-sample-project",
    "grid-layout-playground",
    "localhost-locofy-sample-project",
    "math-functions-in-design-tokens",
    "prototype-examples",
    "sales-dashboard-example",
    "travel-a2b-locofy-sample-project",
    "tutorial-for-beginners",
    "type-scale-plaground",
    "typography-design-tokens-simple-demo",
    "variant-examples",
}

NICHE_IDS = {
    "avataaars-by-pablo-stanley",
    "bingo-reading-challenge",
    "bloba-modular-organic-shapes",
    "board-game-cards",
    "cartas-creativas",
    "community-posters",
    "curriculum",
    "equalizer-music-app",
    "fusion-web3-iconset",
    "gopher-illustrations",
    "gopher-illustrations-v2",
    "how-to-create-a-flyer",
    "interactive-music-app",
    "just-another-resume-template",
    "monster-game",
    "plants-app",
    "podcast-app",
    "smartwatch-ui",
}

CORE_IDS = {
    "accessibility-documentation",
    "ajeen-icons",
    "atomic-design-systxema",
    "basic-layouts-template",
    "boostrap-icons",
    "bootstrap-5-starter-ui-kit",
    "color-palette-kit",
    "color-palette-kit-assets",
    "community-wireframes",
    "coreui-icon-pack",
    "cssgg-icons",
    "dashboard-ui-kit",
    "dashboard-ui-starter-kit",
    "desig-tokens-starter-kit",
    "design-tokens-helionox",
    "feather-icons",
    "fontawesome-icons",
    "hand-made-icon",
    "heroicons",
    "iconoir",
    "lucide-icons",
    "material-design-3",
    "minimalistic-wireframing-kit",
    "nextcloud-design-system",
    "open-color",
    "penpot-design-system",
    "phosphor-icons",
    "primeicons",
    "qedra-icons",
    "radix-ui-icons",
    "saas-dashboard-ui-kit",
    "tailwind-kit",
    "tipography-tokens-starter-kit",
    "ui-design-system",
    "webdesign-layout",
    "wireframes-kit",
}


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_args() -> argparse.Namespace:
    repo_root = pathlib.Path(os.environ.get("NOFIDA_REPO_ROOT", ".")).resolve()
    default_inventory_source = os.environ.get(
        "NOFIDA_PENPOT_INVENTORY_SOURCE",
        str(repo_root / "branding" / "libraries" / "penpot-hub.inventory.json"),
    )
    default_store_root = os.environ.get(
        "LIBRARY_STORE_DIR",
        os.environ.get("NOFIDA_LIBRARY_STORE_ROOT", "/opt/nofida-core/library-store"),
    )
    default_limit = os.environ.get("NOFIDA_LIBRARY_SYNC_LIMIT")

    parser = argparse.ArgumentParser(
        description="Sync approved Penpot Hub files into the NOFIDA host-backed library store."
    )
    parser.add_argument("--all", action="store_true", help="Explicitly attempt every eligible approved download.")
    parser.add_argument("--dry-run", action="store_true", help="Plan changes without writing catalog/inventory or downloading files.")
    parser.add_argument("--skip-downloads", action="store_true", help="Write catalog/inventory only; do not fetch files.")
    parser.add_argument("--inventory-source", default=default_inventory_source, help="Path or URL to the Hub inventory JSON.")
    parser.add_argument("--store-root", default=default_store_root, help="Library store root directory.")
    parser.add_argument("--limit", type=int, default=int(default_limit) if default_limit else None, help="Maximum number of approved files to download.")
    parser.add_argument("--id", action="append", default=[], dest="ids", help="Restrict downloads to a specific library id. Repeatable.")
    parser.add_argument(
        "--max-size-bytes",
        type=int,
        default=int(os.environ.get("NOFIDA_LIBRARY_MAX_SIZE_BYTES", str(DEFAULT_MAX_SIZE_BYTES))),
        help="Preferred maximum file size for routine automatic vendoring.",
    )
    parser.add_argument(
        "--hard-max-size-bytes",
        type=int,
        default=int(os.environ.get("NOFIDA_LIBRARY_HARD_MAX_SIZE_BYTES", str(DEFAULT_HARD_MAX_SIZE_BYTES))),
        help="Absolute maximum file size allowed for host-side recovery downloads.",
    )
    parser.add_argument(
        "--verified-import-max-bytes",
        type=int,
        default=int(
            os.environ.get(
                "NOFIDA_LIBRARY_VERIFIED_IMPORT_MAX_BYTES",
                str(DEFAULT_VERIFIED_IMPORT_MAX_SIZE_BYTES),
            )
        ),
        help="Largest modern .penpot archive size currently treated as browser-importable.",
    )
    parser.add_argument(
        "--hub-delay-ms",
        type=int,
        default=int(os.environ.get("NOFIDA_LIBRARY_HUB_DELAY_MS", str(DEFAULT_HUB_DELAY_MS))),
        help="Delay between public Penpot Hub detail-page checks.",
    )
    return parser.parse_args()


class Logger:
    def __init__(self, path: pathlib.Path) -> None:
        self.path = path
        self.handle = path.open("a", encoding="utf-8")

    def log(self, message: str = "") -> None:
        print(message)
        self.handle.write(message + "\n")
        self.handle.flush()

    def close(self) -> None:
        self.handle.close()


def load_json_source(source: str):
    if re.match(r"^https?://", source):
        request = urllib.request.Request(source, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(request, timeout=120) as response:
            raw = response.read().decode("utf-8")
        return json.loads(raw), source

    path = pathlib.Path(source).expanduser().resolve()
    return json.loads(path.read_text(encoding="utf-8")), str(path)


def load_current_inventory(path: pathlib.Path) -> dict:
    if not path.exists():
        return {"version": VERSION, "items": []}
    return json.loads(path.read_text(encoding="utf-8"))


def safe_relpath(path: pathlib.Path, root: pathlib.Path) -> str:
    return path.relative_to(root).as_posix()


def extract_hub_slug(hub_url: str | None) -> str | None:
    if not hub_url:
        return None
    path = urllib.parse.urlparse(hub_url).path.rstrip("/")
    if not path:
        return None
    return path.split("/")[-1] or None


def parse_known_size_bytes(risk_notes: str | None):
    if not risk_notes:
        return None
    match = SIZE_RE.search(risk_notes)
    if not match:
        return None
    value = float(match.group(1))
    unit = match.group(2).upper()
    factor = {"KB": 1024, "MB": 1024 * 1024, "GB": 1024 * 1024 * 1024}[unit]
    return int(value * factor)


def detect_file_format_from_head(head: bytes) -> str | None:
    if not head:
        return None
    if any(head.startswith(prefix) for prefix in ZIP_MAGIC_PREFIXES):
        return "modern_penpot_archive"
    if head.startswith(OLD_BINARY_MAGIC):
        return "old_binary_format_v1"
    return "unknown_binary"


def parse_hub_download_url(html: str, slug: str | None) -> str | None:
    if slug:
        match = NEXT_DATA_RE.search(html)
        if match:
            try:
                payload = json.loads(match.group(1))
                query_cache = (
                    payload.get("props", {})
                    .get("pageProps", {})
                    .get("plasmicData", {})
                    .get("queryCache", {})
                )
                if isinstance(query_cache, dict):
                    fallback_link = None
                    for value in query_cache.values():
                        if not isinstance(value, list):
                            continue
                        for entry in value:
                            data = entry.get("data") if isinstance(entry, dict) else None
                            if not isinstance(data, dict):
                                continue
                            data_slug = data.get("slug")
                            data_link = data.get("link")
                            if data_link and fallback_link is None:
                                fallback_link = data_link
                            if (
                                data_link
                                and isinstance(data_slug, str)
                                and data_slug.lower() == slug.lower()
                            ):
                                return data["link"]
                    if fallback_link:
                        return fallback_link
            except json.JSONDecodeError:
                pass

    url_match = PENPOT_FILE_URL_RE.search(html)
    if url_match:
        return url_match.group(0)
    return None


def recover_download_url_from_public_hub(record: dict, checked_at: str, delay_ms: int, logger: Logger) -> None:
    hub_url = record.get("upstream_hub_url") or record.get("hub_url")
    slug = extract_hub_slug(hub_url)
    record["public_hub_checked_at"] = checked_at

    if not hub_url or not slug:
        record["recovery_status"] = "recovery_failed"
        record["last_error"] = record.get("last_error") or "Missing public Hub URL."
        return

    request = urllib.request.Request(
        hub_url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            html = response.read().decode("utf-8", "ignore")
    except Exception as error:  # noqa: BLE001
        record["recovery_status"] = "recovery_failed"
        record["last_error"] = f"Public Hub check failed: {error}"
        logger.log(f"RECOVERY FAIL {record['id']} ({error})")
        if delay_ms > 0:
            time.sleep(delay_ms / 1000)
        return

    recovered_url = parse_hub_download_url(html, slug)
    if recovered_url:
        if record.get("download_url") != recovered_url:
            logger.log(f"RECOVERED  {record['id']} -> {recovered_url}")
        record["download_url"] = recovered_url
        record["recovery_status"] = "download_url_recovered"
        record["recovered_at"] = checked_at
        if record.get("status") == "no_download_url":
            record["status"] = "download_pending"
            record["status_reason"] = "download_url_recovered_from_public_hub"
        if record.get("status") == "download_failed":
            record["status_reason"] = "download_url_recovered_from_public_hub"
        if record.get("last_error") == "No direct download URL is known for this inventory item.":
            record["last_error"] = None
    elif "download" in html.lower() or "penpot-files" in html.lower():
        record["recovery_status"] = "public_download_exists_but_endpoint_unknown"
        logger.log(f"RECOVERY ?   {record['id']} (download action present but endpoint not parsed)")
    else:
        record["recovery_status"] = "no_download_action_found"
        logger.log(f"NO DOWNLOAD  {record['id']}")

    if delay_ms > 0:
        time.sleep(delay_ms / 1000)


def classify_tier(item: dict) -> str:
    item_id = item["id"]
    if item_id in LEGAL_REVIEW_IDS:
        return "legal_review"
    if item_id in EXAMPLE_ONLY_IDS:
        return "example_only"
    if item_id in NICHE_IDS:
        return "niche"
    if item_id in CORE_IDS:
        return "core"

    item_type = item.get("type") or ""
    title = (item.get("title") or "").lower()
    if item_type in {"design-system", "icon-set"}:
        return "core"
    if any(keyword in title for keyword in ("dashboard", "wireframe", "design token", "tokens")):
        return "core"
    return "useful"


def classify_license_status(item: dict, tier: str) -> str:
    if tier == "legal_review":
        return "trademark_review"

    license_name = (item.get("license") or "").strip().lower()
    recommended_status = (item.get("recommended_status") or "").strip().lower()

    if license_name.startswith("mpl") or license_name.startswith("gpl"):
        return "needs_license_review"
    if license_name in {"", "unknown"}:
        return "needs_license_review"
    if recommended_status in {"needs_license_review", "no_download_found"}:
        return "needs_license_review"
    if license_name in TRUSTED_LICENSES:
        return "approved"
    return "needs_license_review"


def build_file_name(item_id: str) -> str:
    return f"{item_id}.penpot"


def internal_url(file_rel: str | None) -> str | None:
    if not file_rel:
        return None
    return f"/nofida/libraries/{file_rel}"


def nofida_route(path: str) -> str:
    return f"/#/nofida/{path}"


def public_reference_route(url: str | None) -> str | None:
    if not url:
        return None

    parsed = urllib.parse.urlparse(url)
    host = (parsed.netloc or "").lower()
    path = (parsed.path or "").lower()
    joined = f"{host}{path}"

    if "github.com/penpot" in joined:
        return nofida_route("repository")
    if "help.penpot.app" in host:
        return nofida_route("help")
    if "community.penpot.app" in host or path.startswith("/penpotfest"):
        return nofida_route("community")
    if path.startswith("/penpothub") or path.startswith("/hub") or path.startswith("/libraries-templates"):
        return nofida_route("libraries")
    if path.startswith("/learn") or path.startswith("/why-beta"):
        return nofida_route("learn")
    if path.startswith("/blog") or path.startswith("/releases"):
        return nofida_route("releases")
    if path.startswith("/changelog"):
        return nofida_route("changelog")
    if path.startswith("/terms"):
        return nofida_route("terms")
    if path.startswith("/privacy"):
        return nofida_route("privacy")
    if host.endswith("penpot.app"):
        return nofida_route("help")
    return url


def build_base_record(
    item: dict,
    previous: dict | None,
    checked_at: str,
    soft_max_size_bytes: int,
    hard_max_size_bytes: int,
) -> dict:
    previous = previous or {}
    tier = classify_tier(item)
    license_status = classify_license_status(item, tier)
    known_size_bytes = parse_known_size_bytes(item.get("risk_notes"))
    download_url = item.get("download_url")
    upstream_hub_url = item.get("hub_url")
    source_url = item.get("source_repo") or upstream_hub_url
    file_rel = previous.get("file")
    base = {
        "id": item["id"],
        "title": item.get("title"),
        "name": item.get("title"),
        "author": item.get("author"),
        "type": item.get("type"),
        "tier": tier,
        "hub_url": public_reference_route(upstream_hub_url),
        "source_url": public_reference_route(source_url),
        "upstream_hub_url": upstream_hub_url,
        "upstream_source_url": source_url,
        "download_url": download_url,
        "license": item.get("license") or "unknown",
        "license_status": license_status,
        "file": file_rel,
        "internal_url": previous.get("internal_url") or internal_url(file_rel),
        "sha256": previous.get("sha256"),
        "size_bytes": previous.get("size_bytes"),
        "known_size_bytes": known_size_bytes,
        "status": previous.get("status"),
        "status_reason": previous.get("status_reason"),
        "last_error": previous.get("last_error"),
        "last_download_attempt_at": previous.get("last_download_attempt_at"),
        "last_checked_at": checked_at,
        "vendored_at": previous.get("vendored_at"),
        "quarantine_file": previous.get("quarantine_file"),
        "file_format": previous.get("file_format"),
        "format_detected_at": previous.get("format_detected_at"),
        "recovery_status": previous.get("recovery_status"),
        "recovered_at": previous.get("recovered_at"),
        "public_hub_checked_at": previous.get("public_hub_checked_at"),
        "manual_upload": previous.get("manual_upload"),
        "operator_supplied": previous.get("operator_supplied"),
        "manual_source": previous.get("manual_source"),
        "manual_source_name": previous.get("manual_source_name"),
        "manual_uploaded_at": previous.get("manual_uploaded_at"),
        "manual_rejected_source": previous.get("manual_rejected_source"),
        "quality_status": previous.get("quality_status"),
        "quality_notes": previous.get("quality_notes"),
        "open_default_page": previous.get("open_default_page"),
        "open_default_page_id": previous.get("open_default_page_id"),
        "pages_count": previous.get("pages_count"),
        "components_count": previous.get("components_count"),
        "useful_pages_count": previous.get("useful_pages_count"),
        "broken_media_placeholders": previous.get("broken_media_placeholders"),
        "verified_importable": previous.get("verified_importable"),
        "import_verification_status": previous.get("import_verification_status"),
        "import_verification_checked_at": previous.get("import_verification_checked_at"),
        "verified_file_name": previous.get("verified_file_name"),
        "import_adapter": previous.get("import_adapter"),
        "native_import_verified": previous.get("native_import_verified"),
        "verified_at": previous.get("verified_at"),
        "thumbnail_status": previous.get("thumbnail_status"),
        "user_import_status": previous.get("user_import_status"),
        "user_import_reason": previous.get("user_import_reason"),
        "risk_notes": item.get("risk_notes"),
        "source_present": True,
    }

    if previous.get("manual_upload"):
        base["manual_upload"] = True
        base["operator_supplied"] = True
        base["license_status"] = previous.get("license_status") or "needs_review"

    if base["status"] == "downloaded" and not base["file"]:
        base["status"] = None
    if known_size_bytes and known_size_bytes > hard_max_size_bytes and not base["file"]:
        base["status"] = "too_large"
        base["status_reason"] = f"known_size_exceeds_hard_limit:{known_size_bytes}>{hard_max_size_bytes}"
    elif license_status == "trademark_review" and not base["file"]:
        base["status"] = "trademark_review"
        base["status_reason"] = "legal_or_trademark_review_required"
    elif not download_url and not base["file"]:
        base["status"] = "no_download_url"
        base["status_reason"] = "missing_download_url"
        base["last_error"] = "No direct download URL is known for this inventory item."
    elif license_status != "approved" and not base["file"]:
        base["status"] = "needs_license_review"
        base["status_reason"] = "license_or_provenance_review_required"
    elif not base["file"]:
        base["status"] = base["status"] or "download_pending"
        if known_size_bytes and known_size_bytes > soft_max_size_bytes:
            base["status_reason"] = base["status_reason"] or "approved_large_file_pending_download"
        else:
            base["status_reason"] = base["status_reason"] or "approved_for_sync_pending"

    return base


def build_orphan_record(previous: dict, checked_at: str) -> dict:
    record = dict(previous)
    record["source_present"] = False
    record["last_checked_at"] = checked_at
    record["status_reason"] = record.get("status_reason") or "missing_from_current_source_inventory"
    return record


def refresh_existing_file(record: dict, store_root: pathlib.Path, checked_at: str) -> None:
    file_rel = record.get("file")
    if not file_rel:
        return

    file_path = store_root / file_rel
    if not file_path.exists():
        record["file"] = None
        record["internal_url"] = None
        record["sha256"] = None
        record["size_bytes"] = None
        record["file_format"] = None
        if record.get("license_status") == "approved":
            record["status"] = "download_failed"
            record["status_reason"] = "vendored_file_missing_from_store"
            record["last_error"] = f"Expected file missing: {file_path}"
        return

    sha = hashlib.sha256()
    size = 0
    with file_path.open("rb") as handle:
        head = handle.read(8)
        handle.seek(0)
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            size += len(chunk)
            sha.update(chunk)

    record["file"] = safe_relpath(file_path, store_root)
    record["internal_url"] = internal_url(record["file"])
    record["sha256"] = sha.hexdigest()
    record["size_bytes"] = size
    record["file_format"] = detect_file_format_from_head(head)
    record["format_detected_at"] = checked_at
    record["status"] = "downloaded"
    record["status_reason"] = "file_present_in_store"
    record["last_error"] = None


def should_download(record: dict, selected_ids: set[str], hard_max_size_bytes: int) -> bool:
    if record.get("file"):
        return False
    if record.get("license_status") != "approved":
        return False
    if not record.get("download_url"):
        return False
    known_size = record.get("known_size_bytes") or record.get("size_bytes") or 0
    if known_size and known_size > hard_max_size_bytes:
        return False
    if selected_ids and record["id"] not in selected_ids:
        return False
    return True


def looks_like_html(path: pathlib.Path, content_type: str | None) -> bool:
    if content_type and "html" in content_type.lower():
        return True

    with path.open("rb") as handle:
        head = handle.read(4096).lower()

    return any(marker in head for marker in HTML_MARKERS)


def is_manual_upload_override(record: dict) -> bool:
    return bool(record.get("manual_upload"))


def apply_user_import_state(record: dict, verified_import_max_bytes: int) -> None:
    reason = None
    state = "unavailable"
    size_bytes = record.get("size_bytes") or 0
    hard_failure = record.get("status") == "too_large" and not record.get("file")
    manual_override = is_manual_upload_override(record)
    quality_status = record.get("quality_status")
    verification_status = record.get("import_verification_status")
    verified_importable = record.get("verified_importable")
    native_import_verified = bool(record.get("native_import_verified"))
    import_adapter = record.get("import_adapter")
    native_ready = native_import_verified and import_adapter == "native"

    license_status = record.get("license_status")
    if quality_status == "empty_or_broken":
        reason = "invalid_manual_file"
        state = "rejected"
    elif verification_status == "import_failed" or verified_importable is False:
        reason = "manual_import_failed"
        state = "import_failed"
    elif record.get("file_format") == "old_binary_format_v1" and manual_override:
        reason = "needs_manual_conversion"
        state = "conversion_required"
    elif record.get("status") == "rejected":
        reason = "invalid_manual_file"
        state = "rejected"
    elif license_status in {"trademark_review", "needs_license_review", "needs_review"}:
        reason = "trademark_license_review" if license_status == "trademark_review" else "needs_license_review"
        state = "review_required"
    elif record.get("status") == "download_failed":
        reason = "download_failed"
        state = "download_failed"
    elif record.get("status") == "no_download_url" and not record.get("file"):
        reason = "no_download_url"
        state = "no_download_url"
    elif hard_failure:
        if native_ready:
            reason = None
            state = "available"
        else:
            size_hint = size_bytes or record.get("known_size_bytes") or 0
            if size_hint and size_hint <= verified_import_max_bytes:
                reason = "needs_manual_large_import"
                state = "large_import_required"
            else:
                reason = "too_large_hard_limit"
                state = "too_large"
    elif record.get("file"):
        if native_ready:
            reason = None
            state = "available"
        else:
            file_format = record.get("file_format")
            if file_format == "modern_penpot_archive":
                if size_bytes and size_bytes > verified_import_max_bytes:
                    reason = "needs_manual_large_import"
                    state = "large_import_required"
                elif verification_status == "verified" or verified_importable in {None, True}:
                    reason = None
                    state = "available"
                else:
                    reason = "manual_import_failed"
                    state = "import_failed"
            elif file_format == "old_binary_format_v1":
                reason = "needs_manual_conversion"
                state = "conversion_required"
            else:
                reason = "invalid_manual_file" if manual_override else "download_failed"
                state = "rejected" if manual_override else "download_failed"
    elif record.get("status") == "download_pending":
        state = "download_pending"

    record["user_import_status"] = state
    record["user_import_reason"] = reason


def catalog_import_format(record: dict) -> str | None:
    file_format = record.get("file_format")
    if record.get("import_adapter") == "native" and record.get("native_import_verified"):
        if file_format == "old_binary_format_v1":
            return "v1_legacy_supported"
        if file_format == "modern_penpot_archive":
            return "v3_zip"
    return file_format


def download_record(
    record: dict,
    store_root: pathlib.Path,
    quarantine_dir: pathlib.Path,
    files_dir: pathlib.Path,
    checked_at: str,
    soft_max_size_bytes: int,
    hard_max_size_bytes: int,
    logger: Logger,
) -> None:
    record["last_download_attempt_at"] = checked_at
    record["last_checked_at"] = checked_at

    request = urllib.request.Request(
        record["download_url"],
        headers={"User-Agent": USER_AGENT, "Accept": "application/octet-stream,application/zip,*/*"},
    )

    stamp = checked_at.replace(":", "").replace("-", "")
    temp_path = quarantine_dir / f"{record['id']}--{stamp}.download"
    final_quarantine = None
    sha = hashlib.sha256()
    size_bytes = 0

    try:
        with urllib.request.urlopen(request, timeout=300) as response, temp_path.open("wb") as handle:
            content_type = response.headers.get("Content-Type", "")
            resolved_url = response.geturl()
            record["download_url"] = resolved_url

            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                size_bytes += len(chunk)
                if size_bytes > hard_max_size_bytes:
                    handle.write(chunk)
                    handle.flush()
                    final_quarantine = quarantine_dir / f"{record['id']}--too-large.partial"
                    os.replace(temp_path, final_quarantine)
                    record["status"] = "too_large"
                    record["status_reason"] = f"download_exceeded_hard_limit:{size_bytes}>{hard_max_size_bytes}"
                    record["size_bytes"] = size_bytes
                    record["sha256"] = None
                    record["file"] = None
                    record["internal_url"] = None
                    record["quarantine_file"] = safe_relpath(final_quarantine, store_root)
                    record["last_error"] = f"File exceeded hard recovery limit of {hard_max_size_bytes} bytes."
                    logger.log(f"TOO LARGE  {record['id']} ({size_bytes} bytes)")
                    return
                handle.write(chunk)
                sha.update(chunk)

        if size_bytes == 0:
            raise RuntimeError("empty_download")

        if looks_like_html(temp_path, content_type):
            final_quarantine = quarantine_dir / f"{record['id']}--html-error.bin"
            os.replace(temp_path, final_quarantine)
            record["status"] = "download_failed"
            record["status_reason"] = "download_resolved_to_html_or_error_page"
            record["size_bytes"] = size_bytes
            record["sha256"] = None
            record["file"] = None
            record["internal_url"] = None
            record["quarantine_file"] = safe_relpath(final_quarantine, store_root)
            record["last_error"] = "Downloaded content looked like HTML or an upstream error page."
            logger.log(f"HTML FAIL  {record['id']}")
            return

        final_file = files_dir / build_file_name(record["id"])
        os.replace(temp_path, final_file)
        record["status"] = "downloaded"
        if size_bytes > soft_max_size_bytes:
            record["status_reason"] = f"downloaded_above_soft_limit:{size_bytes}>{soft_max_size_bytes}"
        else:
            record["status_reason"] = "downloaded_and_verified"
        record["size_bytes"] = size_bytes
        record["sha256"] = sha.hexdigest()
        record["file"] = safe_relpath(final_file, store_root)
        record["internal_url"] = internal_url(record["file"])
        record["vendored_at"] = record.get("vendored_at") or checked_at
        record["quarantine_file"] = None
        record["last_error"] = None
        with final_file.open("rb") as handle:
            record["file_format"] = detect_file_format_from_head(handle.read(8))
        record["format_detected_at"] = checked_at
        logger.log(f"DOWNLOADED {record['id']} -> {record['file']} ({size_bytes} bytes)")
    except urllib.error.HTTPError as error:
        if temp_path.exists():
            final_quarantine = quarantine_dir / f"{record['id']}--http-error.bin"
            os.replace(temp_path, final_quarantine)
            record["quarantine_file"] = safe_relpath(final_quarantine, store_root)
        record["status"] = "download_failed"
        record["status_reason"] = f"http_error:{error.code}"
        record["last_error"] = f"HTTP {error.code}: {error.reason}"
        record["file"] = None
        record["internal_url"] = None
        record["sha256"] = None
        logger.log(f"HTTP FAIL  {record['id']} ({error.code})")
    except Exception as error:  # noqa: BLE001
        if temp_path.exists():
            final_quarantine = quarantine_dir / f"{record['id']}--download-error.bin"
            os.replace(temp_path, final_quarantine)
            record["quarantine_file"] = safe_relpath(final_quarantine, store_root)
        record["status"] = "download_failed"
        record["status_reason"] = f"download_error:{type(error).__name__}"
        record["last_error"] = str(error)
        record["file"] = None
        record["internal_url"] = None
        record["sha256"] = None
        logger.log(f"DL FAIL    {record['id']} ({error})")


def catalog_status(record: dict) -> str:
    state = record.get("user_import_status")
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
    return record.get("status") or "download_failed"


def build_catalog(records: list[dict], checked_at: str, source_ref: str, max_size_bytes: int) -> dict:
    libraries = []
    for record in records:
        libraries.append(
            {
                "id": record.get("id"),
                "title": record.get("title"),
                "name": record.get("name"),
                "author": record.get("author"),
                "type": record.get("type"),
                "tier": record.get("tier"),
                "hub_url": record.get("hub_url"),
                "source_url": record.get("source_url"),
                "download_url": record.get("download_url"),
                "license": record.get("license"),
                "license_status": record.get("license_status"),
                "file": record.get("file"),
                "internal_url": record.get("internal_url"),
                "sha256": record.get("sha256"),
                "size_bytes": record.get("size_bytes"),
                "status": catalog_status(record),
                "import_skip_reason": record.get("user_import_reason"),
                "file_format": record.get("file_format"),
                "format": catalog_import_format(record),
                "recovery_status": record.get("recovery_status"),
                "recovered_at": record.get("recovered_at"),
                "manual_upload": record.get("manual_upload"),
                "operator_supplied": record.get("operator_supplied"),
                "quality_status": record.get("quality_status"),
                "quality_notes": record.get("quality_notes"),
                "open_default_page": record.get("open_default_page"),
                "open_default_page_id": record.get("open_default_page_id"),
                "pages_count": record.get("pages_count"),
                "components_count": record.get("components_count"),
                "useful_pages_count": record.get("useful_pages_count"),
                "broken_media_placeholders": record.get("broken_media_placeholders"),
                "verified_importable": record.get("verified_importable"),
                "import_verification_status": record.get("import_verification_status"),
                "import_verification_checked_at": record.get("import_verification_checked_at"),
                "verified_file_name": record.get("verified_file_name"),
                "import_adapter": record.get("import_adapter"),
                "native_import_verified": record.get("native_import_verified"),
                "verified_at": record.get("verified_at"),
                "thumbnail_status": record.get("thumbnail_status"),
                "last_checked_at": record.get("last_checked_at"),
                "vendored_at": record.get("vendored_at"),
            }
        )

    return {
        "version": VERSION,
        "generated_at": checked_at,
        "source_inventory": source_ref,
        "max_auto_download_bytes": max_size_bytes,
        "libraries": libraries,
    }


def build_inventory(records: list[dict], checked_at: str, source_ref: str, max_size_bytes: int) -> dict:
    items = []
    for record in records:
        item = dict(record)
        item.pop("upstream_hub_url", None)
        item.pop("upstream_source_url", None)
        items.append(item)

    return {
        "version": VERSION,
        "generated_at": checked_at,
        "source_inventory": source_ref,
        "max_auto_download_bytes": max_size_bytes,
        "items_count": len(records),
        "items": items,
    }


def write_json_atomic(path: pathlib.Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        temp_name = handle.name

    temp_path = pathlib.Path(temp_name)
    json.loads(temp_path.read_text(encoding="utf-8"))
    os.replace(temp_path, path)
    path.chmod(0o644)


def acquire_lock(lock_dir: pathlib.Path) -> None:
    try:
        lock_dir.mkdir(parents=False, exist_ok=False)
    except FileExistsError as error:
        raise RuntimeError(f"another sync is already running ({lock_dir})") from error


def release_lock(lock_dir: pathlib.Path) -> None:
    try:
        lock_dir.rmdir()
    except FileNotFoundError:
        return


def main() -> int:
    args = parse_args()
    if args.all and args.ids:
        raise SystemExit("--all cannot be combined with --id filters")
    store_root = pathlib.Path(args.store_root).expanduser().resolve()
    catalog_path = store_root / "catalog.json"
    inventory_path = store_root / "inventory.json"
    files_dir = store_root / "files"
    quarantine_dir = store_root / "quarantine"
    logs_dir = store_root / "logs"
    lock_dir = store_root / ".sync.lock"

    for directory in (store_root, files_dir, quarantine_dir, logs_dir):
        directory.mkdir(parents=True, exist_ok=True)

    checked_at = utc_now()
    log_path = logs_dir / f"sync-{checked_at.replace(':', '').replace('-', '')}.log"
    logger = Logger(log_path)

    try:
        acquire_lock(lock_dir)
    except Exception as error:  # noqa: BLE001
        logger.log(f"LOCK FAIL  {error}")
        logger.close()
        return 1

    try:
        logger.log(f"NOFIDA library sync started at {checked_at}")
        logger.log(f"Store root: {store_root}")
        logger.log(f"Inventory source: {args.inventory_source}")
        logger.log(f"Dry run: {'yes' if args.dry_run else 'no'}")
        logger.log(f"Skip downloads: {'yes' if args.skip_downloads else 'no'}")
        logger.log(f"Soft auto-download size: {args.max_size_bytes} bytes")
        logger.log(f"Hard recovery-download size: {args.hard_max_size_bytes} bytes")
        logger.log(f"Verified browser-import size: {args.verified_import_max_bytes} bytes")
        logger.log(f"Hub page delay: {args.hub_delay_ms} ms")

        source_data, source_ref = load_json_source(args.inventory_source)
        current_inventory = load_current_inventory(inventory_path)
        current_by_id = {item["id"]: item for item in current_inventory.get("items", []) if item.get("id")}
        source_items = source_data.get("items", [])
        source_ids = [item["id"] for item in source_items]
        selected_ids = set() if args.all else set(args.ids)

        new_ids = [item_id for item_id in source_ids if item_id not in current_by_id]
        orphan_ids = [item_id for item_id in current_by_id if item_id not in set(source_ids)]

        logger.log(f"Source items: {len(source_items)}")
        logger.log(f"New items vs current inventory: {len(new_ids)}")
        logger.log(f"Missing from current source inventory: {len(orphan_ids)}")
        if selected_ids:
            logger.log(f"Restricted download ids: {', '.join(sorted(selected_ids))}")

        records: list[dict] = []
        for item in source_items:
            record = build_base_record(
                item,
                current_by_id.get(item["id"]),
                checked_at,
                args.max_size_bytes,
                args.hard_max_size_bytes,
            )
            refresh_existing_file(record, store_root, checked_at)
            records.append(record)

        for orphan_id in orphan_ids:
            record = build_orphan_record(current_by_id[orphan_id], checked_at)
            refresh_existing_file(record, store_root, checked_at)
            records.append(record)

        recovery_targets = [
            record
            for record in records
            if (record.get("upstream_hub_url") or record.get("hub_url"))
            and (
                not record.get("download_url")
                or record.get("status") in {"download_failed", "too_large"}
                or record.get("file_format") == "old_binary_format_v1"
            )
        ]
        logger.log(f"Public Hub re-check targets: {len(recovery_targets)}")
        for record in recovery_targets:
            recover_download_url_from_public_hub(record, checked_at, args.hub_delay_ms, logger)

        for record in records:
            apply_user_import_state(record, args.verified_import_max_bytes)

        candidates = [
            record
            for record in records
            if should_download(record, selected_ids, args.hard_max_size_bytes)
        ]
        logger.log(f"Eligible approved downloads: {len(candidates)}")

        if args.limit is not None:
            candidates = candidates[: max(args.limit, 0)]
            logger.log(f"Applying limit -> {len(candidates)} candidates")

        if args.dry_run:
            for record in candidates:
                logger.log(f"PLAN       {record['id']} -> {record['download_url']}")
            logger.log("Dry run complete; no files or JSON were changed.")
            return 0

        if not args.skip_downloads:
            for record in candidates:
                download_record(
                    record=record,
                    store_root=store_root,
                    quarantine_dir=quarantine_dir,
                    files_dir=files_dir,
                    checked_at=checked_at,
                    soft_max_size_bytes=args.max_size_bytes,
                    hard_max_size_bytes=args.hard_max_size_bytes,
                    logger=logger,
                )

        # Refresh file-backed records one last time after downloads.
        for record in records:
            refresh_existing_file(record, store_root, checked_at)
            apply_user_import_state(record, args.verified_import_max_bytes)

        inventory_payload = build_inventory(records, checked_at, source_ref, args.max_size_bytes)
        catalog_payload = build_catalog(records, checked_at, source_ref, args.max_size_bytes)

        write_json_atomic(inventory_path, inventory_payload)
        write_json_atomic(catalog_path, catalog_payload)

        downloaded = sum(1 for record in records if record.get("status") == "downloaded")
        review = sum(
            1
            for record in records
            if record.get("status") in {"needs_license_review", "trademark_review"}
        )
        failed = sum(1 for record in records if record.get("status") == "download_failed")
        no_download_url = sum(1 for record in records if record.get("status") == "no_download_url")
        too_large = sum(1 for record in records if record.get("status") == "too_large")
        conversion_required = sum(
            1 for record in records if record.get("user_import_reason") == "needs_manual_conversion"
        )
        large_import_required = sum(
            1 for record in records if record.get("user_import_reason") == "needs_manual_large_import"
        )
        importable = sum(1 for record in records if record.get("user_import_status") == "available")

        logger.log("")
        logger.log("Summary")
        logger.log(f"  Downloaded: {downloaded}")
        logger.log(f"  Importable now: {importable}")
        logger.log(f"  Conversion required: {conversion_required}")
        logger.log(f"  Large import required: {large_import_required}")
        logger.log(f"  Needs review: {review}")
        logger.log(f"  Download failed: {failed}")
        logger.log(f"  No download URL: {no_download_url}")
        logger.log(f"  Too large: {too_large}")
        logger.log(f"  Catalog: {catalog_path}")
        logger.log(f"  Inventory: {inventory_path}")
        logger.log(f"  Log: {log_path}")
        return 0
    finally:
        release_lock(lock_dir)
        logger.close()


if __name__ == "__main__":
    sys.exit(main())
PY
