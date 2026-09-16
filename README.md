# Adcraft marketing site

A responsive, static marketing design for an AI advertising studio. Working brand: Adcraft.

Pages: `/`, `/showcase/`, `/pricing/`.

Run locally with `python3 -m http.server 4173 --directory dist`.

The showcase filters, concept dialogs, workflow steps, pricing toggle, mobile menu, and FAQ disclosures work without a backend. Pricing is illustrative launch planning; no checkout, authentication, live generation, or campaign publishing is connected. Sample brand names and AI-generated creative imagery are illustrative.

Source is in `dist/` (intentional, buildless static site). Shared UI/content: `dist/app.js`; styling: `dist/style.css`; custom generated imagery: `dist/assets/creative-panels.png`. Hosting configuration is in `.openai/hosting.json`.
