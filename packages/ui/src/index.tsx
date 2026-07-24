import type { ReactNode } from "react";

type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "critical";

export function PageHeader(props: { title: string; eyebrow?: string; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        {props.eyebrow ? <p className="eyebrow">{props.eyebrow}</p> : null}
        <h1>{props.title}</h1>
        {props.children ? <div className="page-header__body">{props.children}</div> : null}
      </div>
      {props.actions ? <div className="page-header__actions">{props.actions}</div> : null}
    </div>
  );
}

export function Card(props: { title?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={["card", props.className].filter(Boolean).join(" ")}>
      {props.title || props.actions ? (
        <div className="card__header">
          {props.title ? <h2>{props.title}</h2> : <div />}
          {props.actions ? <div className="card__actions">{props.actions}</div> : null}
        </div>
      ) : null}
      <div className="card__body">{props.children}</div>
    </section>
  );
}

export function Button(props: {
  children: ReactNode;
  href?: string;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  name?: string;
  value?: string;
  onClick?: () => void;
}) {
  const className = `button button--${props.variant ?? "secondary"}`;
  if (props.href) {
    return (
      <a className={className} href={props.href} aria-disabled={props.disabled}>
        {props.children}
      </a>
    );
  }
  return (
    <button className={className} type={props.type ?? "button"} disabled={props.disabled} name={props.name} value={props.value} onClick={props.onClick}>
      {props.children}
    </button>
  );
}

export function Badge(props: { children: ReactNode; tone?: Tone }) {
  return <span className={`badge badge--${props.tone ?? "neutral"}`}>{props.children}</span>;
}

export function DataTable(props: { children: ReactNode }) {
  return (
    <div className="table-shell">
      <table className="data-table">{props.children}</table>
    </div>
  );
}

export function DescriptionList(props: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="description-list">
      {props.items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Field(props: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{props.label}</span>
      {props.children}
      {props.hint ? <small>{props.hint}</small> : null}
    </label>
  );
}

export function TextInput(props: {
  name: string;
  defaultValue?: string | number | readonly string[];
  placeholder?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <input
      className="input"
      name={props.name}
      defaultValue={props.defaultValue}
      placeholder={props.placeholder}
      required={props.required}
      type={props.type ?? "text"}
    />
  );
}

export function TextArea(props: { name: string; defaultValue?: string; placeholder?: string; required?: boolean; rows?: number }) {
  return (
    <textarea
      className="input textarea"
      name={props.name}
      defaultValue={props.defaultValue}
      placeholder={props.placeholder}
      required={props.required}
      rows={props.rows ?? 5}
    />
  );
}

export function Select(props: {
  name: string;
  defaultValue?: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <select className="input select" name={props.name} defaultValue={props.defaultValue} required={props.required}>
      {props.children}
    </select>
  );
}

export function EmptyState(props: { title: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      <strong>{props.title}</strong>
      {props.children ? <p>{props.children}</p> : null}
    </div>
  );
}

export function Metric(props: { label: string; value: ReactNode; tone?: Tone }) {
  return (
    <div className={`metric metric--${props.tone ?? "neutral"}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

export function JsonBlock(props: { value: unknown }) {
  return <pre className="json-block">{JSON.stringify(props.value, null, 2)}</pre>;
}
