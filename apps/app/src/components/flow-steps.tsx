import Link from "next/link";

/**
 * The one-line map of the creation flow, shown at the top of each step so a user always
 * knows where they are: Brief → Ideas → Ad → Campaign. Styles: workspace.css (.flow-*).
 */
export type FlowStage = "brief" | "ideas" | "ad" | "campaign";

const STAGES: Array<{ id: FlowStage; label: string }> = [
  { id: "brief", label: "Brief" },
  { id: "ideas", label: "Ideas" },
  { id: "ad", label: "Ad" },
  { id: "campaign", label: "Campaign" },
];

export function FlowSteps({ current, links = {}, format }: { current: FlowStage; links?: Partial<Record<FlowStage, string>>; format?: string | null }) {
  const idx = STAGES.findIndex((s) => s.id === current);
  return (
    <nav className="flow" aria-label="Where you are">
      {format ? <span className="flow-format">{format}</span> : null}
      <ol className="flow-steps">
        {STAGES.map((s, i) => {
          const state = i < idx ? "done" : i === idx ? "current" : "todo";
          const href = links[s.id];
          const body = <><span className="flow-num" aria-hidden="true">{i < idx ? "✓" : i + 1}</span>{s.label}</>;
          return (
            <li key={s.id} className={`flow-step ${state}`} aria-current={i === idx ? "step" : undefined}>
              {href && i !== idx ? <Link href={href}>{body}</Link> : <span>{body}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
