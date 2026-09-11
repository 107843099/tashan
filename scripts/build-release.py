#!/usr/bin/env python3
"""Build a portable static release from the curated local library.

Only dist/ and releases/tashan-site.zip are generated. Source projects and
browser data are never modified. Run build-catalog.py before this script.
"""
from __future__ import annotations

import copy
import hashlib
import json
import re
import shutil
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
GENERATOR = "scripts/build-release.py"
DIST = ROOT / "dist"
ARCHIVE = ROOT / "releases/tashan-site.zip"
PAGES = ("index.html", "project-preview.html", "teacher-practice-demo-v3.html", "local-project-preview.html")
RUNTIME_SUFFIXES = {".html", ".js", ".mjs", ".css", ".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif", ".woff", ".woff2", ".json", ".txt"}
FORBIDDEN = {".git", ".DS_Store", "__MACOSX", "node_modules", ".env", "backups", "archive", "archives", ".codex", ".agents"}


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def within(path: Path, parent: Path) -> bool:
    return path == parent or parent in path.parents


def source_file(value: str | Path) -> Path:
    """Resolve only existing workspace files; never follow an escaping symlink."""
    candidate = ROOT / value
    resolved = candidate.resolve(strict=True)
    if not within(resolved, ROOT) or not resolved.is_file():
        raise ValueError(f"Source is not a workspace file: {value}")
    if any(part in FORBIDDEN or part.startswith(".env.") for part in candidate.relative_to(ROOT).parts):
        raise ValueError(f"Private/development source cannot be published: {value}")
    return resolved


def from_href(value: str) -> Path:
    parts = urlsplit(value)
    if parts.scheme or parts.netloc or parts.path.startswith("/"):
        raise ValueError(f"Expected a relative local URL: {value}")
    return source_file(unquote(parts.path))


def managed_outputs_only() -> None:
    """Refuse to remove an unrelated dist directory or replace an unknown ZIP."""
    if DIST.is_symlink() or ARCHIVE.is_symlink() or ARCHIVE.parent.is_symlink():
        raise ValueError("Release destinations must not be symbolic links")
    if DIST.exists():
        marker = DIST / "release-manifest.json"
        if not marker.is_file():
            raise ValueError("dist/ exists without this builder's manifest; move it before building")
        manifest = json.loads(marker.read_text())
        if manifest.get("generatedBy") != GENERATOR:
            raise ValueError("dist/ belongs to another builder; move it before building")
        paths = list(DIST.rglob("*"))
        if any(path.is_symlink() for path in paths):
            raise ValueError("dist/ contains a symbolic link; refusing to remove it")
        actual = {path.relative_to(DIST).as_posix() for path in paths if path.is_file()}
        expected = {record["path"] for record in manifest["files"]} | {"release-manifest.json"}
        if actual != expected:
            raise ValueError("dist/ contains added or missing files; preserve your changes before rebuilding")
        for record in manifest["files"]:
            if sha((DIST / record["path"]).read_bytes()) != record["sha256"]:
                raise ValueError("dist/ was edited after generation; preserve your changes before rebuilding")
    if ARCHIVE.exists():
        with zipfile.ZipFile(ARCHIVE) as archive:
            marker = json.loads(archive.read("release-manifest.json"))
            if marker.get("generatedBy") != GENERATOR:
                raise ValueError("Refusing to overwrite an archive from another source")
            expected = {record["path"] for record in marker["files"]} | {"release-manifest.json"}
            if set(archive.namelist()) != expected:
                raise ValueError("Release ZIP contains added or missing files; refusing to replace it")
            for record in marker["files"]:
                if sha(archive.read(record["path"])) != record["sha256"]:
                    raise ValueError("Release ZIP was edited; preserve your changes before rebuilding")


def build() -> None:
    managed_outputs_only()
    original = json.loads(source_file("data/generated/catalog.json").read_text())
    catalog = copy.deepcopy(original)
    ids = [project["id"] for project in catalog["projects"]]
    if len(ids) != len(set(ids)) or not all(re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", identifier) for identifier in ids):
        raise ValueError("Project IDs must be unique lowercase ASCII slugs")

    staging = Path(tempfile.mkdtemp(prefix=".tashan-release-", dir=ROOT))
    copied = []
    archive_by_hash = {}
    archive_references = []
    image_references = []
    routes = {}

    def output(relative: str | Path) -> Path:
        relative = Path(relative)
        if relative.is_absolute() or ".." in relative.parts or not str(relative).isascii():
            raise ValueError(f"Invalid release path: {relative}")
        result = staging / relative
        result.parent.mkdir(parents=True, exist_ok=True)
        return result

    def put(source: Path, relative: str | Path) -> str:
        source = source_file(source)
        data = source.read_bytes()
        target = output(relative)
        if target.exists() and target.read_bytes() != data:
            raise ValueError(f"Different files map to the same release path: {relative}")
        target.write_bytes(data)
        record = {"source": source.relative_to(ROOT).as_posix(), "path": target.relative_to(staging).as_posix(), "bytes": len(data), "sha256": sha(data)}
        if record not in copied:
            copied.append(record)
        return "./" + target.relative_to(staging).as_posix()

    def copy_runtime_tree(source: Path, destination: str, *, include_readme=False) -> None:
        resolved = source.resolve(strict=True)
        if not within(resolved, ROOT) or not resolved.is_dir():
            raise ValueError(f"Invalid runtime folder: {source}")
        for path in sorted(source.rglob("*")):
            # Check symlinks even if their extension would otherwise be excluded.
            if path.is_symlink() and not within(path.resolve(), ROOT):
                raise ValueError(f"Runtime symlink leaves the workspace: {path}")
            if not path.is_file() or any(part in FORBIDDEN or part.startswith(".") for part in path.relative_to(source).parts):
                continue
            relative = path.relative_to(source)
            if path.name == "使用说明.txt" and include_readme:
                relative = Path("README.txt")
            if path.suffix.lower() in RUNTIME_SUFFIXES or "LICENSE" in path.name.upper():
                put(path, Path(destination) / relative)

    def package(source: Path, label: str) -> str:
        source = source_file(source)
        content = source.read_bytes()
        digest = sha(content)
        if digest not in archive_by_hash:
            archive_by_hash[digest] = put(source, f"downloads/{label}-source.zip")
        else:
            # Record provenance for both projects even when the ZIP is shared.
            put(source, archive_by_hash[digest][2:])
        archive_references.append({"source": source.relative_to(ROOT).as_posix(), "href": archive_by_hash[digest], "sha256": digest, "bytes": len(content)})
        return archive_by_hash[digest]

    try:
        for page in PAGES:
            put(source_file(page), page)
        for folder in ("js", "css", "data", "vendor", "brand"):
            copy_runtime_tree(ROOT / "assets" / folder, "assets/" + folder)
        if (ROOT / "assets/icons/LICENSE").exists():
            put(source_file("assets/icons/LICENSE"), "assets/icons/LICENSE")

        for project in catalog["projects"]:
            identifier = project["id"]
            source = source_file(project["source"])
            entry = None
            if project["kind"] == "visual":
                if identifier in ("lens", "pinhole"):
                    copy_runtime_tree(source.parent, "projects/optics", include_readme=True)
                    entry = "./projects/optics/" + source.name
                else:
                    entry = put(source, f"projects/{identifier}/index.html")
                    if identifier == "mendel":
                        copy_runtime_tree(source.parent / "src", "projects/mendel/src")
                    elif project.get("hasCompanionFiles"):
                        raise ValueError(f"Add an explicit companion-file mapping for {identifier}")

            document = project.get("document")
            if document:
                document["download"] = put(from_href(document["download"]), f"projects/{identifier}/prompt.md")
                if project["kind"] == "prompt":
                    entry = document["download"]
            if not entry:
                raise ValueError(f"No publishable project entry: {identifier}")
            project["sourceHref"] = entry

            package_source = project.get("package")
            if package_source or source.suffix.lower() == ".zip":
                label = "optics" if identifier in ("lens", "pinhole") else identifier
                project["packageHref"] = package(source_file(package_source) if package_source else source, label)

            if project.get("cover"):
                cover_source = from_href(project["cover"])
                project["cover"] = put(cover_source, "assets/covers/" + cover_source.name)
            for variant in project.get("coverVariants", []):
                variant_source = from_href(variant["src"])
                content = variant_source.read_bytes()
                if sha(content) != variant["sha256"] or len(content) != variant["bytes"]:
                    raise ValueError(f"Cover variant changed for {identifier}; run the catalog checks")
                variant["src"] = put(variant_source, "assets/covers/" + variant_source.name)
            example = project.get("example")
            if example:
                image_source = from_href(example["imageHref"])
                original_image = image_source.read_bytes()
                if sha(original_image) != example["sha256"] or len(original_image) != example["bytes"]:
                    raise ValueError(f"Original example image changed for {identifier}")
                example["cover"] = project["cover"]
                # Keep one original PNG for full-size viewing and downloading.
                # Smaller display variants have separate hashes and never replace provenance.
                example["imageHref"] = put(image_source, "assets/covers/" + identifier + "-example.png")
                image_references.append({"source": image_source.relative_to(ROOT).as_posix(), "href": example["imageHref"], "bytes": len(original_image), "sha256": sha(original_image)})

            routes[identifier] = {"source": project["source"], "entry": entry, "prompt": document["download"] if document else None, "package": project.get("packageHref"), "cover": project.get("cover"), "image": example["imageHref"] if example else None}

        catalog["generatedFrom"] = "local-files-release"
        catalog["release"] = {"portablePaths": True, "sourcePaths": "Provenance only; sourceHref, packageHref and document.download point to the published files."}
        payload = json.dumps(catalog, ensure_ascii=False).replace("</", "<\\/")
        output("assets/data/catalog.js").write_text("// Generated by scripts/build-release.py; do not edit.\nwindow.PRACTICE_LIBRARY = " + payload + ";\n")

        # Hash the actual release assets, including the rewritten catalog.
        for page in PAGES:
            path = staging / page
            html = path.read_text()
            def version(match):
                relative = match.group(1)
                content = (staging / relative).read_bytes()
                return "./" + relative + "?v=" + sha(content)[:10]
            html = re.sub(r'\./(assets/[^"?\s]+\.(?:js|css))(?:\?v=[^"\s]+)?', version, html)
            path.write_text(html)

        # Record external URLs without mistaking documentation links for network
        # dependencies. Imported HTML remains byte-for-byte identical to source.
        external = {}
        runtime_external = {}
        text_suffixes = {".html", ".css", ".js", ".mjs", ".md", ".txt", ".json"}
        for path in sorted(staging.rglob("*")):
            if not path.is_file() or path.suffix not in text_suffixes:
                continue
            text = path.read_text(errors="replace")
            name = path.relative_to(staging).as_posix()
            for url in re.findall(r'https?://[^\s"\'<>`\\)]+', text):
                external.setdefault(url.rstrip(".,;]"), set()).add(name)
            if path.suffix in {".html", ".css", ".js", ".mjs"}:
                pattern = r'(?:\b(?:src|href)\s*=\s*["\']|url\(\s*["\']?|(?:import|fetch)\s*\(\s*["\'])(https?://[^\s"\'<>`\\)]+)'
                for url in re.findall(pattern, text):
                    # Catalog prose embeds documentation, not runtime requests.
                    if name != "assets/data/catalog.js":
                        runtime_external.setdefault(url, set()).add(name)

        unique_archives_bytes = sum(next(item["bytes"] for item in archive_references if item["sha256"] == digest) for digest in archive_by_hash)
        manifest = {
            "formatVersion": 1,
            "generatedBy": GENERATOR,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "entrypoint": "index.html",
            "deployment": "Upload the contents of dist/ or unzip tashan-site.zip into the hosting directory. Relative URLs support a subdirectory. Serve over HTTP(S).",
            "localData": "Browser drafts/uploads/bookmarks are not packaged. They remain in IndexedDB/localStorage for their existing origin; use workspace backup export/import when changing origin.",
            "projectCount": len(ids),
            "projects": routes,
            "sourceFiles": copied,
            "originalArchives": archive_references,
            "exampleImages": image_references,
            "deduplication": {
                "sourceDuplicatesExcluded": sum(len(project.get("duplicates", [])) for project in original["projects"]),
                "archiveReferences": len(archive_references),
                "archivesWritten": len(archive_by_hash),
                "archiveCopiesAvoided": len(archive_references) - len(archive_by_hash),
                "archiveBytesAvoided": sum(item["bytes"] for item in archive_references) - unique_archives_bytes,
                "exampleCopiesAvoided": len(image_references),
                "exampleBytesAvoided": sum(item["bytes"] for item in image_references),
                "opticsRuntime": "lens and pinhole share projects/optics/ and one original download archive"
            },
            "network": {
                "offlineGuaranteed": False,
                "note": "Some original projects reference external services, including web fonts. These URLs were recorded, not downloaded or verified; reference-only links and vendor notices may also appear in knownUrls.",
                "runtimeUrls": [{"url": url, "files": sorted(names)} for url, names in sorted(runtime_external.items())],
                "knownUrls": [{"url": url, "files": sorted(names)} for url, names in sorted(external.items())]
            },
            "files": [{"path": path.relative_to(staging).as_posix(), "bytes": path.stat().st_size, "sha256": sha(path.read_bytes())} for path in sorted(staging.rglob("*")) if path.is_file()]
        }
        output("release-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")

        # All input validation/copying finishes before a prior release is replaced.
        ARCHIVE.parent.mkdir(parents=True, exist_ok=True)
        temporary_archive = staging / ".tashan-site.zip"
        with zipfile.ZipFile(temporary_archive, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for path in sorted(staging.rglob("*")):
                if path.is_file() and path != temporary_archive:
                    archive.write(path, path.relative_to(staging).as_posix())
        if DIST.exists():
            shutil.rmtree(DIST)
        temporary_archive.replace(ARCHIVE)
        staging.replace(DIST)
        print(f"Release: {len(ids)} projects, {len(manifest['files']) + 1} files, {ARCHIVE.stat().st_size / 1048576:.1f} MiB ZIP")
        print("Upload: dist/ contents or releases/tashan-site.zip (index.html at ZIP root)")
        print(f"Deduplicated: {manifest['deduplication']['archiveCopiesAvoided']} archive copy and {len(image_references)} example-image copies")
    finally:
        if staging.exists():
            shutil.rmtree(staging)


if __name__ == "__main__":
    build()
