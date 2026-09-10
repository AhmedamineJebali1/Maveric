import type { ReactNode } from 'react';

export function Card({
  title,
  subtitle,
  actions,
  children,
  bodyClass,
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  bodyClass?: string;
}) {
  return (
    <section className="card">
      {title && (
        <header className="card__head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className={bodyClass ?? 'card__body'}>{children}</div>
    </section>
  );
}

export function LevelBadge({ level, label }: { level: string | null; label?: string }) {
  if (!level) return <span className="badge badge--draft">Brouillon</span>;
  return <span className={`badge badge--${level}`}>{label ?? level}</span>;
}

export function Errors({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return (
    <div className="alert alert--error">
      <strong>Impossible de valider cette étape :</strong>
      <ul>
        {errors.map((error) => (
          <li key={error}>{error}</li>
        ))}
      </ul>
    </div>
  );
}

export function Modal({
  title,
  children,
  onClose,
  actions,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  actions: ReactNode;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h3>{title}</h3>
        {children}
        <div className="modal__actions">{actions}</div>
      </div>
    </div>
  );
}

/** Rendu markdown minimal : titres ##, listes, gras — suffisant pour l'analyse produite. */
export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const inline = (value: string): ReactNode[] =>
    value.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
      part.startsWith('**') && part.endsWith('**') ? (
        <strong key={index}>{part.slice(2, -2)}</strong>
      ) : (
        <span key={index}>{part}</span>
      ),
    );

  const flush = () => {
    if (!list) return;
    const items = list.items.map((item, index) => <li key={index}>{inline(item)}</li>);
    blocks.push(
      list.ordered ? <ol key={blocks.length}>{items}</ol> : <ul key={blocks.length}>{items}</ul>,
    );
    list = null;
  };

  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    if (line.startsWith('## ')) {
      flush();
      blocks.push(<h2 key={blocks.length}>{line.slice(3)}</h2>);
      continue;
    }
    if (line.startsWith('# ')) {
      flush();
      blocks.push(<h2 key={blocks.length}>{line.slice(2)}</h2>);
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      if (!list || list.ordered) {
        flush();
        list = { ordered: false, items: [] };
      }
      list.items.push(bullet[1]);
      continue;
    }
    const numbered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (numbered) {
      if (!list || !list.ordered) {
        flush();
        list = { ordered: true, items: [] };
      }
      list.items.push(numbered[1]);
      continue;
    }
    flush();
    blocks.push(<p key={blocks.length}>{inline(line)}</p>);
  }
  flush();

  return <div className="markdown">{blocks}</div>;
}
