import { LegalArticle, legalMetadata } from "../legal-page";

// The policy shows PRIVACY_EMAIL and the site host from runtime env (lib/legal.ts), so render per request.
export const dynamic = "force-dynamic";
export const metadata = legalMetadata("privacy");

export default function PrivacyPage() {
  return <LegalArticle slug="privacy" />;
}
