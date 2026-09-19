import { LegalArticle, legalMetadata } from "../legal-page";

export const metadata = legalMetadata("dpa");

export default function DpaPage() {
  return <LegalArticle slug="dpa" />;
}
