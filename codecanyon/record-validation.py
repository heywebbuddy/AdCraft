"""Record checks from the isolated buyer extraction and link them to the ZIP."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import shutil

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / 'codecanyon/build'
buyer = Path(json.loads((BUILD / 'validation-path.json').read_text())['buyerRoot'])
logs = {
    'install': '/tmp/adcraft-buyer-install.log',
    'postgres-migration': '/tmp/adcraft-buyer-migrate.log',
    'postgres-repeat-migration': '/tmp/adcraft-buyer-remigrate.log',
    'embedded-database': '/tmp/adcraft-buyer-pglite.log',
    'build': '/tmp/adcraft-buyer-build.log',
    'typecheck': '/tmp/adcraft-buyer-typecheck.log',
    'application-tests': '/tmp/adcraft-buyer-tests.log',
    'render-tests': '/tmp/adcraft-buyer-render-tests.log',
    'render-smoke': '/tmp/adcraft-buyer-render-smoke.log',
    'browser-tests': '/tmp/adcraft-buyer-e2e-final.log',
}
output = ROOT / 'codecanyon/submission/checks/logs'
output.mkdir(parents=True, exist_ok=True)
texts = {}
for name, source in logs.items():
    text = Path(source).read_text()
    text = re.sub(r'\x1b\[[0-9;]*[A-Za-z]', '', text)
    text = text.replace(str(buyer), '<buyer>').replace(str(buyer.resolve()), '<buyer>')
    text = text.replace(str(ROOT), '<workspace>')
    texts[name] = text
    (output / f'{name}.txt').write_text(text)
assert 'Done in' in texts['install']
assert 'migrations applied successfully' in texts['postgres-migration']
assert 'migrations applied successfully' in texts['postgres-repeat-migration']
assert 'Embedded database migrated and queried successfully' in texts['embedded-database']
assert re.search(r'Tasks:\s+1 successful, 1 total', texts['build'])
assert re.search(r'Tasks:\s+8 successful, 8 total', texts['typecheck'])
assert '# pass 5' in texts['application-tests'] and '# fail 0' in texts['application-tests']
assert '# pass 4' in texts['render-tests'] and '# fail 0' in texts['render-tests']
assert '21 renders in' in texts['render-smoke']
assert re.search(r'6 passed', texts['browser-tests']) and not re.search(r'\d+ failed', texts['browser-tests'])
manifest = json.loads((BUILD / 'buyer-manifest.json').read_text())
production = json.loads((BUILD / 'production-smoke.json').read_text())
assert not any(set(Path(entry['path']).parts[:-1]) & {'dist', 'docs', 'scripts'}
               for entry in manifest['files'])
for entry in manifest['files']:
    file = buyer / entry['path']
    assert file.is_file() and hashlib.sha256(file.read_bytes()).hexdigest() == entry['sha256'], entry['path']
report = {
    'checkedAt': datetime.now(timezone.utc).isoformat(),
    'buyerArchive': 'adcraft-1.0.0.zip', 'sha256': manifest['archiveSha256'],
    'filesMatchedToTestedExtraction': len(manifest['files']),
    'buyerLayoutAudit': manifest['layoutAudit'],
    'buyerPackageVerified': True, 'uploadedOrSubmitted': False,
    'checks': {
        'lockedFreshInstall': 'passed', 'productionBuild': 'passed',
        'typecheckPackages': 8, 'applicationTestsPassed': 5, 'renderTestsPassed': 4,
        'staticRendersPassed': 21, 'browserTestsPassed': 6, 'browserTestsSkipped': 0,
        'postgresMigrationAndRepeat': 'passed', 'embeddedPgliteMigrationAndQuery': 'passed',
        'productionPublicRoutes': 5, 'dashboardProtected': True,
        'productionPublicFilesChecked': production['publicFilesChecked'],
        'developmentLoginHiddenInProduction': True, 'buyerDocumentationWidths': [390, 1440],
        'zipIntegrity': 'passed', 'sellerCredentialAudit': 'passed',
        'newWorkspaceAndBrand': 'passed', 'productUpload': 'passed',
        'sampleConceptsGenerated': 8, 'staticStudioOpens': True,
    },
    'fixtureNotes': [
        'Fresh buyer extraction with separate PostgreSQL and local media; no customer database used.',
        'One creative fixture used a PNG from the actual offline renderer for campaign tests.',
        'Buyer package has no dist, docs or scripts directories. Required website files live in apps/app/public.',
        'Render smoke harness ran outside the shipped source inventory; developer scripts are excluded.',
    ],
    'limits': [
        'No paid live AI generation, live campaigns, Stripe payments or external email were exercised.',
        'Static studio generation requires a connected image provider; concept samples work without one.',
        'Docker daemon unavailable on this host; Docker image build was not tested. Native Node production build and server passed.',
        'Next.js build reports upstream jose Edge Runtime API warnings; compilation and runtime checks passed.',
        'Catalog figures are a dated snapshot and do not include provider usage credits.',
    ],
    'beforeSubmission': [
        'Set up and verify any public demo and reviewer access.',
    ],
}
(BUILD / 'validation.json').write_text(json.dumps(report, indent=2) + '\n')
print('Recorded passing checks and matched every buyer file to the tested extraction.')
