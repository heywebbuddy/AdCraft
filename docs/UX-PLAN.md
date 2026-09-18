# Adcraft — production-readiness audit and UX plan

_18 Sep 2026. Based on a full walkthrough as a brand-new user (empty brand → live campaign → performance) plus a review of every route._

## 1. Verdict

**The loop works.** Product photo → brief → 8 concepts → finished 4:5 ad → campaign published (sandbox Meta) → performance synced, in about five minutes, with real providers (fal cutout + Nano Banana Pro, Claude concepts) and the result was genuinely good: correct product, on-brief copy, brand colours.

**It is not production-ready yet**, for four reasons, in order of weight:

1. **Publishing is not live.** All three ad networks run in sandbox because no platform credentials exist. The adapters are complete but have never touched a real account. Until at least Meta is live, "push the ads" is a demo.
2. **The flow has a hole in the middle.** A finished creative has no way forward: the creative page offers Download / Approve / Share, but not "Add to a campaign". Users have to discover Campaigns in the sidebar and find the creative again from a list. Likewise Performance shows a winner but offers no way to act on it (the "start from a winner" link exists but the brief form ignores it).
3. **Two products in one shell.** The "brief" world (Product library → Briefs → Concepts → Creatives) and the "character" world (Character studio → Create an ad) are separate entrances with different vocab, different builders and different result pages. A new user does not know which door to use.
4. **Operational gaps** a paying customer would hit in week one: no email notifications when long jobs finish, in-process caches that reset on deploy, no rate limiting, no error tracking, sandbox-only analytics copy.

Everything else — auth, teams, billing, credits, approvals, share links, brand kits, admin — is in place and behaved during the walkthrough.

## 2. What was checked

| Step | Result | Notes |
|---|---|---|
| Sign-in (magic link / dev) | ✓ | |
| Overview | ✓ | Launchpad + cast panel (Codex) fine; "Start from → A winner" links to `?from=` which the brief form ignores |
| Product library → add product | ✓ 20 s | Cutout via BiRefNet; clear status |
| "Brief with this product" | **fixed** | Product was not preselected (`?product=` ignored) — fixed in `5312336` |
| Brief form | ✓ | "Edit kit" pointed at a 404 (`/settings/brand`) — fixed. Copy says "about ten seconds"; concepts took 75 s |
| Concepts | ✓ 75 s | 8 strong concepts; Select → Make the ad / Make a video |
| Static studio | ✓ 30 s | Approach / art direction / quality / sizes; result excellent |
| Creative page | **gap** | Download, Refine, Approve, Share — **no "Add to campaign"** |
| Campaigns → New | ✓ | One long form; creative picker only lists finished renders; spec check shown |
| Publish as paused | ✓ | Sandbox Meta objects created; activity log clear; Resume / Archive |
| Performance → Sync now | ✓ | Sandbox metrics, charts, per-creative rows, fatigue alerts |
| Character studio (all five sections) | ✓ | Verified in earlier sessions; real HeyGen render done twice |
| Brand kits / Settings / Team / Billing / API / Templates / Admin | ✓ | Not re-tested in depth this pass |

Timings are real-provider timings on this machine.

## 3. The plan

Four phases. Each is shippable on its own; order matters.

### Phase 0 — Make the loop honest (1–2 days) — _blocks launch_

- **Meta live.** Add `META_APP_ID/SECRET`, connect a real ad account under Development access, run: connect → paused campaign → resume → insights → archive. Fix whatever the real Graph API disagrees with (expect a few field-name issues). Same for TikTok sandbox and a Google test account.
- **Sandbox must be unmistakable.** Today a sandbox account looks like a real one with a small "Sandbox" chip; Performance shows invented spend as if real. Add a persistent banner on Campaigns/Performance ("Sandbox — simulated results") and label every number.
- **Hourly insights sync + fatigue alerts** already exist; confirm the Inngest cron is registered in production (`insights/cron`).
- **Error tracking + uptime**: Sentry (server + client), a `/api/health` that checks DB, storage, Inngest.
- **Persist the caches that matter**: presenter library is persisted; voice catalogue (6 h, in-process) and model catalogue should move to `platform_settings` so a deploy doesn't cost a 30 s cold fetch on first request.

### Phase 1 — Close the gaps in the flow (3–5 days) — _the UX fix that matters most_

**1a. Every creative gets a "next step".**
On the creative page, replace the loose Approval/Share/Download stack with one **Next** panel:
- Draft → *Request approval* (or *Approve* if you're the owner)
- Approved → **Add to campaign →** (opens New campaign with this creative preselected, or picks an existing draft campaign)
- Live → *See performance →* with the creative's own numbers, and **Make a variant →**
- Failed → *Try again* with the model picker
Same panel on the video page.

**1b. Campaign builder as steps, not one form.**
Account → Objective & audience → Placements & budget → Creatives → Review. Each step validates; the Review step shows exactly what will be created on the platform (campaign / ad set / N ads) and the sandbox warning. Entering from a creative skips to Creatives with it selected.

**1c. Close the analytics loop.**
- Performance per-creative row → *Open creative*, *Make a variant*, *Pause*.
- "Start from a winner" actually pre-fills a brief (headline, angle, product) — the link exists, the form ignores `?from=`.
- Fatigue alert → *Refresh this creative* (new version with the same brief).

**1d. Background-job feedback.**
Long jobs (concepts 75 s, character ads 3–5 min, digital twins up to an hour) currently rely on the page polling. Add: an in-app **Activity** tray in the topbar (queued / running / done, click to open) and an **email when a video or twin finishes** (Resend is already wired). Fix the copy that promises "about ten seconds".

### Phase 2 — One product, one entrance (1 week)

**2a. One "Create" entrance.** Replace *Create a brief* (sidebar CTA) with **Create ▾**: *Static ad*, *Product video*, *Presenter video* (character studio), *Bulk from CSV*. Each lands in the matching builder with the brief step inlined as a first screen. "Creative briefs" becomes a history/list page, not the front door.

**2b. Unify the builders.** The static studio, video builder and character studio all have the same shape (source → direction → output). Give them one shell: left = steps, right = sticky preview + brief card + cost. Reuse the Character studio's numbered sections and pick bar (they're the best of the three).

**2c. Rename for users, not for us.**
- "Creatives" → **Ads**; "Renders/variants" never shown.
- "Concepts" → **Ideas** (or fold into the builder as step one).
- "Presenter / avatar / character / look" → keep **Character**, **Look**, **Voice**; "presenter library" → **Cast library**.
- "Brief" stays but only as the input step.

**2d. Onboarding that ends in an ad.** The welcome flow creates a brand; it should continue: add a product (or skip with a URL → we scrape name/description/image), pick a format, generate one ad, then show the dashboard. Credits banner explains what 50 credits buys (≈ 25 static ads or 1 presenter video).

**2e. Mobile.** Everything works at 375 px but the builders are cramped; ship read-only mobile (review, approve, comment, pause) and push creation to desktop with a clear message.

### Phase 3 — Trust and scale (ongoing)

- **Brand safety on output**: run generated copy through a claims check (no medical/financial claims unless in the brief), and images through the provider's safety classifier before they can be published.
- **Cost transparency**: show provider cost per generation in Admin (already logged) and a per-org monthly cap.
- **Rate limits** on server actions and `/api/uploads`; **quotas** on HeyGen clone slots (10 per account, shared across all customers today — needs a per-workspace cap and a waitlist message).
- **Approvals for spend**: a "requires owner approval above $X/day" rule before *Publish active*.
- **Playwright smoke suite** for the golden path above, run on every deploy against sandbox providers.
- **Data**: nightly backups, R2 for storage in production (local disk today), migrations run in CI.

## 4. What I would do first, concretely

1. Meta Development access on a real account and the four-call smoke test (Phase 0).
2. "Add to campaign" on the creative page + preselect in the campaign form (1a, the part that pays off immediately).
3. Activity tray + finish emails (1d).
4. Sandbox banner + honest timings copy (0).
5. Then the campaign stepper and the Create menu.

Items 2–4 are two to three days of work and remove most of the "I don't know what to do next" feeling; the Phase 2 restructure is where the product starts to feel like one thing.
