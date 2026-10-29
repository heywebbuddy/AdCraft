"""Assemble reviewed listing files separately from the buyer download."""
from pathlib import Path
import hashlib
import json
import shutil
import zipfile

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / 'codecanyon/listing-v2'
OUT = ROOT / 'codecanyon/submission'
OUT.mkdir(exist_ok=True)
for name in ['main-files', 'listing', 'previews', 'checks']:
    (OUT / name).mkdir(exist_ok=True)
shutil.copy2(ROOT / 'codecanyon/build/adcraft-1.0.0.zip', OUT / 'main-files')
shutil.copy2(ROOT / 'codecanyon/build/buyer-manifest.json', OUT / 'checks')
for name in ['listing-metadata.json', 'description-copy.txt', 'feature-coverage.json',
             'heygen-library-evidence.json', 'heygen-voice-evidence.json', 'asset-audit.json']:
    shutil.copy2(ART / name, OUT / 'listing')
for name in ['adcraft-cover-2340x1560.jpg', 'adcraft-banner-590x300.jpg',
             'adcraft-thumbnail-80x80.png']:
    shutil.copy2(ART / 'exports' / name, OUT / 'previews')
shutil.copytree(ART / 'exports', OUT / 'listing/exports', dirs_exist_ok=True)
description = (ART / 'description-images.local.html').read_text()
shutil.copy2(ART / 'description-images.local.html', OUT / 'listing/description-local.html')
(OUT / 'listing/description-template.html').write_text(
    description.replace('src="exports/', 'src="{{PUBLIC_ASSET_BASE}}/'))
(ROOT / 'codecanyon/item-description.html').write_text(
    (OUT / 'listing/description-template.html').read_text())
(OUT / 'listing/resolve-description.py').write_text('''"""Run with your HTTPS URL for the hosted exports folder."""
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
''')
metadata = json.loads((ART / 'listing-metadata.json').read_text())
settings = json.loads((ROOT / 'codecanyon/upload-settings.json').read_text())
publication_status_path = ROOT / 'codecanyon/publication/status.json'
publication_status = json.loads(publication_status_path.read_text()) if publication_status_path.exists() else None
fields = {
    'title': metadata['title'], 'shortDescription': metadata['shortDescription'],
    'tags': metadata['tags'], 'suggestedCategory': 'JavaScript / Miscellaneous',
    'softwareVersions': ['ReactJS', 'Node.js'],
    'sourceLanguages': ['TypeScript', 'JavaScript', 'HTML', 'CSS', 'SQL', 'JSON'],
    'frameworks': ['Next.js 15', 'React 19', 'Tailwind CSS 4', 'Drizzle ORM'],
    'requirements': metadata['requirements'],
    'currency': settings['currency'],
    'regularPrice': settings['regularPrice'], 'extendedPrice': settings['extendedPrice'],
    'supportSetting': settings['supportSetting'], 'supportMonths': settings.get('supportMonths'),
    'liveDemoUrl': None, 'documentationUrl': settings.get('documentationUrl'), 'publicAssetBase': settings.get('publicAssetBase'),
    'status': publication_status['status'] if publication_status else 'Prepared locally; not submitted',
    'reviewQueueId': publication_status.get('queueId') if publication_status else None,
}
(OUT / 'upload-fields.json').write_text(json.dumps(fields, indent=2) + '\n')
(OUT / 'reviewer-notes.txt').write_text('''Adcraft — reviewer notes

Source: Next.js 15 / React 19 / TypeScript monorepo. Node.js 22+ and pnpm 9.15.9.
Start with adcraft/documentation/index.html in the Main File ZIP.

Local review: install with pnpm install --frozen-lockfile, copy .env.example to .env,
set a random AUTH_SECRET, leave DATABASE_URL blank, and run:
pnpm --filter @adcraft/app dev
Development sign-in accepts a test email. Create a workspace and brand to begin.
Set ADMIN_EMAILS to that email before starting if you want admin access.

Text concepts offer sample output. The static studio, public HeyGen
catalogs and live generation need provider keys; accounts and usage are not included.
Use sandbox ad accounts to review publishing without creating paid campaigns.
Production sign-in needs Resend or Google; development sign-in is disabled there.

Preview panels are purpose-made feature illustrations with sample content, not
screenshots or evidence of brand clients, endorsements or campaign performance.
The buyer ZIP uses original SVG placeholders. Generated photographic demo images
and videos are preview-only and are not included in the buyer download.
The HeyGen counts refer to a public catalog snapshot, not bundled characters:
1,414 people / 25,070 looks; 2,643 voices. Catalog access depends on the provider.
See the dated evidence files; no API keys are included.

Read THIRD-PARTY-NOTICES.md for Remotion and other dependency terms.
A public reviewer demo and its access details have not been configured in this kit.
''')
(OUT / 'START-HERE.txt').write_text('''Adcraft — CodeCanyon submission kit

1. Main File: main-files/adcraft-1.0.0.zip — buyer source, editable SVG placeholders,
   lockfile, HTML documentation and third-party notices. No root dist/docs/scripts folders, unused media originals, listing artwork,
   node_modules, seller environment, database, Git history or generated builds.
2. Cover: previews/adcraft-cover-2340x1560.jpg. Legacy banner and 80x80 thumbnail
   are also provided. Gallery files are in previews/gallery (up to 15 images).
3. Description: listing/description-local.html previews the approved 25 panels.
   Host listing/exports at an HTTPS URL, then run listing/resolve-description.py
   with that URL to generate description-final.html for the upload form.
4. Fields: upload-fields.json; reviewer information: reviewer-notes.txt.
5. Validation: checks/validation.json and buyer-manifest.json.

Submitted settings:
- Prices: Regular USD 97; Extended USD 189.
- Six months of item support is selected.
- Description images use a public HTTPS host; all 25 panel URLs were verified.
- The savings offer is omitted until item approval, as requested.
- Use a separate demo environment with no live payments or customer data.
  A demo is recommended for code items; no public demo was deployed in this task.

Current official references checked 17 October 2026:
https://help.author.envato.com/hc/en-us/articles/360000471583
https://help.author.envato.com/hc/en-us/articles/360000424863
https://www.remotion.dev/docs/license/pricing

This item was submitted for approval on 17 October 2026. Envato review queue: 65560447.
''')
final_description = ROOT / 'codecanyon/publication/description-final.html'
if final_description.exists():
    shutil.copy2(final_description, OUT / 'listing/description-final.html')
validation = ROOT / 'codecanyon/build/validation.json'
if validation.exists():
    shutil.copy2(validation, OUT / 'checks/validation.json')
for name in ['production-smoke.json', 'documentation-smoke.json', 'onboarding-smoke.json', 'concepts-smoke.json']:
    source = ROOT / 'codecanyon/build' / name
    if source.exists():
        shutil.copy2(source, OUT / 'checks' / name)
(OUT / 'index.html').write_text('''<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Adcraft submission kit</title>
<style>*{box-sizing:border-box}body{margin:0;background:#f8f7f3;color:#242521;font:16px/1.6 Arial,sans-serif}
main{max-width:940px;margin:auto;padding:64px 24px}h1{font-size:44px;line-height:1.12;letter-spacing:-1.7px;margin:12px 0 20px}
.label{font-size:12px;text-transform:uppercase;letter-spacing:2px;color:#b64b27}.lead{font-size:20px;color:#65685f}
.cards{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:32px 0}.card{background:white;border:1px solid #dedfd5;border-radius:16px;padding:24px}
h2{font-size:20px;margin:0 0 12px}a{color:#b64020;text-underline-offset:4px}.button{display:inline-block;background:#242521;color:white;text-decoration:none;border-radius:7px;padding:12px 18px}
li{margin:8px 0}footer{color:#65685f;border-top:1px solid #dedfd5;padding-top:20px;margin-top:36px;font-size:14px}
@media(max-width:650px){.cards{grid-template-columns:1fr}main{padding-top:32px}h1{font-size:34px}}</style>
<main><span class="label">Adcraft / CodeCanyon</span><h1>Your submission files,<br>in one place.</h1>
<p class="lead">Buyer source, approved artwork and upload drafts. Submitted to Envato. Review queue #65560447. Approval is pending.</p>
<a class="button" href="../build/adcraft-codecanyon-submission.zip">Download the full submission kit</a>
<div class="cards"><article class="card"><h2>Buyer download</h2><p>Application source, editable SVG placeholders, locked dependencies, setup guide and license notices.</p>
<a href="main-files/adcraft-1.0.0.zip">Download buyer ZIP</a></article>
<article class="card"><h2>Listing artwork</h2><p>25 description sections, 15 gallery images, a cover, banner and thumbnail.</p>
<a href="listing/description-local.html">View the approved description</a></article></div>
<h2>Upload notes</h2><ul><li><a href="START-HERE.txt">Start here: files and submission details</a></li>
<li><a href="upload-fields.json">Title, tags and upload fields</a></li><li><a href="reviewer-notes.txt">Reviewer notes</a></li>
<li><a href="checks/validation.json">Test results and package checks</a></li></ul>
<p>Regular: $97 USD. Extended: $189 USD. Six months of support selected. The savings offer is omitted until approval.</p>
<footer>No seller keys or customer database are included. Live provider usage requires the buyer's own accounts.</footer></main></html>''')
if publication_status:
    shutil.copytree(ROOT / 'codecanyon/publication', OUT / 'publication', dirs_exist_ok=True)
files = sorted(p for p in OUT.rglob('*') if p.is_file() and p.name != 'manifest.json')
(OUT / 'manifest.json').write_text(json.dumps([
    {'path': p.relative_to(OUT).as_posix(), 'bytes': p.stat().st_size,
     'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in files], indent=2) + '\n')
destination = ROOT / 'codecanyon/build/adcraft-codecanyon-submission.zip'
with zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(p for p in OUT.rglob('*') if p.is_file()):
        archive.write(file, 'adcraft-submission/' + file.relative_to(OUT).as_posix())
with zipfile.ZipFile(destination) as archive:
    assert archive.testzip() is None
print(f'Assembled {destination.relative_to(ROOT)} ({destination.stat().st_size / 1024**2:.1f} MiB)')
