import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INCLUDE = [
    "manifest.json",
    "README.md",
    "icons/icon16.png",
    "icons/icon32.png",
    "icons/icon48.png",
    "icons/icon128.png",
    "src/background.js",
    "src/content.css",
    "src/content.js",
    "src/popup/popup.css",
    "src/popup/popup.html",
    "src/popup/popup.js",
]


def main():
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    version = manifest["version"]
    dist = ROOT / "dist"
    dist.mkdir(exist_ok=True)
    zip_path = dist / f"llm-page-translator-{version}.zip"
    if zip_path.exists():
        zip_path.unlink()

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for relative in INCLUDE:
            source = ROOT / relative
            if not source.exists():
                raise FileNotFoundError(relative)
            archive.write(source, relative.replace("\\", "/"))

    names = zipfile.ZipFile(zip_path).namelist()
    if "manifest.json" not in names:
        raise RuntimeError("ZIP root is missing manifest.json")
    print(f"Packed {zip_path}")
    for name in sorted(names):
        print(f"  {name}")


if __name__ == "__main__":
    main()
