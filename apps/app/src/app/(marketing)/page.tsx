import Link from "next/link";
import { Button } from "@adcraft/ui";

export default function MarketingPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="text-sm uppercase tracking-[0.2em] text-muted">Adcraft</p>
      <h1 className="font-serif text-5xl leading-tight text-ink md:text-6xl">
        Ads that look like <em className="text-orange">your brand</em>, made in minutes.
      </h1>
      <p className="max-w-xl text-lg text-muted">
        Upload a product, get on-brand static, video and UGC ads for every placement.
      </p>
      <Button asChild size="lg">
        <Link href="/sign-in">Sign in</Link>
      </Button>
    </main>
  );
}
