import type { Role } from "../types";

export function TopBar({ roleBadge, roleDot }: { roleBadge: string; roleDot: string }) {
  // roleBadge is the full label string; keep the search + role pill
  void (roleBadge as Role); // type-only touch so Role import is used
  return (
    <div
      className="topbar"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        background: "rgba(255,255,255,.88)",
        backdropFilter: "blur(8px)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "9px 28px" }}>
        <div
          style={{
            flex: 1,
            maxWidth: 420,
            display: "flex",
            alignItems: "center",
            gap: 9,
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            padding: "7px 12px",
            background: "var(--color-surface)",
            color: "var(--color-fg-subtle)",
            fontSize: 13,
          }}
        >
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          Search payments, cases, addresses
        </div>
        <span style={{ flex: 1 }} />
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-pill)",
            padding: "4px 12px",
            fontSize: 12,
            fontWeight: 500,
            color: "var(--color-fg-muted)",
            background: "var(--color-surface)",
            whiteSpace: "nowrap",
            maxWidth: "60vw",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: roleDot, flexShrink: 0 }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{roleBadge}</span>
        </span>
      </div>
    </div>
  );
}
