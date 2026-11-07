import nodemailer from "nodemailer";

/**
 * One way to send email, whichever provider is configured.
 *
 * SMTP wins when SMTP_HOST is set (any provider: Amazon SES, Mailgun, Postmark, Google
 * Workspace, your own server). Otherwise Resend is used when RESEND_API_KEY is set. With
 * neither, email is off and callers fall back to showing links.
 *
 *   SMTP_HOST, SMTP_PORT (587 STARTTLS, 465 TLS), SMTP_USER, SMTP_PASS, SMTP_SECURE (optional)
 *   EMAIL_FROM  – sender shown to recipients (must be allowed by the provider)
 */
const DEFAULT_FROM = "Adcraft <onboarding@resend.dev>";

export function emailProvider(): "smtp" | "resend" | null {
  if ((process.env.SMTP_HOST ?? "").trim()) return "smtp";
  if ((process.env.RESEND_API_KEY ?? "").trim()) return "resend";
  return null;
}

export const emailEnabled = () => emailProvider() !== null;

export function emailFrom(): string {
  return process.env.EMAIL_FROM || (emailProvider() === "smtp" ? process.env.SMTP_USER || DEFAULT_FROM : DEFAULT_FROM);
}

export type OutgoingEmail = { to: string | string[]; subject: string; html: string; text: string };

/** Throws with the provider's message on failure; callers decide whether that matters. */
export async function sendEmail(msg: OutgoingEmail, from = emailFrom()): Promise<void> {
  const provider = emailProvider();
  if (provider === "smtp") {
    const port = Number.parseInt(process.env.SMTP_PORT ?? "", 10) || 587;
    const secure = process.env.SMTP_SECURE ? ["1", "true", "yes"].includes(process.env.SMTP_SECURE.toLowerCase()) : port === 465;
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST!.trim(),
      port,
      secure,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    await transport.sendMail({ from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text });
    return;
  }
  if (provider === "resend") {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Resend error ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return;
  }
  throw new Error("Email is not configured (set SMTP_HOST or RESEND_API_KEY).");
}
