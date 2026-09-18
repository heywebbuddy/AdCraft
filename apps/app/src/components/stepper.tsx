"use client";

/**
 * Numbered steps for a builder. The parent owns the current index and each step's
 * "done" state; panels that aren't current stay mounted but hidden, so a single form
 * keeps every field. Styles: workspace.css (.stp-*).
 */
export type StepDef = { id: string; title: string; summary?: string; done?: boolean; error?: string | null };

export function StepNav({ steps, current, onSelect }: { steps: StepDef[]; current: number; onSelect: (i: number) => void }) {
  return (
    <ol className="stp-nav" aria-label="Steps">
      {steps.map((s, i) => {
        const state = i === current ? "current" : s.done ? "done" : "todo";
        return (
          <li key={s.id} className={`stp-item ${state}`}>
            <button type="button" className="stp-btn" aria-current={i === current ? "step" : undefined} onClick={() => onSelect(i)}>
              <span className="stp-num" aria-hidden="true">{s.done && i !== current ? "✓" : String(i + 1).padStart(2, "0")}</span>
              <span className="stp-text">
                <strong>{s.title}</strong>
                {s.error ? <small className="stp-err">{s.error}</small> : s.summary ? <small>{s.summary}</small> : null}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function StepPanel({ active, title, lede, children }: { active: boolean; title: string; lede?: string; children: React.ReactNode }) {
  return (
    <section className="stp-panel" hidden={!active} aria-hidden={!active}>
      <header className="stp-panel-head">
        <h2>{title}</h2>
        {lede ? <p>{lede}</p> : null}
      </header>
      {children}
    </section>
  );
}

export function StepFooter({ index, count, onBack, onNext, nextLabel = "Continue", nextDisabled, note, children }: { index: number; count: number; onBack: () => void; onNext: () => void; nextLabel?: string; nextDisabled?: boolean; note?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="stp-footer">
      <span className="stp-note">{note}</span>
      <div className="stp-actions">
        {index > 0 ? <button type="button" className="btn btn-outline h-11" onClick={onBack}>← Back</button> : null}
        {children ?? (index < count - 1 ? <button type="button" className="btn btn-dark h-11" disabled={nextDisabled} onClick={onNext}>{nextLabel} →</button> : null)}
      </div>
    </div>
  );
}
