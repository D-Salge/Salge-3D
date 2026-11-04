import type { ReactNode } from "react";

export function StudioPageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="studio-page-hero">
      <div>
        <p className="studio-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="studio-page-description">{description}</p>
      </div>
      {action && <div className="studio-page-action">{action}</div>}
    </header>
  );
}
