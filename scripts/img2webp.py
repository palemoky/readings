#!/usr/bin/env python3
"""
Convert PNG/JPG/GIF images to WebP and update Markdown references

Usage:
  python3 scripts/img2webp.py           # Convert staged files (pre-commit hook)
  python3 scripts/img2webp.py --all     # Convert all images in docs/
"""
import argparse
import subprocess
import sys
from pathlib import Path
import re

def check_cwebp():
    """Check if cwebp is installed"""
    try:
        subprocess.run(['cwebp', '-version'], capture_output=True, check=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False

def check_alpha_channel(image_path):
    """Check if image has alpha channel (transparency)"""
    try:
        from PIL import Image
        with Image.open(image_path) as img:
            # Check if image has alpha channel
            return img.mode in ('RGBA', 'LA', 'PA') or \
                   (img.mode == 'P' and 'transparency' in img.info)
    except ImportError:
        # Fallback: assume PNG files might have transparency
        return image_path.suffix.lower() == '.png'
    except Exception:
        return False

def convert_to_webp(image_path):
    """Convert image to WebP format with smart compression"""
    webp_path = image_path.with_suffix('.webp')

    # Skip if WebP already exists and is newer
    if webp_path.exists() and webp_path.stat().st_mtime > image_path.stat().st_mtime:
        print(f"  ⏭️  Skipped: {image_path.name} (WebP already exists)")
        return webp_path

    try:
        # Use gif2webp for GIF files (supports animation)
        if image_path.suffix.lower() == '.gif':
            subprocess.run([
                'gif2webp',
                '-q', '85',  # Quality 85
                str(image_path),
                '-o', str(webp_path)
            ], check=True, capture_output=True)
            print(f"  ✓ Converted (GIF): {image_path.name} -> {webp_path.name}")
        else:
            # Check for transparency
            has_alpha = check_alpha_channel(image_path)

            if has_alpha:
                # Transparent images: use lossless compression
                subprocess.run([
                    'cwebp',
                    '-lossless',  # Lossless preserves transparency perfectly
                    str(image_path),
                    '-o', str(webp_path)
                ], check=True, capture_output=True)
                print(f"  ✓ Converted (lossless): {image_path.name} -> {webp_path.name}")
            else:
                # Opaque images: use lossy compression
                subprocess.run([
                    'cwebp',
                    '-q', '85',  # Quality 85
                    str(image_path),
                    '-o', str(webp_path)
                ], check=True, capture_output=True)
                print(f"  ✓ Converted (lossy): {image_path.name} -> {webp_path.name}")

        return webp_path
    except subprocess.CalledProcessError as e:
        print(f"  ✗ Failed to convert {image_path.name}: {e}", file=sys.stderr)
        return None
    except FileNotFoundError:
        if image_path.suffix.lower() == '.gif':
            print(f"  ⚠️  gif2webp not found. Install with: brew install webp")
        return None

def update_markdown_references(md_file, old_image, new_image):
    """Update image references in Markdown file

    Handles patterns specific to MkDocs/Zensical:
      - ![alt](imgs/image.png){ width=80% align=right }
      - <img src="imgs/image.png" alt="..." width="80%" />
    """
    content = md_file.read_text(encoding='utf-8')
    old_name = old_image.name
    new_name = new_image.name

    # Try to get relative path from md_file to image
    try:
        md_dir = md_file.parent
        old_rel_path = old_image.relative_to(md_dir)
        new_rel_path = new_image.relative_to(md_dir)
    except ValueError:
        # Images not in same directory tree, use filename only
        old_rel_path = old_name
        new_rel_path = new_name

    # Multiple patterns to catch different image reference formats
    # Each pattern preserves any trailing MkDocs attributes like { width=80% }
    patterns = [
        # Relative path: ![alt](subdir/image.png) or ![alt](subdir/image.png){ attrs }
        (
            rf'!\[([^\]]*)\]\({re.escape(str(old_rel_path))}\)(\{{[^}}]*\}})?',
            rf'![\1]({str(new_rel_path)})\2'
        ),
        # Filename only: ![alt](image.png) or ![alt](image.png){ attrs }
        (
            rf'!\[([^\]]*)\]\({re.escape(old_name)}\)(\{{[^}}]*\}})?',
            rf'![\1]({new_name})\2'
        ),
        # With ./: ![alt](./subdir/image.png) or ![alt](./subdir/image.png){ attrs }
        (
            rf'!\[([^\]]*)\]\(\./{re.escape(str(old_rel_path))}\)(\{{[^}}]*\}})?',
            rf'![\1](./{str(new_rel_path)})\2'
        ),
        # With ./ filename only: ![alt](./image.png) or ![alt](./image.png){ attrs }
        (
            rf'!\[([^\]]*)\]\(\./{re.escape(old_name)}\)(\{{[^}}]*\}})?',
            rf'![\1](./{new_name})\2'
        ),
        # HTML: <img src="subdir/image.png"
        (
            rf'<img(\s[^>]*)src="{re.escape(str(old_rel_path))}"',
            rf'<img\1src="{str(new_rel_path)}"'
        ),
        # HTML: <img src="image.png"
        (
            rf'<img(\s[^>]*)src="{re.escape(old_name)}"',
            rf'<img\1src="{new_name}"'
        ),
        # HTML: <img src="./subdir/image.png"
        (
            rf'<img(\s[^>]*)src="\./{re.escape(str(old_rel_path))}"',
            rf'<img\1src="./{str(new_rel_path)}"'
        ),
        # HTML: <img src="./image.png"
        (
            rf'<img(\s[^>]*)src="\./{re.escape(old_name)}"',
            rf'<img\1src="./{new_name}"'
        ),
    ]

    updated = content
    for pattern, replacement in patterns:
        updated = re.sub(pattern, replacement, updated, flags=re.IGNORECASE)

    if updated != content:
        md_file.write_text(updated, encoding='utf-8')
        return True
    return False

def get_images_to_convert(files=None, all_images=False):
    """Get list of images to convert"""
    if files:
        # Convert specified files
        return [Path(f) for f in files if Path(f).suffix.lower() in ('.png', '.jpg', '.jpeg', '.gif')]
    elif all_images:
        # Convert all PNG/JPG/GIF images in docs/
        core_dir = Path('docs')
        return list(core_dir.rglob('*.png')) + list(core_dir.rglob('*.jpg')) + list(core_dir.rglob('*.jpeg')) + list(core_dir.rglob('*.gif'))
    else:
        # Convert only staged files (pre-commit hook mode)
        # Fallback if no files are passed
        try:
            result = subprocess.run(
                ['git', 'diff', '--cached', '--name-only', '--diff-filter=ACM'],
                capture_output=True,
                text=True,
                check=True
            )
            staged_files = result.stdout.strip().split('\n')
            return [
                Path(f) for f in staged_files
                if f and f.startswith('docs/') and f.lower().endswith(('.png', '.jpg', '.jpeg', '.gif'))
            ]
        except subprocess.CalledProcessError:
            return []

def main():
    """Main function"""
    parser = argparse.ArgumentParser(description='Convert images to WebP')
    parser.add_argument('--all', action='store_true', help='Convert all images in docs/ (not just staged)')
    parser.add_argument('files', nargs='*', help='Specific files to convert')
    args = parser.parse_args()

    if not check_cwebp():
        print("⚠️  cwebp not found. Install with:")
        print("  macOS: brew install webp")
        print("  Ubuntu: sudo apt-get install webp")
        print("\n💡 Note: 'webp' package includes both cwebp and gif2webp")
        print("\nSkipping WebP conversion...")
        sys.exit(0)

    # Get images to convert
    core_images = get_images_to_convert(files=args.files, all_images=args.all)
    core_images = [img for img in core_images if img.exists()]

    if not core_images:
        if args.all or args.files:
             print("No images to convert.")
        sys.exit(0)

    mode = "all images" if args.all else ("specified images" if args.files else "staged images")
    print(f"\n🖼️  Found {len(core_images)} {mode} in docs/ directory")

    converted_images = []
    for image_path in core_images:
        webp_path = convert_to_webp(image_path)
        if webp_path:
            converted_images.append((image_path, webp_path))

    if not converted_images:
        print("\n✅ All images already converted to WebP")
        sys.exit(0)

    # Update Markdown references
    print("\n📝 Updating Markdown references...")
    core_dir = Path('docs')
    md_files = list(core_dir.rglob('*.md'))

    updated_files = []
    for md_file in md_files:
        for old_image, new_image in converted_images:
            if update_markdown_references(md_file, old_image, new_image):
                if md_file not in updated_files:
                    updated_files.append(md_file)
                    print(f"  ✓ Updated: {md_file.relative_to(core_dir)}")

    if not args.all:
        # Stage all changes atomically (pre-commit mode)
        print("\n📦 Staging changes...")

        # Stage WebP files
        for _, webp_path in converted_images:
            subprocess.run(['git', 'add', str(webp_path)], check=True)

        # Stage updated Markdown files
        for md_file in updated_files:
            subprocess.run(['git', 'add', str(md_file)], check=True)

        # Remove original images from staging and working directory
        print("\n🗑️  Removing original images...")
        for old_image, _ in converted_images:
            # Remove from Git staging area
            try:
                subprocess.run(['git', 'rm', '--cached', str(old_image)],
                             check=True, capture_output=True)
            except subprocess.CalledProcessError:
                # File might not be in staging, that's okay
                pass

            # Delete from working directory
            if old_image.exists():
                old_image.unlink()

            print(f"  ✓ Removed: {old_image.name}")
    else:
        # Manual mode: just delete the files
        print("\n🗑️  Removing original images...")
        for old_image, _ in converted_images:
            old_image.unlink()
            print(f"  ✓ Removed: {old_image.name}")

    print(f"\n✅ Converted {len(converted_images)} image(s) to WebP and updated references")

    if args.all:
        print("\n💡 Don't forget to commit the changes:")
        print("   git add docs/")
        print("   git commit -m 'perf: convert all images to WebP'")

    sys.exit(0)

if __name__ == '__main__':
    main()
