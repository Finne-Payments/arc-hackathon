import { useState, useEffect, useRef } from "react";
import type { Screen } from "../types";
import type { FinneActions } from "../useFinne";
import type { ApiData } from "../useApi";
import { api } from "../api";

/* ============================================================================
   TopBar — sticky header with search and the top-right cluster:
     - notification bell (moved here from the sidebar) with unread badge + panel
     - user-profile menu: avatar, display name, email, bound wallet, role, sign out
   ========================================================================== */

export function TopBar({
  roleLabel,
  roleDot,
  user,
  onLogout,
  apiData,
  actions,
}: {
  roleBadge: string; // kept for call-site compatibility; unused now
  roleDot: string;
  roleLabel: string;
  user?: { displayName: string; email: string; walletAddress: string | null } | null;
  onLogout?: () => void;
  apiData?: ApiData;
  actions: FinneActions;
}) {
  const [showNotif, setShowNotif] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const clusterRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside the top-right cluster
  useEffect(() => {
    if (!showNotif && !showProfile) return;
    const handler = (e: MouseEvent) => {
      if (clusterRef.current && !clusterRef.current.contains(e.target as Node)) {
        setShowNotif(false);
        setShowProfile(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showNotif, showProfile]);

  const unreadCount = apiData?.unreadCount ?? 0;
  const notifications = apiData?.notifications ?? [];
  const walletAddr = user?.walletAddress ?? null;
  const wb = apiData?.walletBalance ?? null;
  const initial = (user?.displayName ?? user?.email ?? "U").slice(0, 1).toUpperCase();

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
        {/* search */}
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

        {/* ---- top-right cluster: notifications + profile ---- */}
        <div ref={clusterRef} style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}>
          {/* Notification bell */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => {
                setShowNotif((s) => !s);
                setShowProfile(false);
                if (!showNotif && unreadCount > 0) api.markAllNotificationsRead().catch(() => {});
              }}
              aria-label="Notifications"
              style={{
                border: "1px solid var(--color-border)",
                background: showNotif ? "var(--brand-50)" : "var(--color-surface)",
                cursor: "pointer",
                width: 36,
                height: 36,
                borderRadius: "var(--radius-md)",
                color: "var(--color-fg-muted)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
              {unreadCount > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: -5,
                    right: -5,
                    background: "var(--risk-500)",
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 700,
                    borderRadius: "var(--radius-pill)",
                    padding: "1px 5px",
                    minWidth: 16,
                    textAlign: "center",
                    border: "2px solid #fff",
                  }}
                >
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotif && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  right: 0,
                  width: 320,
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                  boxShadow: "var(--shadow-lg)",
                  maxHeight: 380,
                  overflowY: "auto",
                  zIndex: 60,
                }}
              >
                <div style={{ padding: "10px 12px", fontSize: 12, fontWeight: 700, color: "var(--color-fg)", borderBottom: "1px solid var(--color-border)" }}>
                  Notifications
                </div>
                {notifications.length === 0 ? (
                  <div style={{ padding: "18px 12px", fontSize: 12, color: "var(--color-fg-subtle)", textAlign: "center" }}>
                    No notifications
                  </div>
                ) : (
                  notifications.slice(0, 12).map((n) => (
                    <div
                      key={n._id}
                      onClick={() => {
                        const target: Screen = n.caseNumber ? "case" : "receipt";
                        actions.go(target);
                        api.markNotificationRead(n._id).catch(() => {});
                        setShowNotif(false);
                      }}
                      style={{
                        padding: "10px 12px",
                        borderBottom: "1px solid var(--color-border)",
                        cursor: "pointer",
                        background: n.readAt ? "transparent" : "var(--brand-50)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        {!n.readAt && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--brand-600)", flexShrink: 0 }} />}
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-fg)" }}>{n.title}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--color-fg-muted)", lineHeight: 1.4 }}>{n.body}</div>
                      <div style={{ fontSize: 10, color: "var(--color-fg-subtle)", marginTop: 3 }}>
                        {new Date(n.createdAt).toLocaleString()}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Wallet balance pill — visible at-a-glance in the header */}
          {wb?.usdc != null && (
            <span
              title={`Wallet balance${wb.protected != null && Number(wb.protected) > 0 ? ` · ${wb.protected} USDC protected` : ""}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-pill)",
                padding: "5px 12px",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--color-fg)",
                background: "var(--color-surface)",
                whiteSpace: "nowrap",
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--ok-500)", flexShrink: 0 }} />
              <span style={{ fontFamily: "var(--font-mono)" }}>{wb.usdc}</span>
              <span style={{ color: "var(--color-fg-muted)", fontWeight: 500 }}>USDC</span>
            </span>
          )}

          {/* Profile button */}
          <button
            onClick={() => {
              setShowProfile((s) => !s);
              setShowNotif(false);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              border: "1px solid var(--color-border)",
              background: showProfile ? "var(--brand-50)" : "var(--color-surface)",
              cursor: "pointer",
              borderRadius: "var(--radius-pill)",
              padding: "3px 10px 3px 3px",
              color: "var(--color-fg)",
            }}
          >
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: roleDot,
                color: "#fff",
                fontSize: 12,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {initial}
            </span>
            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.15, minWidth: 0 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user?.displayName ?? "User"}
              </span>
              <span style={{ fontSize: 10.5, color: "var(--color-fg-subtle)" }}>{roleLabel}</span>
            </span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-fg-subtle)" }}>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {/* Profile dropdown */}
          {showProfile && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                right: 0,
                width: 280,
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                boxShadow: "var(--shadow-lg)",
                zIndex: 60,
                padding: 4,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 12px 10px" }}>
                <span
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: "50%",
                    background: roleDot,
                    color: "#fff",
                    fontSize: 15,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {initial}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--color-fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {user?.displayName ?? "User"}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--color-fg-subtle)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {user?.email}
                  </div>
                </div>
              </div>

              <div style={{ borderTop: "1px solid var(--color-border)", margin: "2px 8px", paddingTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                <ProfileRow label="Role" value={roleLabel} />
                <ProfileRow label="Balance" value={wb?.usdc != null ? `${wb.usdc} USDC` : "—"} mono />
                {wb?.protected != null && Number(wb.protected) > 0 && (
                  <ProfileRow label="Protected" value={`${wb.protected} USDC`} mono />
                )}
                {wb?.debt != null && Number(wb.debt) > 0 && (
                  <ProfileRow label="Debt" value={`${wb.debt} USDC`} mono />
                )}
                <ProfileRow label="Wallet" value={walletAddr ? `${walletAddr.slice(0, 6)}…${walletAddr.slice(-4)}` : "Not connected"} mono={!!walletAddr} ok={!!walletAddr} />
              </div>

              {onLogout && (
                <button
                  onClick={onLogout}
                  style={{
                    width: "calc(100% - 8px)",
                    margin: "8px 4px 4px",
                    border: "1px solid var(--color-border)",
                    background: "var(--color-surface)",
                    cursor: "pointer",
                    padding: "8px 10px",
                    fontSize: 12.5,
                    fontWeight: 600,
                    fontFamily: "var(--font-sans)",
                    borderRadius: "var(--radius-md)",
                    color: "var(--risk-600)",
                  }}
                >
                  Sign out
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProfileRow({ label, value, mono, ok }: { label: string; value: string; mono?: boolean; ok?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "5px 12px" }}>
      <span style={{ fontSize: 11, color: "var(--color-fg-subtle)", textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</span>
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: ok ? "var(--ok-600)" : "var(--color-fg-muted)",
          fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </span>
    </div>
  );
}
