import Link from "next/link";
import type { ReactNode } from "react";
import { SearchIcon, PlusIcon } from "./icons";

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: string;
  description?: ReactNode;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="workspace-page-header">
      <div>
        {eyebrow && <span className="workspace-eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="workspace-page-actions">{actions}</div>}
    </header>
  );
}
export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="workspace-section-header">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function EmptyState({
  icon,
  title,
  description,
  href,
  action,
  secondary,
}: {
  icon?: ReactNode;
  title: string;
  description: ReactNode;
  href?: string;
  action?: string;
  secondary?: ReactNode;
}) {
  return (
    <div className="workspace-empty">
      <div className="workspace-empty-icon">
        {icon ?? <PlusIcon width={24} height={24} />}
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      <div className="workspace-empty-actions">
        {href && action && (
          <Link href={href} className="btn btn-orange">
            <PlusIcon width={16} height={16} />
            {action}
          </Link>
        )}
        {secondary}
      </div>
    </div>
  );
}
export function CollectionSearch({
  action,
  query = "",
  placeholder,
  hidden = {},
}: {
  action: string;
  query?: string;
  placeholder: string;
  hidden?: Record<string, string>;
}) {
  return (
    <form action={action} className="collection-search" role="search">
      <SearchIcon width={17} height={17} />
      {Object.entries(hidden)
        .filter(([, v]) => v)
        .map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
      <input
        type="search"
        name="q"
        defaultValue={query}
        aria-label={placeholder}
        placeholder={placeholder}
      />
      <button type="submit" aria-label="Search">
        ↵
      </button>
    </form>
  );
}
