import Link from "next/link";
import { ArrowIcon, BrandIcon, PlayIcon, TeamIcon } from "@/components/icons";
import { Spark } from "@/components/spark";

const tools = [
  { title: "My characters", href: "/characters?view=characters", Icon: TeamIcon, tone: "peach", description: "Generate a face, start from a photo or description, or clone a real person.", detail: "AI characters · Digital twins" },
  { title: "Cast library", href: "/characters?view=presenters", Icon: PlayIcon, tone: "sage", description: "Find your on-camera match. Explore presenters and their ready-made looks.", detail: "Browse · Preview · Cast" },
  { title: "Design a look", href: "/characters?view=looks", Icon: BrandIcon, tone: "lavender", description: "A fresh setting for a familiar face. Use look packs, remix a look or describe your own.", detail: "Look packs · Templates · Remix" },
  { title: "Voice library", href: "/characters?view=voices", Icon: VoiceIcon, tone: "sand", description: "Audition a voice, clone your own recording or design a new voice from words.", detail: "Discover · Clone · Design" },
];

function VoiceIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="M3 10v4m4-8v12m5-16v20m5-16v12m4-8v4" /></svg>;
}

export function StudioLaunchpad() {
  return <section className="dash-studio" aria-labelledby="studio-heading">
    <div className="dash-studio-banner">
      <div className="dash-studio-copy">
        <span className="dash-kicker"><Spark size={15} /> MEET YOUR EXPANDED CHARACTER STUDIO</span>
        <h2 id="studio-heading">A familiar face.<br /><em>A whole new story.</em></h2>
        <p>Your characters, their looks, your voice. Bring them together in a video ad that feels like your brand.</p>
        <div className="dash-studio-actions">
          <Link href="/characters" className="btn btn-dark">Create a character ad <ArrowIcon width={15} height={15} /></Link>
          <Link href="/characters?view=templates" className="dash-text-link">Explore story templates <ArrowIcon width={14} height={14} /></Link>
        </div>
      </div>
      <div className="dash-studio-art" aria-hidden="true">
        <div className="dash-art-orbit" />
        <div className="dash-script-note"><span>THE STORY</span><strong>A little introduction.<br />A lasting impression.</strong><i /><i /><i /></div>
        <div className="dash-presenter"><span>CHARACTER STUDIO</span><div className="dash-presenter-caption">Your next<br /><em>brand storyteller.</em></div><small>ILLUSTRATIVE PREVIEW</small></div>
        <div className="dash-voice-note"><span className="dash-voice-symbol"><VoiceIcon /></span><div><strong>A voice of your own</strong><span>Clone it. Design it. Make it yours.</span></div></div>
        <Spark className="dash-art-spark" size={48} />
      </div>
    </div>
    <div className="dash-tool-grid">
      {tools.map(({ title, href, Icon, tone, description, detail }) => <Link href={href} key={title} className={`dash-tool dash-tool-${tone}`}>
        <div className="dash-tool-top"><span className="dash-tool-icon"><Icon /></span><ArrowIcon width={16} height={16} /></div>
        <h3>{title}</h3><p>{description}</p><span className="dash-tool-detail">{detail}</span>
      </Link>)}
    </div>
    <div className="dash-studio-foot"><span>One cast. Every campaign.</span><span>Reusable profiles <b>·</b> Voice auditions <b>·</b> Motion &amp; gestures <b>·</b> Editable scripts</span></div>
  </section>;
}
