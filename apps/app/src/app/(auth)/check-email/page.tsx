import Link from "next/link";
import { Wordmark } from "@/components/spark";

/** Auth.js `verifyRequest` page: shown after a magic link is sent. */
export default function CheckEmailPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-[400px]">
        <div className="mb-8">
          <Wordmark size={26} />
        </div>
        <h1 className="text-[34px] font-medium leading-[1.05] tracking-[-1.6px]">
          Check your inbox.
          <br />
          <em className="font-serif not-italic text-orange">
            <span className="italic">Your link is on its way.</span>
          </em>
        </h1>
        <p className="mt-6 text-[15px] leading-relaxed text-muted">
          We sent a sign-in link to your email. It works once and expires in 24 hours. If it hasn’t arrived in a minute, check spam or request another.
        </p>
        <Link href="/sign-in" className="btn btn-outline mt-8 h-11 justify-between">
          Back to sign in <span aria-hidden="true">←</span>
        </Link>
      </div>
    </main>
  );
}
