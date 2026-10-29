"""Convert repository conveniences into a self-contained buyer application."""
import json
from pathlib import Path
import re
import shutil


def prepare(root: Path, stage: Path):
    public = stage / 'apps/app/public'
    (public / '.gitignore').unlink(missing_ok=True)
    # Only media referenced by the shipped website or app is needed. Original
    # generation inputs under assets/ads/source are not application dependencies.
    website = root / 'dist'
    text_files = [p for p in website.rglob('*') if p.suffix in {'.html', '.css', '.js'}]
    text_files += [p for p in (root / 'apps/app/src').rglob('*')
                   if p.suffix in {'.tsx', '.ts', '.css'}]
    references = set()
    for file in text_files:
        references.update(re.findall(
            r'(?:/|\./)?(assets/[A-Za-z0-9_./-]+\.(?:png|webp|jpe?g|svg|mp4|woff2?))',
            file.read_text()))
    for file in website.rglob('*'):
        if not file.is_file():
            continue
        relative = file.relative_to(website)
        # Generated photographic demo media is preview-only under Envato's policy.
        if relative.parts[0] == 'assets':
            continue
        destination = public / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(file, destination)
    assets = public / 'assets'
    shutil.rmtree(assets, ignore_errors=True)
    assets.mkdir(parents=True)
    placeholder = assets / 'creative-placeholder.svg'
    placeholder.write_text('''<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200"><rect width="1200" height="1200" fill="#eee7da"/><circle cx="925" cy="275" r="330" fill="#dc9b74"/><path d="M0 940 470 430 1200 1200H0Z" fill="#8b9b79"/><circle cx="320" cy="400" r="140" fill="#f9f5ea"/><path d="M660 730h240v200H660z" fill="#f9f5ea" stroke="#28382a" stroke-width="8"/><path d="M780 785v90m-45-45h90" stroke="#d45c32" stroke-width="12" stroke-linecap="round"/></svg>''')
    # Replace sample art references in website files and decorative app CSS. Users
    # still upload their own product photos normally; no generated demo asset ships.
    for file in stage.rglob('*'):
        if not file.is_file() or file.suffix not in {'.html', '.css', '.js', '.tsx', '.ts'}:
            continue
        source = file.read_text()
        source = re.sub(r"video:\s*(['\"])/assets/[^'\"]+\.mp4(?:\?[^'\"]*)?\1", "video:''", source)
        source = re.sub(r'/assets/[A-Za-z0-9_./-]+\.(?:png|webp|jpe?g|mp4)(?:\?v=\d+)?',
                        '/assets/creative-placeholder.svg', source)
        file.write_text(source)
    package_file = stage / 'apps/app/package.json'
    package = json.loads(package_file.read_text())
    for name in ['site:sync', 'predev', 'prebuild']:
        package['scripts'].pop(name, None)
    package_file.write_text(json.dumps(package, indent=2) + '\n')
    # Container startup is required code; keep it with the application it starts.
    shutil.copy2(root / 'scripts/start.sh', stage / 'apps/app/start.sh')
    docker = (stage / 'Dockerfile').read_text()
    docker = docker.replace('COPY dist ./dist\n', '').replace('COPY scripts ./scripts\n', '')
    docker = docker.replace('"scripts/start.sh"', '"apps/app/start.sh"')
    (stage / 'Dockerfile').write_text(docker)
    ignore = stage / '.dockerignore'
    ignore.write_text('\n'.join(line for line in ignore.read_text().splitlines()
                                  if not line.startswith('apps/app/public/')
                                  and not line.startswith('# Marketing-site')) + '\n')
    config = stage / 'apps/app/next.config.ts'
    config.write_text(config.read_text().replace(
        '// The marketing site (repo `dist/`) is copied into public/ by scripts/sync-site.mjs and served here.',
        '// The included website is served directly from apps/app/public.'))
    shutil.copy2(root / 'codecanyon/replacements/docs/DEPLOY.md',
                 stage / 'documentation/DEPLOY.md')
    forbidden = [p for p in stage.rglob('*')
                 if p.is_dir() and p.name in {'dist', 'docs', 'scripts'}]
    if forbidden:
        raise SystemExit(f'Unexpected repository-only directory: {forbidden[0].relative_to(stage)}')
    return {'websiteFiles': len([p for p in website.rglob('*') if p.is_file()]),
            'referencedMediaFiles': len(references),
            'generatedDemoMediaIncluded': False,
            'buyerDemoArtwork': 'Original editable SVG placeholder; preview photography excluded.',
            'unusedWebsiteMediaExcluded': len([p for p in (website / 'assets').rglob('*')
                                               if p.is_file() and p.relative_to(website).as_posix() not in references]),
            'forbiddenDirectoryNames': ['dist', 'docs', 'scripts']}
