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
import shutil
import subprocess
import tempfile
import unicodedata
import zipfile


VERSION = 1
DEFAULT_VERIFIED_IMPORT_MAX_BYTES = 64 * 1024 * 1024
OLD_BINARY_MAGIC = bytes.fromhex("010b1a865063a15f")
ZIP_MAGIC_PREFIXES = (
    b"PK\x03\x04",
    b"PK\x05\x06",
    b"PK\x07\x08",
)
HTML_MARKERS = (
    b"<!doctype html",
    b"<html",
    b"<body",
    b"<head",
)
ROOT_OBJECT_ID = "00000000-0000-0000-0000-000000000000"
PAGE_HINTS_BY_TYPE = {
    "icon-set": (
        "icons",
        "main components",
        "components",
        "library",
    ),
    "design-system": (
        "components",
        "foundation",
        "foundations",
        "styles",
        "main components",
        "tokens",
    ),
    "ui-kit": (
        "components",
        "main components",
        "screens",
        "library",
    ),
    "template": (
        "pages",
        "screens",
        "desktop",
        "mobile",
        "main",
    ),
    "library": (
        "components",
        "library",
        "main components",
        "icons",
    ),
}


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_args() -> argparse.Namespace:
    repo_root = pathlib.Path(os.environ.get("NOFIDA_REPO_ROOT", ".")).resolve()
    default_store_root = pathlib.Path(
        os.environ.get(
            "LIBRARY_STORE_DIR",
            os.environ.get("NOFIDA_LIBRARY_STORE_ROOT", "/opt/nofida-core/library-store"),
        )
    )
    parser = argparse.ArgumentParser(
        prog="ingest-manual-penpot-files.sh",
        description="Ingest manually supplied Penpot files into the NOFIDA host-backed library store."
    )
    parser.add_argument("--store-root", default=str(default_store_root), help="Library store root directory.")
    parser.add_argument(
        "--inbox-root",
        default=None,
        help="Manual inbox root. Defaults to <store-root>/manual-inbox.",
    )
    parser.add_argument(
        "--verified-import-max-bytes",
        type=int,
        default=int(
            os.environ.get(
                "NOFIDA_LIBRARY_VERIFIED_IMPORT_MAX_BYTES",
                str(DEFAULT_VERIFIED_IMPORT_MAX_BYTES),
            )
        ),
        help="Largest modern .penpot archive treated as importable through the in-app add flow.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Plan updates without copying or moving files.")
    parser.add_argument(
        "--verify-imports",
        action="store_true",
        help="Run the live import verification script for newly accepted manual files.",
    )
    parser.add_argument(
        "--verify-script",
        default=str(repo_root / "scripts" / "verify-014m.mjs"),
        help="Path to the live import verification script.",
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


def load_json(path: pathlib.Path, default: dict) -> dict:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


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
        raise RuntimeError(f"another manual ingest is already running ({lock_dir})") from error


def release_lock(lock_dir: pathlib.Path) -> None:
    try:
        lock_dir.rmdir()
    except FileNotFoundError:
        return


def slugify(text: str | None) -> str:
    normalized = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode("ascii")
    normalized = normalized.lower()
    normalized = re.sub(r"[^a-z0-9]+", "-", normalized)
    normalized = re.sub(r"-{2,}", "-", normalized).strip("-")
    return normalized


def titleize_slug(value: str) -> str:
    parts = [part for part in value.replace("_", "-").split("-") if part]
    return " ".join(part.capitalize() for part in parts) or "Manual library"


def safe_relpath(path: pathlib.Path, root: pathlib.Path) -> str:
    return path.relative_to(root).as_posix()


def internal_url(file_rel: str | None) -> str | None:
    if not file_rel:
        return None
    return f"/nofida/libraries/{file_rel}"


def detect_file_format_from_head(head: bytes) -> str | None:
    if not head:
        return None
    if any(head.startswith(prefix) for prefix in ZIP_MAGIC_PREFIXES):
        return "modern_penpot_archive"
    if head.startswith(OLD_BINARY_MAGIC):
        return "old_binary_format_v1"
    return "unknown_binary"


def looks_like_html_head(head: bytes) -> bool:
    lowered = head.lower()
    return any(marker in lowered for marker in HTML_MARKERS)


def sha256_path(path: pathlib.Path) -> tuple[str, int]:
    sha = hashlib.sha256()
    size = 0
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            size += len(chunk)
            sha.update(chunk)
    return sha.hexdigest(), size


def infer_type(value: str) -> str:
    text = slugify(value)
    if "icon" in text:
        return "icon-set"
    if "wireframe" in text or "template" in text:
        return "template"
    if "design-system" in text or re.search(r"(^|-)system($|-)", text):
        return "design-system"
    if "ui-kit" in text or "kit" in text:
        return "ui-kit"
    return "library"


def record_aliases(record: dict) -> set[str]:
    aliases = set()
    for key in ("id", "title", "name", "verified_file_name"):
        value = record.get(key)
        if value:
            aliases.add(slugify(str(value)))
    file_rel = record.get("file")
    if file_rel:
        aliases.add(slugify(pathlib.Path(file_rel).stem))
    hub_url = record.get("hub_url")
    if hub_url:
        aliases.add(slugify(pathlib.PurePosixPath(hub_url).name))
    return {alias for alias in aliases if alias}


def build_match_index(records: list[dict]) -> dict[str, list[str]]:
    index: dict[str, list[str]] = {}
    for record in records:
        record_id = record.get("id")
        if not record_id:
            continue
        for alias in record_aliases(record):
            index.setdefault(alias, [])
            if record_id not in index[alias]:
                index[alias].append(record_id)
    return index


def find_match(
    index: dict[str, list[str]],
    by_id: dict[str, dict],
    file_slug: str,
    manifest_slug: str | None,
    title_slug: str | None,
) -> dict | None:
    for alias in (file_slug, manifest_slug, title_slug):
        if alias and alias in by_id:
            return by_id[alias]
    for alias in (file_slug, manifest_slug, title_slug):
        if not alias:
            continue
        matches = index.get(alias, [])
        if len(matches) == 1:
            return by_id[matches[0]]
    return None


def is_cover_like(name: str | None) -> bool:
    value = slugify(name)
    return value in {"cover", "welcome", "intro"} or value.startswith("cover-")


def collect_media_refs(node, refs: set[str]) -> None:
    if isinstance(node, dict):
        fill_image = node.get("fillImage")
        if isinstance(fill_image, dict):
            for key in ("id", "mediaId", "imageId"):
                if fill_image.get(key):
                    refs.add(str(fill_image[key]))
        for key in ("mediaId", "imageId"):
            value = node.get(key)
            if isinstance(value, str) and value:
                refs.add(value)
        for value in node.values():
            collect_media_refs(value, refs)
    elif isinstance(node, list):
        for value in node:
            collect_media_refs(value, refs)


def is_useful_page(page: dict) -> bool:
    if page.get("component_roots", 0) > 0:
        return True
    if page.get("component_refs", 0) > 0:
        return True
    if page.get("content_objects", 0) >= 6:
        return True
    useful_types = {"frame", "group", "text", "path", "rect", "circle", "bool", "svg-raw"}
    return sum(page.get("type_counts", {}).get(kind, 0) for kind in useful_types) >= 6


def score_page(file_type: str, page: dict, title_slug: str) -> tuple[int, int, int]:
    name_slug = slugify(page.get("name"))
    preferences = PAGE_HINTS_BY_TYPE.get(file_type) or PAGE_HINTS_BY_TYPE["library"]
    keyword_score = 0
    for idx, keyword in enumerate(preferences):
        if keyword in name_slug:
            keyword_score = max(keyword_score, 100 - idx)
    if "icon" in title_slug and "icon" in name_slug:
        keyword_score = max(keyword_score, 105)
    if not is_cover_like(page.get("name")):
        keyword_score += 5
    return (
        keyword_score,
        -page.get("missing_media", 0),
        page.get("content_objects", 0),
    )


def choose_default_page(file_type: str, title: str, pages: list[dict]) -> dict | None:
    useful_pages = [page for page in pages if is_useful_page(page)]
    if not useful_pages:
        return None

    title_slug = slugify(title)
    candidates = [page for page in useful_pages if page.get("missing_media", 0) == 0]
    if not candidates:
        candidates = useful_pages

    non_cover = [page for page in candidates if not is_cover_like(page.get("name"))]
    pool = non_cover or candidates
    return max(pool, key=lambda page: score_page(file_type, page, title_slug))


def analyze_modern_archive(path: pathlib.Path, file_type: str) -> dict:
    try:
        with zipfile.ZipFile(path) as archive:
            names = archive.namelist()
            if "manifest.json" not in names:
                return {
                    "archive_valid": False,
                    "quality_status": "empty_or_broken",
                    "quality_notes": "manifest.json is missing",
                }

            manifest = json.loads(archive.read("manifest.json"))
            files = manifest.get("files") or []
            if not files:
                return {
                    "archive_valid": False,
                    "quality_status": "empty_or_broken",
                    "quality_notes": "manifest.json has no exported files",
                }

            primary = files[0]
            file_id = primary.get("id")
            manifest_name = primary.get("name") or path.stem
            if not file_id:
                return {
                    "archive_valid": False,
                    "quality_status": "empty_or_broken",
                    "quality_notes": "manifest.json primary file is missing an id",
                }

            page_prefix = f"files/{file_id}/pages/"
            page_summary_names = [
                name
                for name in names
                if name.startswith(page_prefix) and name.endswith(".json") and name.count("/") == 3
            ]
            page_summaries = [json.loads(archive.read(name)) for name in page_summary_names]
            page_summaries.sort(key=lambda item: item.get("index", 0))

            media_meta_by_id: dict[str, dict] = {}
            media_prefix = f"files/{file_id}/media/"
            for name in names:
                if name.startswith(media_prefix) and name.endswith(".json"):
                    entry = json.loads(archive.read(name))
                    entry_id = entry.get("id")
                    if entry_id:
                        media_meta_by_id[entry_id] = entry

            object_blobs = {
                pathlib.PurePosixPath(name).stem
                for name in names
                if name.startswith("objects/") and not name.endswith("/")
            }

            pages: list[dict] = []
            component_ids: set[str] = set()
            broken_media_placeholders = 0
            useful_pages_count = 0

            for summary in page_summaries:
                page_id = summary.get("id")
                if not page_id:
                    continue
                object_prefix = f"files/{file_id}/pages/{page_id}/"
                object_names = [
                    name
                    for name in names
                    if name.startswith(object_prefix) and name.endswith(".json") and name.count("/") > 3
                ]
                type_counts: dict[str, int] = {}
                content_objects = 0
                media_refs: set[str] = set()
                component_roots = 0
                component_refs = 0

                for object_name in object_names:
                    shape = json.loads(archive.read(object_name))
                    shape_id = shape.get("id")
                    if shape_id == ROOT_OBJECT_ID:
                        continue
                    content_objects += 1
                    shape_type = shape.get("type") or "unknown"
                    type_counts[shape_type] = type_counts.get(shape_type, 0) + 1
                    if shape.get("componentRoot"):
                        component_roots += 1
                    component_id = shape.get("componentId")
                    if isinstance(component_id, str) and component_id:
                        component_ids.add(component_id)
                        component_refs += 1
                    collect_media_refs(shape, media_refs)

                missing_media = 0
                for ref in media_refs:
                    if ref in media_meta_by_id:
                        blob_id = media_meta_by_id[ref].get("mediaId") or ref
                        if blob_id not in object_blobs:
                            missing_media += 1
                    elif ref not in object_blobs:
                        missing_media += 1

                page = {
                    "id": page_id,
                    "name": summary.get("name") or page_id,
                    "index": summary.get("index", 0),
                    "content_objects": content_objects,
                    "type_counts": type_counts,
                    "component_roots": component_roots,
                    "component_refs": component_refs,
                    "missing_media": missing_media,
                }
                page["useful"] = is_useful_page(page)
                if page["useful"]:
                    useful_pages_count += 1
                broken_media_placeholders += missing_media
                pages.append(page)

            default_page = choose_default_page(file_type, manifest_name, pages)
            first_page = pages[0] if pages else None

            if not pages or useful_pages_count == 0:
                quality_status = "empty_or_broken"
            elif (
                first_page
                and is_cover_like(first_page.get("name"))
                and first_page.get("missing_media", 0) > 0
                and default_page
                and default_page.get("id") != first_page.get("id")
            ):
                quality_status = "cover_broken_content_ok"
            elif broken_media_placeholders > 0:
                quality_status = "media_missing_partial"
            else:
                quality_status = "good"

            note_bits = [
                f"pages={len(pages)}",
                f"useful={useful_pages_count}",
                f"components={len(component_ids)}",
                f"missing_media={broken_media_placeholders}",
            ]
            if default_page:
                note_bits.append(f"default={default_page['name']}")

            return {
                "archive_valid": True,
                "manifest_name": manifest_name,
                "manifest_slug": slugify(manifest_name),
                "pages_count": len(pages),
                "components_count": len(component_ids),
                "useful_pages_count": useful_pages_count,
                "broken_media_placeholders": broken_media_placeholders,
                "quality_status": quality_status,
                "quality_notes": ", ".join(note_bits),
                "open_default_page": default_page.get("name") if default_page else None,
                "open_default_page_id": default_page.get("id") if default_page else None,
            }
    except zipfile.BadZipFile:
        return {
            "archive_valid": False,
            "quality_status": "empty_or_broken",
            "quality_notes": "zip archive could not be opened",
        }
    except Exception as error:  # noqa: BLE001
        return {
            "archive_valid": False,
            "quality_status": "empty_or_broken",
            "quality_notes": f"archive inspection failed: {error}",
        }


def analyze_penpot_file(path: pathlib.Path, file_type: str, verified_import_max_bytes: int) -> dict:
    sha256, size_bytes = sha256_path(path)
    with path.open("rb") as handle:
        head = handle.read(4096)

    if looks_like_html_head(head):
        return {
            "status": "rejected",
            "file_format": "html_error_page",
            "sha256": sha256,
            "size_bytes": size_bytes,
            "quality_status": "empty_or_broken",
            "quality_notes": "file looked like HTML or an upstream error page",
        }

    file_format = detect_file_format_from_head(head[:8])
    if file_format == "modern_penpot_archive":
        archive = analyze_modern_archive(path, file_type)
        result = {
            "status": "available",
            "file_format": file_format,
            "sha256": sha256,
            "size_bytes": size_bytes,
            "quality_status": archive.get("quality_status"),
            "quality_notes": archive.get("quality_notes"),
            "open_default_page": archive.get("open_default_page"),
            "open_default_page_id": archive.get("open_default_page_id"),
            "pages_count": archive.get("pages_count"),
            "components_count": archive.get("components_count"),
            "useful_pages_count": archive.get("useful_pages_count"),
            "broken_media_placeholders": archive.get("broken_media_placeholders"),
            "manifest_name": archive.get("manifest_name"),
            "manifest_slug": archive.get("manifest_slug"),
        }
        if not archive.get("archive_valid"):
            result["status"] = "rejected"
        elif archive.get("quality_status") == "empty_or_broken":
            result["status"] = "rejected"
        elif size_bytes > verified_import_max_bytes:
            result["status"] = "needs_large_import"
        return result

    if file_format == "old_binary_format_v1":
        return {
            "status": "needs_conversion",
            "file_format": file_format,
            "sha256": sha256,
            "size_bytes": size_bytes,
            "quality_status": None,
            "quality_notes": "legacy binary Penpot format",
        }

    return {
        "status": "rejected",
        "file_format": file_format or "unknown_binary",
        "sha256": sha256,
        "size_bytes": size_bytes,
        "quality_status": "empty_or_broken",
        "quality_notes": "unknown or unsupported file format",
    }


def create_manual_record(item_id: str, title: str, file_type: str, now: str, source_name: str) -> dict:
    return {
        "id": item_id,
        "title": title,
        "name": title,
        "author": "Manual upload",
        "type": file_type,
        "tier": "manual_upload",
        "hub_url": None,
        "source_url": f"manual_upload:{source_name}",
        "download_url": None,
        "license": "manual_upload",
        "license_status": "needs_review",
        "file": None,
        "internal_url": None,
        "sha256": None,
        "size_bytes": None,
        "known_size_bytes": None,
        "status": "manual_pending",
        "status_reason": "manual_upload_pending_analysis",
        "last_error": None,
        "last_download_attempt_at": None,
        "last_checked_at": now,
        "vendored_at": None,
        "quarantine_file": None,
        "file_format": None,
        "format_detected_at": None,
        "recovery_status": "manual_upload",
        "recovered_at": now,
        "public_hub_checked_at": None,
        "manual_upload": True,
        "operator_supplied": True,
        "manual_source": "manual_upload",
        "manual_source_name": source_name,
        "manual_uploaded_at": now,
        "manual_rejected_source": None,
        "quality_status": None,
        "quality_notes": None,
        "open_default_page": None,
        "open_default_page_id": None,
        "pages_count": None,
        "components_count": None,
        "useful_pages_count": None,
        "broken_media_placeholders": None,
        "verified_importable": None,
        "import_verification_status": None,
        "import_verification_checked_at": None,
        "verified_file_name": None,
        "user_import_status": "unavailable",
        "user_import_reason": None,
        "risk_notes": "Manually uploaded Penpot file.",
        "source_present": False,
    }


def record_is_available(record: dict) -> bool:
    state = record.get("user_import_status")
    if state is not None:
        return state == "available"
    return bool(record.get("file")) and record.get("status") == "downloaded"


def build_catalog_status(record: dict) -> str:
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
    if record.get("status") == "downloaded" and record.get("file"):
        if record.get("license_status") in {"trademark_review", "needs_license_review", "needs_review"}:
            return "review_required"
        if record.get("file_format") == "old_binary_format_v1":
            return "conversion_required"
        return "available"
    return record.get("status") or "download_failed"


def build_catalog(records: list[dict], checked_at: str, source_ref: str, verified_import_max_bytes: int) -> dict:
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
                "status": build_catalog_status(record),
                "import_skip_reason": record.get("user_import_reason"),
                "file_format": record.get("file_format"),
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
                "last_checked_at": record.get("last_checked_at"),
                "vendored_at": record.get("vendored_at"),
            }
        )

    return {
        "version": VERSION,
        "generated_at": checked_at,
        "source_inventory": source_ref,
        "max_auto_download_bytes": verified_import_max_bytes,
        "libraries": libraries,
    }


def build_inventory(records: list[dict], checked_at: str, source_ref: str, verified_import_max_bytes: int) -> dict:
    return {
        "version": VERSION,
        "generated_at": checked_at,
        "source_inventory": source_ref,
        "max_auto_download_bytes": verified_import_max_bytes,
        "items_count": len(records),
        "items": records,
    }


def move_with_stamp(source: pathlib.Path, dest_dir: pathlib.Path, checked_at: str, dry_run: bool) -> pathlib.Path:
    stamp = checked_at.replace(":", "").replace("-", "")
    dest = dest_dir / f"{source.stem}--{stamp}{source.suffix.lower()}"
    counter = 2
    while dest.exists():
        dest = dest_dir / f"{source.stem}--{stamp}-{counter}{source.suffix.lower()}"
        counter += 1
    if not dry_run:
        dest_dir.mkdir(parents=True, exist_ok=True)
        shutil.move(str(source), str(dest))
    return dest


def extract_penpot_entries(source: pathlib.Path, temp_dir: pathlib.Path) -> list[tuple[str, pathlib.Path]]:
    entries: list[tuple[str, pathlib.Path]] = []
    with zipfile.ZipFile(source) as archive:
        for info in archive.infolist():
            if info.is_dir():
                continue
            if pathlib.PurePosixPath(info.filename).suffix.lower() != ".penpot":
                continue
            entry_name = pathlib.PurePosixPath(info.filename).name
            unique_name = entry_name
            index = 2
            while (temp_dir / unique_name).exists():
                unique_name = f"{pathlib.Path(entry_name).stem}-{index}.penpot"
                index += 1
            dest = temp_dir / unique_name
            with archive.open(info, "r") as source_handle, dest.open("wb") as dest_handle:
                shutil.copyfileobj(source_handle, dest_handle)
            entries.append((info.filename, dest))
    return entries


def apply_analysis_to_record(
    record: dict,
    analysis: dict,
    source_name: str,
    store_root: pathlib.Path,
    files_dir: pathlib.Path,
    checked_at: str,
    dry_run: bool,
) -> None:
    was_manual_upload = bool(record.get("manual_upload"))
    record["manual_upload"] = True
    record["operator_supplied"] = True
    record["manual_source"] = "manual_upload"
    record["manual_source_name"] = source_name
    record["manual_uploaded_at"] = record.get("manual_uploaded_at") or checked_at
    record["recovery_status"] = "manual_upload"
    record["recovered_at"] = checked_at
    record["last_checked_at"] = checked_at
    record["last_download_attempt_at"] = checked_at
    if not was_manual_upload:
        record["license_status"] = "needs_review"
    elif record.get("license_status") != "approved":
        record["license_status"] = "needs_review"
    record["file_format"] = analysis.get("file_format")
    record["format_detected_at"] = checked_at
    record["verified_file_name"] = analysis.get("manifest_name") or analysis.get("manifest_slug")
    record["quality_status"] = analysis.get("quality_status")
    record["quality_notes"] = analysis.get("quality_notes")
    record["open_default_page"] = analysis.get("open_default_page")
    record["open_default_page_id"] = analysis.get("open_default_page_id")
    record["pages_count"] = analysis.get("pages_count")
    record["components_count"] = analysis.get("components_count")
    record["useful_pages_count"] = analysis.get("useful_pages_count")
    record["broken_media_placeholders"] = analysis.get("broken_media_placeholders")
    record["manual_rejected_source"] = None
    record["verified_importable"] = None
    record["import_verification_status"] = None
    record["import_verification_checked_at"] = None
    record["source_present"] = False
    record["sha256"] = analysis.get("sha256")
    record["size_bytes"] = analysis.get("size_bytes")

    status = analysis["status"]
    if status in {"available", "needs_large_import"}:
        dest = files_dir / f"{record['id']}.penpot"
        if not dry_run:
            files_dir.mkdir(parents=True, exist_ok=True)
            shutil.copy2(analysis["path"], dest)
        record["file"] = safe_relpath(dest, store_root)
        record["internal_url"] = internal_url(record["file"])
        record["vendored_at"] = checked_at
        record["quarantine_file"] = None
        record["last_error"] = None
        record["status"] = "downloaded"
        record["status_reason"] = (
            "manual_upload_available" if status == "available" else "manual_upload_large_import_required"
        )
        if record.get("license_status") == "approved":
            record["user_import_status"] = "available" if status == "available" else "large_import_required"
            record["user_import_reason"] = None if status == "available" else "needs_manual_large_import"
        else:
            record["user_import_status"] = "review_required"
            record["user_import_reason"] = "needs_license_review"
    elif status == "needs_conversion":
        record["file"] = None
        record["internal_url"] = None
        record["vendored_at"] = None
        record["status"] = "rejected"
        record["status_reason"] = "manual_upload_old_binary_format"
        record["last_error"] = "Legacy binary Penpot format requires conversion."
        record["user_import_status"] = "conversion_required"
        record["user_import_reason"] = "needs_manual_conversion"
    else:
        record["file"] = None
        record["internal_url"] = None
        record["vendored_at"] = None
        record["status"] = "rejected"
        record["status_reason"] = "manual_upload_invalid_file"
        record["last_error"] = analysis.get("quality_notes") or "Manual file was invalid or empty."
        record["user_import_status"] = "rejected"
        record["user_import_reason"] = "invalid_manual_file"


def verify_new_imports(
    store_root: pathlib.Path,
    verify_script: pathlib.Path,
    verified_ids: list[str],
    logger: Logger,
    dry_run: bool,
) -> int:
    if not verified_ids:
        return 0
    if dry_run:
        logger.log(f"VERIFY PLAN  {', '.join(verified_ids)}")
        return 0
    if not verify_script.exists():
        logger.log(f"VERIFY FAIL  missing script: {verify_script}")
        return 1
    if shutil.which("node") is None:
        logger.log("VERIFY FAIL  node is not installed")
        return 1

    command = ["node", str(verify_script), "--store-root", str(store_root)]
    for item_id in verified_ids:
        command.extend(["--id", item_id])
    logger.log(f"VERIFY RUN   {' '.join(command)}")
    result = subprocess.run(command, check=False)
    return result.returncode


def main() -> int:
    args = parse_args()
    store_root = pathlib.Path(args.store_root).expanduser().resolve()
    inbox_root = pathlib.Path(args.inbox_root).expanduser().resolve() if args.inbox_root else store_root / "manual-inbox"
    inventory_path = store_root / "inventory.json"
    catalog_path = store_root / "catalog.json"
    files_dir = store_root / "files"
    processed_dir = inbox_root / "processed"
    rejected_dir = inbox_root / "rejected"
    logs_dir = inbox_root / "logs"
    lock_dir = inbox_root / ".manual-ingest.lock"

    for directory in (store_root, files_dir, inbox_root, processed_dir, rejected_dir, logs_dir):
        directory.mkdir(parents=True, exist_ok=True)

    checked_at = utc_now()
    log_path = logs_dir / f"manual-ingest-{checked_at.replace(':', '').replace('-', '')}.log"
    logger = Logger(log_path)

    try:
        acquire_lock(lock_dir)
    except Exception as error:  # noqa: BLE001
        logger.log(f"LOCK FAIL  {error}")
        logger.close()
        return 1

    verify_exit = 0
    try:
        source_ref = "manual_inbox"
        inventory_payload = load_json(inventory_path, {"version": VERSION, "items": []})
        records = inventory_payload.get("items", [])
        by_id = {record["id"]: record for record in records if record.get("id")}
        match_index = build_match_index(records)
        existing_available = sum(1 for record in records if record_is_available(record))

        source_files = sorted(
            path
            for path in inbox_root.iterdir()
            if path.is_file() and path.suffix.lower() in {".penpot", ".zip"}
        )

        summary = {
            "files_found": len(source_files),
            "files_processed": 0,
            "modern_files_accepted": 0,
            "old_binary_files": 0,
            "too_large_files": 0,
            "invalid_files": 0,
            "unmatched_manual_files": 0,
        }
        verify_ids: list[str] = []
        priority_ids = {
            "tailwind-kit",
            "styleui",
            "material-design-3",
            "prototype-examples",
            "labyrinth-ui-free-kit",
        }
        priority_results: dict[str, dict] = {}

        logger.log(f"Manual ingest started at {checked_at}")
        logger.log(f"Store root: {store_root}")
        logger.log(f"Inbox root: {inbox_root}")
        logger.log(f"Dry run: {'yes' if args.dry_run else 'no'}")
        logger.log(f"Verify imports: {'yes' if args.verify_imports else 'no'}")
        logger.log(f"Verified browser-import size: {args.verified_import_max_bytes} bytes")
        logger.log(f"Source files found: {len(source_files)}")

        for source in source_files:
            logger.log("")
            logger.log(f"SOURCE     {source.name}")

            extracted_entries: list[tuple[str, pathlib.Path]] = []
            source_bucket = "processed"
            with tempfile.TemporaryDirectory(prefix="nofida-manual-ingest-") as temp_dir_name:
                temp_dir = pathlib.Path(temp_dir_name)
                if source.suffix.lower() == ".zip":
                    try:
                        extracted_entries = extract_penpot_entries(source, temp_dir)
                    except zipfile.BadZipFile:
                        extracted_entries = []
                        source_bucket = "rejected"
                        logger.log(f"REJECTED   {source.name} (invalid zip archive)")
                    if not extracted_entries and source_bucket != "rejected":
                        source_bucket = "rejected"
                        logger.log(f"REJECTED   {source.name} (zip did not contain .penpot files)")
                else:
                    extracted_entries = [(source.name, source)]

                accepted_from_source = False
                for origin_name, candidate_path in extracted_entries:
                    file_slug = slugify(candidate_path.stem)
                    provisional_type = infer_type(candidate_path.stem)
                    analysis = analyze_penpot_file(candidate_path, provisional_type, args.verified_import_max_bytes)
                    manifest_slug = analysis.get("manifest_slug")
                    manifest_name = analysis.get("manifest_name")
                    title_slug = slugify(manifest_name) if manifest_name else None
                    matched = find_match(match_index, by_id, file_slug, manifest_slug, title_slug)

                    record = matched
                    created_new = False
                    display_name = f"{source.name}::{origin_name}" if source.suffix.lower() == ".zip" else source.name
                    title = manifest_name or titleize_slug(file_slug)
                    inferred_type = matched.get("type") if matched else infer_type(manifest_name or candidate_path.stem)

                    if record is None:
                        record_id = file_slug or manifest_slug or slugify(title)
                        if record_id in by_id:
                            suffix = 2
                            base_id = record_id
                            while f"{base_id}-manual-{suffix}" in by_id:
                                suffix += 1
                            record_id = f"{base_id}-manual-{suffix}"
                        record = create_manual_record(record_id, title, inferred_type, checked_at, display_name)
                        records.append(record)
                        by_id[record_id] = record
                        for alias in record_aliases(record):
                            match_index.setdefault(alias, [])
                            if record_id not in match_index[alias]:
                                match_index[alias].append(record_id)
                        created_new = True
                        summary["unmatched_manual_files"] += 1

                    preserve_existing = analysis["status"] in {"needs_conversion", "rejected"} and record_is_available(record)
                    if preserve_existing:
                        logger.log(
                            f"PRESERVE   {record['id']} (existing available file kept; manual source {analysis['status']})"
                        )
                    else:
                        apply_analysis_to_record(
                            record=record,
                            analysis={**analysis, "path": candidate_path},
                            source_name=display_name,
                            store_root=store_root,
                            files_dir=files_dir,
                            checked_at=checked_at,
                            dry_run=args.dry_run,
                        )

                    summary["files_processed"] += 1
                    if analysis["status"] == "available":
                        summary["modern_files_accepted"] += 1
                        accepted_from_source = True
                        if not preserve_existing:
                            verify_ids.append(record["id"])
                        logger.log(f"ACCEPTED   {record['id']} <- {origin_name}")
                    elif analysis["status"] == "needs_large_import":
                        summary["too_large_files"] += 1
                        accepted_from_source = True
                        logger.log(f"LARGE      {record['id']} <- {origin_name}")
                    elif analysis["status"] == "needs_conversion":
                        summary["old_binary_files"] += 1
                        source_bucket = "rejected"
                        logger.log(f"CONVERT    {record['id']} <- {origin_name}")
                    else:
                        summary["invalid_files"] += 1
                        source_bucket = "rejected"
                        logger.log(f"INVALID    {record['id']} <- {origin_name}")

                    if record["id"] in priority_ids:
                        priority_results[record["id"]] = {
                            "status": build_catalog_status(record),
                            "file_format": record.get("file_format"),
                            "quality_status": record.get("quality_status"),
                            "manual_upload": record.get("manual_upload"),
                        }

                    if created_new:
                        logger.log(f"NEW ITEM   {record['id']} ({record['title']})")

                if source_bucket == "processed" and not accepted_from_source and source.suffix.lower() == ".zip":
                    source_bucket = "rejected"

            target_dir = processed_dir if source_bucket == "processed" else rejected_dir
            moved_to = move_with_stamp(source, target_dir, checked_at, args.dry_run)
            logger.log(f"MOVED      {source.name} -> {moved_to}")

        records.sort(key=lambda item: (str(item.get("title") or item.get("name") or item.get("id") or "").lower(), item.get("id") or ""))
        inventory_out = build_inventory(records, checked_at, source_ref, args.verified_import_max_bytes)
        catalog_out = build_catalog(records, checked_at, source_ref, args.verified_import_max_bytes)

        if not args.dry_run:
            write_json_atomic(inventory_path, inventory_out)
            write_json_atomic(catalog_path, catalog_out)

        if args.verify_imports:
            verify_exit = verify_new_imports(
                store_root=store_root,
                verify_script=pathlib.Path(args.verify_script).expanduser().resolve(),
                verified_ids=sorted(set(verify_ids)),
                logger=logger,
                dry_run=args.dry_run,
            )

        final_available = sum(1 for record in records if build_catalog_status(record) == "available")

        logger.log("")
        logger.log("Summary")
        logger.log(f"  Files found: {summary['files_found']}")
        logger.log(f"  Files processed: {summary['files_processed']}")
        logger.log(f"  Modern files accepted: {summary['modern_files_accepted']}")
        logger.log(f"  Old binary queued for conversion: {summary['old_binary_files']}")
        logger.log(f"  Too large files: {summary['too_large_files']}")
        logger.log(f"  Invalid files: {summary['invalid_files']}")
        logger.log(f"  Unmatched manual files: {summary['unmatched_manual_files']}")
        logger.log(f"  Available before ingest: {existing_available}")
        logger.log(f"  Available after ingest: {final_available}")
        logger.log(f"  Catalog: {catalog_path}")
        logger.log(f"  Inventory: {inventory_path}")
        logger.log(f"  Log: {log_path}")
        for priority_id in sorted(priority_ids):
            entry = priority_results.get(priority_id)
            if not entry:
                logger.log(f"  Priority {priority_id}: not present in this manual batch")
                continue
            logger.log(
                f"  Priority {priority_id}: status={entry['status']} format={entry['file_format']} quality={entry['quality_status']}"
            )

        return verify_exit
    finally:
        release_lock(lock_dir)
        logger.close()


raise SystemExit(main())
PY
