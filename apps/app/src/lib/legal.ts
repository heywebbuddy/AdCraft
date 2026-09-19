/** Shared copy for /privacy, /terms and /dpa. Counsel should review before paid launch. */
export const LEGAL_UPDATED = "19 September 2026";
export const LEGAL_CONTACT = {
  privacy: "privacy@adcraft.app",
  support: "support@adcraft.app",
} as const;

export type LegalSection = { heading: string; paragraphs: string[]; bullets?: string[] };
export type LegalDoc = { slug: "privacy" | "terms" | "dpa"; title: string; kicker: string; lede: string; sections: LegalSection[] };

export const LEGAL_DOCS: Record<LegalDoc["slug"], LegalDoc> = {
  privacy: {
    slug: "privacy",
    title: "Privacy policy",
    kicker: "How we handle your data",
    lede: "Adcraft is an AI ad studio. This page explains what we collect, who sees it, and how to ask us to delete it. It is written for the product as it works today.",
    sections: [
      {
        heading: "Who we are",
        paragraphs: [
          "Adcraft (“we”, “us”) operates the website and studio at adcraft.app and related domains. For questions about this policy, write to privacy@adcraft.app.",
          "If you use Adcraft for a brand or agency, you are the controller of your workspace data. We process it to provide the service. The Data processing addendum at /dpa applies when you need processor terms.",
        ],
      },
      {
        heading: "What we collect",
        paragraphs: ["We collect only what the studio needs to run."],
        bullets: [
          "Account: name, email, sign-in method (magic link or Google), and workspace membership.",
          "Workspace: brand kits, product photos, logos, briefs, concepts, copy, creatives, comments, approvals and share links.",
          "Generations: prompts, model choices, outputs, and the credit and cost records we keep to run billing and support.",
          "Ad connections: if you connect Meta, TikTok or Google, we store encrypted tokens and the campaign objects those APIs return.",
          "Usage: pages you open, jobs you start, and security logs (IP, user agent) needed to keep the service safe.",
          "Billing: if Stripe is connected later, we store customer and subscription ids. Card numbers stay with Stripe.",
        ],
      },
      {
        heading: "How we use it",
        paragraphs: [
          "We use this data to create and store ads, run your workspace, send sign-in and job-finished email, enforce credits and guardrails, prevent abuse, and improve reliability.",
          "We do not sell personal data. We do not use your product photos or ads to train a public foundation model of our own. Third-party AI providers process the inputs you send so they can return a result; their own terms apply to that hop.",
        ],
      },
      {
        heading: "Who we share it with",
        paragraphs: ["Processors see only what they need to do their job."],
        bullets: [
          "Hosting and database: Railway and Postgres.",
          "Files: Cloudflare R2 when configured, otherwise disk on the app server.",
          "Jobs: Inngest.",
          "Email: Resend.",
          "AI: the providers you (or we) enable — today that can include Anthropic, OpenAI, fal.ai, xAI, ElevenLabs, HeyGen and others listed in Admin → Providers.",
          "Ad platforms: only after you connect an account, and only to publish or read the campaigns you asked for.",
          "Authorities: if the law requires it.",
        ],
      },
      {
        heading: "How long we keep it",
        paragraphs: [
          "Workspace content stays until you delete it or ask us to delete the workspace. Audit logs, credit ledgers and security logs are kept as long as we need them to run the product, settle disputes and meet legal duties — typically up to 24 months after a workspace is closed, unless a longer hold is required.",
          "Backups, if we take them, age out on a short cycle (about 14 days).",
        ],
      },
      {
        heading: "Your rights",
        paragraphs: [
          "Depending on where you live (including the GDPR and similar laws), you can ask to access, correct, export or delete personal data, or object to some processing. Workspace owners can request deletion of a workspace under Settings → Privacy. Anyone can write to privacy@adcraft.app. We will reply within 30 days.",
          "If we cannot verify the request, we will say so and ask for enough detail to find the right account.",
        ],
      },
      {
        heading: "Cookies and sign-in",
        paragraphs: [
          "We use essential cookies for the session and, in the browser, a local theme preference (adcraft-theme). We do not run advertising cookies or a third-party analytics pixel on the studio today.",
        ],
      },
      {
        heading: "Children and likeness",
        paragraphs: [
          "Adcraft is for people 18 and over. Do not upload photos or footage of children. Custom presenters and voice clones require the person on camera (or their authorised representative) to consent. Fictional characters you generate are your responsibility to use lawfully.",
        ],
      },
      {
        heading: "International transfers",
        paragraphs: [
          "We and our processors may store or process data in more than one country, including the United States, the EU and the Asia-Pacific region (our R2 media bucket is in APAC). Where a transfer needs a safeguard, we rely on the processor’s standard contractual clauses or an equivalent mechanism.",
        ],
      },
      {
        heading: "Changes",
        paragraphs: [
          "If this policy changes in a material way, we will update the date at the top and, when we can, note it in the product. Continued use after that date is acceptance of the new policy.",
        ],
      },
    ],
  },
  terms: {
    slug: "terms",
    title: "Terms of use",
    kicker: "The rules of the studio",
    lede: "These terms cover the Adcraft website and studio. By creating a workspace or using the site, you agree to them.",
    sections: [
      {
        heading: "The service",
        paragraphs: [
          "Adcraft helps you turn brand assets and briefs into ad creative (static, video and UGC-style), review it, and — when ad-platform credentials are live — publish and track campaigns. Some features stay in sandbox until those platforms approve the app.",
          "We may change, pause or discontinue parts of the service. If we close something you rely on, we will say so with reasonable notice where we can.",
        ],
      },
      {
        heading: "Accounts and workspaces",
        paragraphs: [
          "You must be 18 or older and able to form a contract. You are responsible for the people you invite and for keeping sign-in details safe.",
          "The workspace owner is responsible for the content and for any ads published from that workspace. If you use Adcraft for a client, you confirm you have the right to upload their brand and to run ads for them.",
        ],
      },
      {
        heading: "Credits, plans and fees",
        paragraphs: [
          "Generation uses credits. Unused subscription credits do not have to roll over unless a plan says they do. Ad spend on Meta, TikTok or Google is billed by those platforms, never through Adcraft.",
          "Paid billing through Stripe is not live yet. When it is, fees, taxes and refunds will follow the plan page and the Stripe invoice. We may grant or adjust credits for trials, failures or goodwill.",
        ],
      },
      {
        heading: "Your content and our licence",
        paragraphs: [
          "You keep the rights you already have in your brand assets, briefs and finished ads. You grant Adcraft a licence to host, process, render and display that content so we can run the service — including sending it to the AI and ad providers you use.",
          "Outputs are generated by models we do not control. You are responsible for reviewing them (claims, likeness, trademarks, music, disclosures) before you publish. We do not warrant that an output is unique, accurate or cleared for every platform.",
        ],
      },
      {
        heading: "Acceptable use",
        paragraphs: [
          "Do not use Adcraft to break the law, to impersonate a real person without consent, to make ads for children, to generate sexual content involving minors, or to attack, spam or scrape the service. We may suspend a workspace that does.",
        ],
      },
      {
        heading: "Platforms and third parties",
        paragraphs: [
          "Meta, TikTok, Google, HeyGen, ElevenLabs and other providers have their own terms. If they reject an ad, revoke a token or change an API, that is between you and them. Sandbox accounts are simulated; do not treat sandbox numbers as live spend.",
        ],
      },
      {
        heading: "Availability and liability",
        paragraphs: [
          "The studio is provided “as is”. We work to keep it up, but AI jobs can fail, queues can back up, and a single-server render path can slow down under load.",
          "To the fullest extent the law allows, Adcraft is not liable for lost profits, lost ads, platform bans or indirect damages. Our total liability for a claim is limited to the fees you paid us in the three months before it arose, or fifty US dollars if you have not paid us.",
        ],
      },
      {
        heading: "Ending the service",
        paragraphs: [
          "You can stop using Adcraft at any time. Workspace owners can request deletion under Settings → Privacy. We can suspend or close a workspace that breaks these terms. After closure we delete or anonymise content as described in the privacy policy.",
        ],
      },
      {
        heading: "Law",
        paragraphs: [
          "These terms are governed by the laws of the country in which Adcraft is established, without regard to conflict-of-law rules. Courts there have exclusive jurisdiction, except that either party may seek injunctive relief anywhere to protect intellectual property or confidential information.",
          "If a section is unenforceable, the rest still applies. These terms are the whole agreement for the studio.",
        ],
      },
    ],
  },
  dpa: {
    slug: "dpa",
    title: "Data processing addendum",
    kicker: "Processor terms",
    lede: "This addendum applies when you (the customer) act as a controller and Adcraft processes personal data in your workspace to provide the studio. It sits on top of the terms of use.",
    sections: [
      {
        heading: "Roles",
        paragraphs: [
          "You are the controller of personal data you put in a workspace (team emails, comments, and any personal data in brand assets or ads). Adcraft is the processor. Each of us will also process some data as an independent controller — for example, we control account records needed to operate sign-in and billing.",
        ],
      },
      {
        heading: "What we process",
        paragraphs: [
          "Subject matter: hosting and generating advertising creative. Duration: the life of the workspace plus the short backup and log window in the privacy policy. Nature: storage, generation, rendering, publishing at your instruction, and support. Types of data: account identifiers, brand and product media, prompts, outputs, comments, and ad-account tokens. Data subjects: your team, reviewers, and any people depicted in assets you upload.",
        ],
      },
      {
        heading: "Instructions",
        paragraphs: [
          "We process that data only to provide Adcraft, as described in the product and these legal pages, or as required by law. If a legal demand would stop us following your instructions, we will tell you unless the law forbids it.",
        ],
      },
      {
        heading: "Security",
        paragraphs: [
          "We use access control, encrypted connections, encrypted ad-account tokens, and org-scoped object keys. Files live in R2 when configured. No security programme is perfect; you should not put secrets or government-id numbers in briefs or prompts.",
        ],
      },
      {
        heading: "Sub-processors",
        paragraphs: [
          "We use the processors listed in the privacy policy (hosting, storage, email, jobs, AI and ad platforms). We will not add a sub-processor that materially changes where customer content goes without updating that list. You authorise those sub-processors. AI and ad platforms only receive content when a job or a publish action needs them.",
        ],
      },
      {
        heading: "Assistance",
        paragraphs: [
          "We will help you answer data-subject requests that concern data in our systems, and we will notify you without undue delay if we become aware of a personal-data breach affecting your workspace.",
          "You can request deletion of a workspace in the product. After we confirm the owner, we delete or anonymise workspace content from the live database and object storage, then from backups as they rotate.",
        ],
      },
      {
        heading: "International transfers",
        paragraphs: [
          "Where we transfer personal data out of the UK or EEA, we rely on the EU/UK standard contractual clauses with our processors, or another lawful mechanism. The clauses (module two, controller to processor, as published by the European Commission) are incorporated by reference if they apply to you.",
        ],
      },
      {
        heading: "Audits",
        paragraphs: [
          "On written request, and no more than once a year unless a breach requires it, we will provide a written summary of our security measures. On-site audits are by agreement and at your cost, and must not interrupt other customers.",
        ],
      },
    ],
  },
};

export const LEGAL_NAV: Array<{ href: string; label: string; slug: LegalDoc["slug"] }> = [
  { href: "/privacy", label: "Privacy", slug: "privacy" },
  { href: "/terms", label: "Terms", slug: "terms" },
  { href: "/dpa", label: "DPA", slug: "dpa" },
];
