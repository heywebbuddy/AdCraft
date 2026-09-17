/**
 * Transactional email in the app's design language: paper ground, ink text, the ✳ spark
 * wordmark, a serif italic line, one orange button. Table-based and inline-styled so it
 * renders the same in Gmail, Outlook and Apple Mail. Works without images.
 */

const tokens = {
  paper: "#f7f8f5",
  card: "#ffffff",
  ink: "#242521",
  muted: "#66685f",
  line: "#e7e8e2",
  orange: "#e65c32",
  orangeText: "#c94823",
};

// Single quotes: these land inside double-quoted style attributes.
const sans = `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`;
const serif = `'Instrument Serif', Georgia, 'Times New Roman', serif`;

export type EmailContent = {
  /** Preheader / preview text. */
  preview: string;
  /** Large heading, sans. */
  title: string;
  /** Italic serif line under the heading, in orange. */
  kicker?: string;
  /** Paragraphs of body copy (plain text; escaped). */
  paragraphs: string[];
  cta?: { label: string; url: string };
  /** Small print under the button. */
  note?: string;
  /** Footer line, e.g. the workspace name or host. */
  footer?: string;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function renderEmail(c: EmailContent): { html: string; text: string } {
  const paragraphs = c.paragraphs.map((p) => `<p style="margin:0 0 14px;font:400 15px/1.6 ${sans};color:${tokens.ink}">${esc(p)}</p>`).join("");
  const button = c.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px"><tr><td style="border-radius:8px;background:${tokens.orange}">
        <a href="${esc(c.cta.url)}" style="display:inline-block;padding:13px 22px;font:600 14px/1 ${sans};color:#ffffff;text-decoration:none;border-radius:8px">${esc(c.cta.label)} &nbsp;↗</a>
      </td></tr></table>
      <p style="margin:0 0 6px;font:400 12px/1.6 ${sans};color:${tokens.muted}">Or paste this link into your browser:<br><a href="${esc(c.cta.url)}" style="color:${tokens.orangeText};word-break:break-all">${esc(c.cta.url)}</a></p>`
    : "";
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(c.title)}</title>
</head>
<body style="margin:0;padding:0;background:${tokens.paper}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(c.preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${tokens.paper}">
<tr><td align="center" style="padding:40px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">
    <tr><td style="padding:0 6px 18px">
      <span style="font:700 22px/1 ${sans};letter-spacing:-0.6px;color:${tokens.ink}"><span style="color:${tokens.orange}">&#10035;</span>&nbsp;adcraft<span style="color:${tokens.orange}">.</span></span>
    </td></tr>
    <tr><td style="background:${tokens.card};border:1px solid ${tokens.line};border-radius:12px;padding:34px 32px 28px">
      <h1 style="margin:0 0 4px;font:500 28px/1.15 ${sans};letter-spacing:-1px;color:${tokens.ink}">${esc(c.title)}</h1>
      ${c.kicker ? `<p style="margin:0 0 22px;font:italic 400 24px/1.2 ${serif};color:${tokens.orangeText}">${esc(c.kicker)}</p>` : `<div style="height:16px"></div>`}
      ${paragraphs}
      ${button}
      ${c.note ? `<p style="margin:18px 0 0;padding-top:16px;border-top:1px solid ${tokens.line};font:400 12px/1.6 ${sans};color:${tokens.muted}">${esc(c.note)}</p>` : ""}
    </td></tr>
    <tr><td style="padding:18px 6px 0;font:400 11px/1.6 ${sans};color:${tokens.muted}">
      ${c.footer ? esc(c.footer) + " · " : ""}Adcraft Studio
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
  const text = [c.title, c.kicker, "", ...c.paragraphs, c.cta ? `\n${c.cta.label}: ${c.cta.url}` : "", c.note ? `\n${c.note}` : ""].filter((l) => l !== undefined).join("\n");
  return { html, text };
}
