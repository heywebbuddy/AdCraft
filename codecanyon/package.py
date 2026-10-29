"""Export buyer files, audit them, and atomically replace the release ZIP."""
import hashlib
import json
import os
import pathlib
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import zipfile
from importlib.machinery import SourceFileLoader

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'codecanyon/build'
OUT.mkdir(parents=True, exist_ok=True)
VERSION = json.loads((ROOT / 'package.json').read_text()).get('version', '1.0.0')
EXCLUDE = {'codecanyon', '.github', '.claude', '.openai', 'node_modules', '.next',
           '.data', '.turbo', '.git', 'test-results', 'playwright-report', '__pycache__'}
OMIT = {'docs/PLAN.md', 'docs/UX-PLAN.md', 'apps/app/e2e/.mobile-audit.mjs'}
ROOT_FILES = {'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'turbo.json',
              'tsconfig.base.json', '.env.example', '.gitignore', '.dockerignore',
              'Dockerfile', 'README.md', 'THIRD-PARTY-NOTICES.md'}
PATTERNS = [r'sk_live_[A-Za-z0-9]{12,}', r'sk_test_[A-Za-z0-9]{12,}',
            r'sk-ant-[A-Za-z0-9_-]{12,}', r'whsec_[A-Za-z0-9]{20,}',
            r'AKIA[0-9A-Z]{16}', r'appgprj_[A-Za-z0-9]+',
            r'acct_[A-Za-z0-9]{12,}', r'org-[A-Za-z0-9]{20,}',
            r'adcrafts?\.co\b', r'heywebbuddy', r'ratnesh', r'suchitrabsinha']

with tempfile.TemporaryDirectory(prefix='adcraft-package-') as temporary:
    stage = Path(temporary) / 'adcraft'
    stage.mkdir()
    names = subprocess.check_output(['git', 'ls-files', '--cached', '--others',
                                     '--exclude-standard', '-z'], cwd=ROOT).decode().split('\0')
    for name in names:
        relative = Path(name)
        if not name or any(part in EXCLUDE for part in relative.parts):
            continue
        if name not in ROOT_FILES and relative.parts[0] not in {'apps', 'packages'}:
            continue
        if any(part in {'scripts', 'docs'} for part in relative.parts):
            continue
        if name in OMIT or name.startswith('scripts/walkthrough/'):
            continue
        if any(part.startswith('.env') and part != '.env.example' for part in relative.parts):
            continue
        if relative.name == '.DS_Store' or relative.suffix == '.tsbuildinfo':
            continue
        source = ROOT / relative
        if not source.is_file():
            continue
        if source.is_symlink():
            raise SystemExit(f'Unexpected symlink in export: {name}')
        target = stage / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    shutil.copy2(ROOT / 'codecanyon/replacements/README.md', stage / 'README.md')
    shutil.copytree(ROOT / 'codecanyon/documentation', stage / 'documentation')
    layout_module = SourceFileLoader('buyer_layout', str(ROOT / 'codecanyon/buyer-layout.py')).load_module()
    layout_audit = layout_module.prepare(ROOT, stage)
    required = ['README.md', 'THIRD-PARTY-NOTICES.md', '.env.example',
                'documentation/index.html', 'pnpm-lock.yaml', 'Dockerfile']
    for name in required:
        if not (stage / name).is_file():
            raise SystemExit(f'Missing required buyer file: {name}')
    # Compare actual seller keys without writing or printing their values.
    private_values = []
    for name in ['.env', '.env.local']:
        env_path = ROOT / name
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                key, sep, value = line.partition('=')
                if sep and re.search(r'KEY|SECRET|TOKEN|DATABASE_URL|PASSWORD', key):
                    value = value.strip().strip('\"\'')
                    if len(value) >= 16:
                        private_values.append(value.encode())
    files = sorted(p for p in stage.rglob('*') if p.is_file())
    for file in files:
        data = file.read_bytes()
        name = file.relative_to(stage).as_posix()
        if any(value in data for value in private_values):
            raise SystemExit(f'Private configuration value found in {name}')
        if re.search('|'.join(PATTERNS), data.decode('utf-8', errors='ignore'), re.I):
            raise SystemExit(f'Credential-shaped string or seller reference found in {name}')
    manifest = {'version': VERSION, 'layoutAudit': layout_audit, 'files': [
        {'path': p.relative_to(stage).as_posix(), 'bytes': p.stat().st_size,
         'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]}
    destination = OUT / f'adcraft-{VERSION}.zip'
    pending = OUT / f'adcraft-{VERSION}.zip.pending'
    try:
        with zipfile.ZipFile(pending, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            for file in files:
                archive.write(file, 'adcraft/' + file.relative_to(stage).as_posix())
        with zipfile.ZipFile(pending) as archive:
            if archive.testzip() is not None:
                raise SystemExit('ZIP integrity check failed')
            # Envato rejects packages containing operating-system metadata files.
            junk = [n for n in archive.namelist()
                    if pathlib.PurePosixPath(n).name in {'.DS_Store', 'Thumbs.db', 'desktop.ini'}
                    or '__MACOSX' in n]
            if junk:
                raise SystemExit('System metadata files in archive: ' + ', '.join(junk))
            # Source must ship readable: no single-line minified stylesheets.
            for name in archive.namelist():
                if not name.endswith('.css'):
                    continue
                text = archive.read(name).decode('utf-8', errors='ignore')
                longest = max((len(line) for line in text.splitlines()), default=0)
                if longest > 500:
                    raise SystemExit(
                        f'{name} looks minified (longest line {longest} chars); '
                        'ship readable source')
        os.replace(pending, destination)
    finally:
        pending.unlink(missing_ok=True)
    manifest['archiveSha256'] = hashlib.sha256(destination.read_bytes()).hexdigest()
    manifest['archiveBytes'] = destination.stat().st_size
    (OUT / 'buyer-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'Built {destination.relative_to(ROOT)}: {len(files)} files, '
          f'{destination.stat().st_size / 1024 / 1024:.1f} MiB; audit and ZIP integrity passed.')
