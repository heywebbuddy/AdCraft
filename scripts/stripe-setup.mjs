#!/usr/bin/env node
/**
 * Creates Adcraft's Stripe catalogue and webhook in whichever mode STRIPE_SECRET_KEY is for,
 * and prints the environment variables the app needs. Safe to re-run: products and prices are
 * found by lookup key, the webhook by URL, so nothing is duplicated.
 *
 *   node scripts/stripe-setup.mjs                 # uses STRIPE_SECRET_KEY from .env
 *   node scripts/stripe-setup.mjs --url https://www.adcrafts.co
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "apps/app/package.json"));
const Stripe = require("stripe");

// Read .env without depending on dotenv.
for (const line of readFileSync(path.join(root, ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const key = process.env.STRIPE_SECRET_KEY;
if (!key) throw new Error("STRIPE_SECRET_KEY is not set in .env");
const live = key.startsWith("sk_live_") || key.startsWith("rk_live_");
const appUrl = (process.argv.includes("--url") ? process.argv[process.argv.indexOf("--url") + 1] : process.env.AUTH_URL || "https://www.adcrafts.co").replace(/\/$/, "");
const stripe = new Stripe(key);

// Mirrors PLANS and TOP_UP in apps/app/src/server/billing.ts. Yearly = 10 months (the site says "Save 20%").
const PLANS = [
  { id: "starter", name: "Adcraft Starter", month: 29, credits: 150, description: "1 brand workspace · 150 credits a month · static ads, product video and UGC" },
  { id: "studio", name: "Adcraft Studio", month: 79, credits: 500, description: "3 brand workspaces · 500 credits a month · team review and approvals" },
  { id: "agency", name: "Adcraft Agency", month: 199, credits: 1500, description: "10 brand workspaces · 1,500 credits a month · client review workspaces" },
];
const TOP_UP = { price: 10, credits: 100 };
const WEBHOOK_EVENTS = ["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "invoice.paid"];

async function product(lookup, data) {
  const found = await stripe.products.search({ query: `metadata["lookup"]:"${lookup}"` });
  if (found.data[0]) return found.data[0];
  return stripe.products.create({ ...data, metadata: { ...(data.metadata ?? {}), lookup } });
}
async function price(lookupKey, data) {
  const found = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
  if (found.data[0]) return found.data[0];
  return stripe.prices.create({ ...data, lookup_key: lookupKey });
}

const env = {};
for (const p of PLANS) {
  const prod = await product(`adcraft.${p.id}`, { name: p.name, description: p.description, metadata: { plan: p.id, credits: String(p.credits) } });
  const month = await price(`adcraft.${p.id}.month`, { product: prod.id, currency: "usd", unit_amount: p.month * 100, recurring: { interval: "month" }, metadata: { plan: p.id, credits: String(p.credits) } });
  const year = await price(`adcraft.${p.id}.year`, { product: prod.id, currency: "usd", unit_amount: p.month * 10 * 100, recurring: { interval: "year" }, metadata: { plan: p.id, credits: String(p.credits) } });
  env[`STRIPE_PRICE_${p.id.toUpperCase()}_MONTH`] = month.id;
  env[`STRIPE_PRICE_${p.id.toUpperCase()}_YEAR`] = year.id;
}
const topup = await product("adcraft.topup", { name: "Adcraft credits top-up", description: `${TOP_UP.credits} generation credits`, metadata: { credits: String(TOP_UP.credits) } });
env.STRIPE_PRICE_TOPUP = (await price("adcraft.topup", { product: topup.id, currency: "usd", unit_amount: TOP_UP.price * 100, metadata: { credits: String(TOP_UP.credits) } })).id;

// Webhook: one endpoint per app URL. The signing secret is only returned at creation.
const hookUrl = `${appUrl}/api/stripe/webhook`;
const hooks = await stripe.webhookEndpoints.list({ limit: 100 });
let hook = hooks.data.find((h) => h.url === hookUrl);
if (hook) {
  await stripe.webhookEndpoints.update(hook.id, { enabled_events: WEBHOOK_EVENTS });
  env.STRIPE_WEBHOOK_SECRET = "(unchanged — endpoint already existed; roll it in the dashboard if the secret is lost)";
} else {
  hook = await stripe.webhookEndpoints.create({ url: hookUrl, enabled_events: WEBHOOK_EVENTS, description: "Adcraft billing" });
  env.STRIPE_WEBHOOK_SECRET = hook.secret;
}

console.log(`# Stripe ${live ? "LIVE" : "test"} mode · webhook ${hookUrl}`);
console.log(`STRIPE_SECRET_KEY=${key}`);
for (const [k, v] of Object.entries(env)) console.log(`${k}=${v}`);
