"""Run with your HTTPS URL for the hosted exports folder."""
from pathlib import Path
import sys
from urllib.parse import urlparse
base = sys.argv[1].rstrip('/') if len(sys.argv) == 2 else ''
if urlparse(base).scheme != 'https' or not urlparse(base).netloc:
    raise SystemExit('Usage: python3 resolve-description.py https://your-host/path/to/exports')
root = Path(__file__).resolve().parent
text = (root / 'description-template.html').read_text().replace('{{PUBLIC_ASSET_BASE}}', base)
(root / 'description-final.html').write_text(text)
print('Wrote description-final.html; verify all hosted images before pasting.')
