"""Add a completed renderer fixture to the isolated local buyer test database."""
from pathlib import Path
import json
import shutil
import subprocess

root = Path(__file__).resolve().parent.parent
buyer = Path(json.loads((root / 'codecanyon/build/validation-path.json').read_text())['buyerRoot'])
psql = ['/opt/homebrew/opt/postgresql@15/bin/psql', '-h', '127.0.0.1', '-p', '54437',
        '-U', 'postgres', 'adcraft_buyer_final', '-At', '-v', 'ON_ERROR_STOP=1']
org = subprocess.check_output(psql + ['-c', 'select id from organizations limit 1']).decode().strip()
assert len(org) == 36
target = buyer / '.data/files' / f'org/{org}/renders/buyer-render-check.png'
target.parent.mkdir(parents=True, exist_ok=True)
shutil.copy2(buyer / 'packages/render/out/hero-4x5.png', target)
document = {'mode': 'editable', 'template': 'hero', 'headline': 'A simple daily ritual',
            'cta': 'Shop now', 'brand': {'name': 'Everyday Test',
            'colors': {'primary': '#242521', 'accent': '#e65c32', 'background': '#f8f7f3', 'text': '#242521'},
            'fonts': {'heading': 'DM Sans', 'body': 'DM Sans'}},
            'layout': {'align': 'left', 'headlineSize': 84, 'overlay': .55}}
literal = json.dumps(document).replace("'", "''")
sql = f"""update brands set website='https://example.com';
with c as (
 insert into creatives (org_id,concept_id,kind,name,document)
 select org_id,id,'static','Buyer renderer check','{literal}'::jsonb
 from concepts where status='selected' limit 1 returning id,org_id
), v as (
 insert into variants (org_id,creative_id,placement_id,ratio,width,height)
 select org_id,id,'meta.feed.4x5','4:5',1080,1350 from c returning id,org_id
)
insert into renders (org_id,variant_id,status,engine,output_key,mime_type,file_bytes)
select org_id,id,'succeeded','buyer-render-check','org/'||org_id||'/renders/buyer-render-check.png',
 'image/png',{target.stat().st_size} from v;"""
subprocess.run(psql + ['-c', sql], check=True, stdout=subprocess.DEVNULL)
print('Prepared one renderer-produced creative in the isolated buyer test database.')
