const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const req = createRequire(path.resolve('apps/app/package.json'));
const sharp = req('sharp');
const root = path.resolve('codecanyon');
const target = path.join(root, 'submission/previews/gallery');
const slugs = ['02-heygen-library', '03-brand-kits', '04-product-library',
  '05-ai-ideas', '06-image-ad-layouts', '08-bulk-generation', '09-product-videos',
  '10-ugc-templates', '11-ugc-editor', '12-create-characters', '15-voice-tools',
  '16-publish-campaigns', '19-teams-and-workspaces', '20-plans-and-credits', '22-admin-panel'];
(async () => {
  fs.mkdirSync(target, { recursive: true });
  const checks = [];
  for (const [i, slug] of slugs.entries()) {
    const output = path.join(target, `${String(i+1).padStart(2, '0')}-${slug.slice(3)}.jpg`);
    const resized = await sharp(path.join(root, 'listing-v2/exports', `${slug}.jpg`))
      .resize({ width: 1170, height: 1500, fit: 'inside', withoutEnlargement: true }).toBuffer();
    const size = await sharp(resized).metadata();
    const margin = Math.floor((1170-size.width)/2);
    await sharp(resized).extend({ left: margin, right: 1170-size.width-margin,
      top: 0, bottom: 0, background: '#f8f7f3' }).jpeg({ quality: 94 }).toFile(output);
    const m = await sharp(output).metadata();
    if (m.width !== 1170 || m.height > 1500 || fs.statSync(output).size > 20*1024**2) {
      throw new Error(`Gallery dimensions or size invalid: ${output}`);
    }
    checks.push({ file: path.basename(output), source: `${slug}.jpg`, width: m.width,
      height: m.height, bytes: fs.statSync(output).size });
  }
  fs.mkdirSync(path.join(root, 'submission/checks'), { recursive: true });
  fs.writeFileSync(path.join(root, 'submission/checks/gallery-checks.json'), JSON.stringify(checks,null,2));
  console.log(`Prepared ${checks.length} gallery images; all are 1170px wide and at most 1500px tall.`);
})();
