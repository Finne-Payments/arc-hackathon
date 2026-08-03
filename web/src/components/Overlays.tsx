import { useEffect, useState } from "react";
import type { NotificationRow } from "../api";

/* ============================================================================
   Overlays — toast popups and notification toasts.
   The old DemoControls panel and StatusStrip (which used hardcoded demo data)
   have been removed. All data now comes from the live API.
   ========================================================================== */

/* ---- Toasts ---- */
export function Toasts({ exportToast, copied }: { exportToast: boolean; copied: boolean }) {
  const style: React.CSSProperties = {
    position: "fixed",
    left: "50%",
    bottom: 24,
    transform: "translateX(-50%)",
    zIndex: 70,
    background: "var(--ink-900)",
    color: "#fff",
    borderRadius: "var(--radius-pill)",
    padding: "8px 18px",
    fontSize: 13,
    boxShadow: "var(--shadow-lg)",
    whiteSpace: "nowrap",
  };
  return (
    <>
      {exportToast && <div style={style}>Audit export prepared · receipts, cases, decisions and chain anchors</div>}
      {copied && <div style={style}>Copied to clipboard</div>}
    </>
  );
}

/* ---- Notification toasts ---- */
export function NotificationToasts({ notifications }: { notifications: NotificationRow[] }) {
  const [shown, setShown] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<NotificationRow | null>(null);

  useEffect(() => {
    // Find the newest unread notification we haven't shown yet
    const fresh = notifications.find((n) => !n.readAt && !shown.has(n._id));
    if (fresh && !active) {
      setActive(fresh);
      setShown((s) => new Set(s).add(fresh._id));
      // Auto-dismiss after 5 seconds
      const timer = setTimeout(() => setActive(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notifications, shown, active]);

  if (!active) return null;

  const typeColor: Record<string, string> = {
    dispute: "var(--warn-500)",
    reply: "var(--ok-500)",
    decision: "var(--brand-600)",
    refund: "var(--risk-500)",
    info_request: "var(--warn-500)",
    payment: "var(--brand-500)",
    withdraw: "var(--ok-500)",
  };

  return (
    <div
      onClick={() => setActive(null)}
      style={{
        position: "fixed",
        right: 20,
        top: 60,
        zIndex: 80,
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderLeft: `4px solid ${typeColor[active.type] ?? "var(--brand-500)"}`,
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-lg)",
        padding: "14px 18px",
        maxWidth: 360,
        cursor: "pointer",
        animation: "riseIn .25s ease-out",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-fg)", marginBottom: 3 }}>{active.title}</div>
      <div style={{ fontSize: 12, color: "var(--color-fg-muted)", lineHeight: 1.5 }}>{active.body}</div>
      <div style={{ fontSize: 10, color: "var(--color-fg-subtle)", marginTop: 6 }}>{new Date(active.createdAt).toLocaleTimeString()}</div>
    </div>
  );
}
