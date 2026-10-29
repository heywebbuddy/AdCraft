# Third-party notices

Application dependencies below are
installed by `pnpm install` from the public npm registry and remain under their own
licences. Three of them carry terms the buyer must read before commercial use.

## Licences that place obligations on you

### Remotion — proprietary, source-available (`remotion`, `@remotion/*`)

Remotion renders the **product-video composition** (`packages/render/src/video`). It is
free for individuals and for organisations of up to three people. Larger organisations
need a paid Company Licence from <https://www.remotion.pro/license>, and because Adcraft
calls `renderMedia()` programmatically, such an organisation falls under Remotion's
"Automators" tier — metered per render with a monthly minimum.

Nothing about Adcraft changes this: the obligation is between you and Remotion AG, and it
applies to anyone who owns or operates the Remotion project, which after purchase is you.
Read <https://www.remotion.dev/docs/license/faq> before using the product-video feature
commercially.

**Not affected:** static ads, presenter/UGC video, publishing, performance and every other
feature. Use those features independently of product-video rendering. Do not delete renderer
source files as a way to disable the feature; there are direct imports into the video pipeline.

### FFmpeg — LGPL/GPL depending on build (`ffmpeg-static`, and binaries you install)

Presenter/UGC assembly shells out to FFmpeg. `ffmpeg-static` downloads a GPL-3.0 build at
install time; no FFmpeg binary ships inside this package. If you redistribute a build of
your deployment that embeds FFmpeg, GPL obligations attach to that distribution. The
simplest alternative is to install FFmpeg through your own OS package manager and point
`FFMPEG_PATH` at it.

### Satori and resvg — MPL-2.0 (`satori`, `@resvg/resvg-js`)

Used by the static-ad renderer. MPL-2.0 is file-level copyleft: using them as libraries
places no obligation on your own source. If you modify their source, those files must stay
MPL-2.0.

## Everything else

Run `pnpm licenses list --prod` for the installed dependency tree and review the
applicable upstream notices. This summary is not a replacement for their terms.

## Assets included in this package

| Asset | Source | Licence |
|---|---|---|
| Brand mark, UI icons, illustrations | Original work, sold with this item | Envato licence |
| Platform glyphs (Meta, TikTok, Instagram, YouTube, Facebook) | [Simple Icons](https://simpleicons.org) | CC0 1.0 |
| Google "G" glyph | Google sign-in brand glyph | Google brand guidelines |
| DM Sans, Instrument Serif and the other kit fonts | Google Fonts | SIL Open Font License 1.1 |
| Editable demo SVG under `apps/app/public/assets` | Original geometric placeholder artwork | Envato licence |

Bundled font copyright notices and license texts are in `packages/render/fonts/*-OFL.txt`.

Platform names and logos are trademarks of their owners. They appear only to identify the
service each integration connects to. Neither this item nor its author is affiliated with,
endorsed by or sponsored by Meta, TikTok, Google, Stripe, Anthropic, OpenAI, HeyGen,
ElevenLabs, Replicate, Runway or fal.ai.

Photographic demo images and videos shown in the item preview are preview-only.
They are not included in the buyer ZIP. Replace the editable placeholders with your own licensed media.
