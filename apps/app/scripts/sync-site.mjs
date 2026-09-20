// Copies the marketing site (repo dist/) into public/ so Next serves it at /, /showcase, /pricing.
// dist/ stays the source of truth; public copies are gitignored.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, "../../../dist");
const pub = path.resolve(here, "../public");
if (!existsSync(dist)) {
  console.warn("[site:sync] dist/ not found; skipping marketing site copy");
  process.exit(0);
}
mkdirSync(pub, { recursive: true });
for (const entry of ["index.html", "style.css", "character-studio.css", "workflow-tour.css", "app.js", "favicon.svg", "favicon.ico", "favicon-32.png", "apple-touch-icon.png", "assets", "showcase", "pricing"]) {
  const from = path.join(dist, entry);
  const to = path.join(pub, entry);
  if (!existsSync(from)) continue;
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
}
console.log("[site:sync] marketing site copied to apps/app/public");
