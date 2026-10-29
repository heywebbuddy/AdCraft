# Adcraft CodeCanyon preparation

Prepared 17 October 2026. This replaces the older preflight and pricing draft.

## Deliverables

- `build/adcraft-1.0.0.zip`: buyer source, lockfile, fictional sample media, HTML buyer guide and dependency notices.
- `build/adcraft-codecanyon-submission.zip`: buyer ZIP plus approved listing panels, cover, thumbnail, gallery, field drafts, reviewer notes and validation evidence.
- `submission/START-HERE.txt`: upload order and remaining form fields.
- `build/validation.json`: final test results, limitations and buyer archive hash.
- `listing-v2/`: editable approved artwork and catalog evidence. Kept out of the buyer ZIP.

## Rebuild

```bash
bash codecanyon/package.sh
node codecanyon/prepare-gallery.cjs
python3 codecanyon/assemble-submission.py
```

The packager uses a buyer file allowlist: application and package source, required root configuration, notices and buyer documentation. It excludes root `dist`, `docs` and `scripts`, app developer scripts, internal public docs, unused media originals, seller tools, environments, databases, dependency folders, generated builds and listing assets. Required website files and original SVG placeholders are placed directly in `apps/app/public`. Photographic preview media is excluded. The buyer has no site-copy hook; container startup lives in `apps/app/start.sh`. It checks credential patterns and actual seller configuration values, verifies ZIP integrity and writes hashes. Previous builds survive a failed packaging run.

## Verified setup corrections

The local example environment now leaves the database blank. Buyers can use embedded PGlite locally or PostgreSQL in production. The migration command loads the root `.env`, matching the Next.js application. The guide explains provider requirements and production sign-in. Bundled font license texts are included. The browser suite uses the actual sandbox connection links. Root repository docs and optional operator scripts are not shipped; Stripe setup is documented directly in the buyer guide.

## Submitted for approval

Envato confirmed upload success. New item queue ID: **65560447**. Regular item price USD 97, Extended item price USD 189, six months of support. Description images and documentation are hosted publicly. The savings offer is omitted until approval. No real product brands are used in the listing examples.

The buyer download contains editable SVG placeholders. AI-generated photos and videos are used in previews only and are excluded from the buyer ZIP, following Envato's current AI asset policy. Full fresh-package validation is in `build/validation.json`.

No public application demo was supplied; the reviewer has complete local setup instructions. Provider accounts and usage credits are not included. Remotion's product-video license terms are disclosed in the item description and buyer notices.

## Current official references

- [Code preparation](https://help.author.envato.com/hc/en-us/articles/360000471583-Code-Item-Preparation-Technical-Requirements)
- [Preview dimensions](https://help.author.envato.com/hc/en-us/articles/360000424863-Item-Presentation-Requirements)
- [Description link policy](https://help.author.envato.com/hc/en-us/articles/59520499699225-What-Links-Can-I-Place-In-My-Item-Description-Preview-or-Download)
- [Remotion licensing](https://www.remotion.dev/docs/license/pricing)
