import { LegalArticle, legalMetadata } from "../legal-page";

export const metadata = legalMetadata("privacy");

export default function PrivacyPage() {
  return <LegalArticle slug="privacy" />;
}
