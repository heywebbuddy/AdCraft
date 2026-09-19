import { LegalArticle, legalMetadata } from "../legal-page";

export const metadata = legalMetadata("terms");

export default function TermsPage() {
  return <LegalArticle slug="terms" />;
}
