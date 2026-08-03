import type { CSSProperties, ReactNode } from "react";

/* ============================================================================
   Small, framework-free UI primitives that match the prototype's inline style.
   Kept tiny on purpose — the prototype styles things inline, and these
   components let screens stay readable while preserving the exact look.
   ========================================================================== */

const DOT_COLORS: Record<string, string> = {
  warn: "var(--warn-500)",
  brand: "var(--brand-500)",
  ok: "var(--ok-500)",
  risk: "var(--risk-500)",
  ink: "var(--ink-400)",
};

export type DotColor = keyof typeof DOT_COLORS;

export function StatusPill({
  label,
  dot,
  style,
}: {
  label: string;
  dot: DotColor;
  style?: CSSProperties;
}) {
  return (
    <span
      className="status-pill"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        border: "1px solid var(--color-border)",
        background: "var(--color-surface)",
        borderRadius: "var(--radius-pill)",
        padding: "3px 10px",
        fontSize: 12,
        fontWeight: 500,
        ...style,
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: DOT_COLORS[dot] }} />
      {label}
    </span>
  );
}

/** Uppercase mono section/field label (the `.e-label` role). */
export function Eyebrow({
  children,
  color = "var(--brand-600)",
  style,
}: {
  children: ReactNode;
  color?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        fontFamily: "var(--font-mono)",
        fontWeight: 600,
        fontSize: 11,
        letterSpacing: ".08em",
        textTransform: "uppercase",
        color,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Truncated, copyable address / id chip with an explorer link. */
export function TechChip({
  short,
  full,
  onCopy,
  explorer,
}: {
  short: string;
  full?: string;
  onCopy?: (value: string) => void;
  /** Full explorer URL (tx or address) — opens in a new tab when provided. */
  explorer?: string | undefined;
}) {
  return (
    <>
      {full ? (
        <span
          title="Copy"
          onClick={() => onCopy?.(full)}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            background: "var(--ink-100)",
            border: full.startsWith("0x") ? "1px solid var(--ink-150)" : "none",
            borderRadius: 6,
            padding: full.startsWith("0x") ? "2px 8px" : "1px 7px",
            cursor: "pointer",
            color: "var(--ink-700)",
          }}
        >
          {short}
        </span>
      ) : (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--ink-700)",
          }}
        >
          {short}
        </span>
      )}
      {explorer && (
        <a
          href={explorer}
          target="_blank"
          rel="noopener noreferrer"
          title="View on explorer"
          style={{ fontSize: 13, cursor: "pointer", textDecoration: "none", lineHeight: 1 }}
        >
          ↗
        </a>
      )}
    </>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  style,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        background: disabled ? "var(--ink-100)" : "var(--brand-600)",
        color: disabled ? "var(--color-fg-subtle)" : "#fff",
        fontFamily: "var(--font-sans)",
        fontWeight: 600,
        fontSize: 14,
        padding: "10px 18px",
        borderRadius: "var(--radius-md)",
        boxShadow: disabled ? "none" : "var(--shadow-sm)",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  disabled,
  style,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        border: "1.5px solid var(--ink-200)",
        background: "var(--color-surface)",
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "var(--font-sans)",
        fontWeight: 600,
        fontSize: 14,
        padding: "10px 18px",
        borderRadius: "var(--radius-md)",
        color: "var(--color-fg)",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function BackLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <a
      onClick={onClick}
      style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}
    >
      ← {label}
    </a>
  );
}

/** Card container used for most panels. */
export function Card({
  children,
  shadow = "var(--shadow-xs)",
  padding = "22px 24px",
  style,
}: {
  children: ReactNode;
  shadow?: string;
  padding?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: shadow,
        padding,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** "Identical view · both sides see this page" reassurance pill. */
export function SharedViewBadge() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        background: "var(--brand-50)",
        border: "1px solid var(--brand-200)",
        borderRadius: "var(--radius-pill)",
        padding: "4px 12px",
        fontSize: 12,
        fontWeight: 500,
        color: "var(--brand-800)",
        whiteSpace: "nowrap",
      }}
    >
      <svg
        width={13}
        height={13}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      Identical view · both sides see this page
    </span>
  );
}

/* ============================================================================
   Spinner — the ONE loading indicator for the whole app.
   Every blockchain wait (approve, pay, sign, withdraw), every async API call,
   and every data fetch uses this so the user always sees the same "something
   is happening, wait" signal. Reuses the global `spin` keyframe.
   ========================================================================== */

/** A circular spinner. Inline by default; pair with a label for context. */
export function Spinner({
  size = 36,
  color = "var(--brand-600)",
  track = "var(--brand-200)",
  thickness = 3,
  style,
}: {
  size?: number;
  color?: string;
  track?: string;
  thickness?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `${thickness}px solid ${track}`,
        borderTopColor: color,
        animation: "spin 0.8s linear infinite",
        ...style,
      }}
    />
  );
}

/**
 * A small inline spinner + label, for "waiting on the chain / wallet / server"
 * moments inside a button row or status line.
 */
export function SpinnerLabel({
  label,
  size = 16,
  color = "var(--brand-600)",
}: {
  label: string;
  size?: number;
  color?: string;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 500, color }}>
      <Spinner size={size} color={color} track="var(--color-border)" thickness={2} />
      {label}
    </span>
  );
}

/**
 * A centered spinner card for moments where the whole panel is waiting on the
 * blockchain (e.g. watching a tx confirm). `label` is the human line ("Waiting
 * for your wallet signature"); `sub` is optional smaller detail.
 */
export function SpinnerOverlay({
  label,
  sub,
  color = "var(--brand-600)",
}: {
  label: string;
  sub?: string;
  color?: string;
}) {
  return (
    <Card
      shadow="var(--shadow-md)"
      padding="36px"
      style={{ textAlign: "center" }}
    >
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
        <Spinner size={44} color={color} />
      </div>
      <div style={{ fontFamily: "var(--font-sans)", fontWeight: 700, fontSize: 17, marginBottom: 6 }}>{label}</div>
      {sub && <div style={{ fontSize: 13, color: "var(--color-fg-muted)", maxWidth: 420, margin: "0 auto", lineHeight: 1.6 }}>{sub}</div>}
    </Card>
  );
}
