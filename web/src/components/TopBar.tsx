import { useState, useEffect, useRef, useCallback } from "react";
import type { FinneActions } from "../useFinne";
import type { ApiData } from "../useApi";
import { api } from "../api";
import { PAYMENT_WORD, shortHex } from "../mappers";

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
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const clusterRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  // Fresh wallet balance, fetched when the profile dropdown opens. The cached
  // value from useApi.refresh() can be stale (it only re-fetches on screen
  // change), so we override it here the moment the user looks at their balance.
  const [freshBalance, setFreshBalance] = useState<ApiData["walletBalance"]>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const refreshBalance = useCallback(async () => {
    setBalanceLoading(true);
    try {
      const wb = await api.walletBalance();
      setFreshBalance(wb);
    } catch {
      setFreshBalance(null);
    } finally {
      setBalanceLoading(false);
    }
  }, []);
  useEffect(() => {
    if (showProfile) void refreshBalance();
  }, [showProfile, refreshBalance]);

  // Close dropdowns when clicking outside the top-right cluster OR the search box.
  useEffect(() => {
    if (!showNotif && !showProfile && !showSearch) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      const outsideCluster = clusterRef.current && !clusterRef.current.contains(t);
      const outsideSearch = searchRef.current && !searchRef.current.contains(t);
      if (outsideCluster && outsideSearch) {
        setShowNotif(false);
        setShowProfile(false);
        setShowSearch(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showNotif, showProfile, showSearch]);

  const unreadCount = apiData?.unreadCount ?? 0;
  const notifications = apiData?.notifications ?? [];
  const walletAddr = user?.walletAddress ?? null;
  // Prefer the fresh balance (fetched on profile open); fall back to the cached
  // value from useApi. This keeps the profile balance current without polling.
  const wb = freshBalance ?? apiData?.walletBalance ?? null;
  const initial = (user?.displayName ?? user?.email ?? "U").slice(0, 1).toUpperCase();

  // Client-side search across payouts + cases + the wallet/tx addresses on each.
  const q = searchQuery.trim().toLowerCase();
  const payments = q
    ? (apiData?.payouts ?? []).filter((p) =>
        [p.paymentId, p.platformKey, p.recipientKey, p.recipientWallet, p.refundTo, p.txHash, p.amount, p.workOrderRef, p.status].some(
          (v) => v && v.toLowerCase().includes(q),
        ),
      ).slice(0, 6)
    : [];
  const cases = q
    ? (apiData?.cases ?? []).filter((c) =>
        [c.caseNumber, c.payoutRef, c.allegationFreeText, c.allegationClaimType, c.allegationAmountContested, c.status, c.openedBy].some(
          (v) => v && v.toLowerCase().includes(q),
        ),
      ).slice(0, 6)
    : [];
  const hasResults = payments.length > 0 || cases.length > 0;
  const closeSearch = () => {
    setSearchQuery("");
    setShowSearch(false);
  };
  const openFirstResult = () => {
    if (payments[0]) {
      actions.viewReceipt(payments[0].paymentId);
      closeSearch();
    } else if (cases[0]) {
      actions.viewCase(cases[0].caseNumber);
      closeSearch();
    }
  };

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
        <div ref={searchRef} style={{ position: "relative", flex: 1, maxWidth: 420 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              border: `1px solid ${searchQuery ? "var(--brand-400)" : "var(--color-border)"}`,
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
            <input
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowSearch(true);
              }}
              onFocus={() => setShowSearch(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") openFirstResult();
                if (e.key === "Escape") closeSearch();
              }}
              placeholder="Search payments, cases, addresses"
              style={{ border: "none", outline: "none", flex: 1, fontSize: 13, background: "transparent", color: "var(--color-fg)" }}
            />
            {searchQuery && (
              <a
                onClick={closeSearch}
                title="Clear"
                style={{ cursor: "pointer", fontSize: 15, color: "var(--color-fg-subtle)", lineHeight: 1 }}
              >
                ×
              </a>
            )}
          </div>

          {showSearch && q && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                left: 0,
                right: 0,
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                boxShadow: "var(--shadow-lg)",
                maxHeight: 420,
                overflowY: "auto",
                zIndex: 70,
                padding: 4,
              }}
            >
              {!hasResults && (
                <div style={{ padding: "16px 12px", fontSize: 13, color: "var(--color-fg-subtle)", textAlign: "center" }}>
                  No matches for "{searchQuery}"
                </div>
              )}
              {payments.length > 0 && <SearchGroup label="Payments" />}
              {payments.map((p) => (
                <SearchRow
                  key={`p-${p.paymentId}`}
                  title={`${p.amount} USDC · ${p.recipientKey || p.platformKey}`}
                  sub={`payment ${p.paymentId} · ${PAYMENT_WORD[p.status] ?? p.status} · ${shortHex(p.recipientWallet)}`}
                  onClick={() => {
                    actions.viewReceipt(p.paymentId);
                    closeSearch();
                  }}
                />
              ))}
              {cases.length > 0 && <SearchGroup label="Cases" />}
              {cases.map((c) => (
                <SearchRow
                  key={`c-${c.caseNumber}`}
                  title={c.caseNumber}
                  sub={`${c.allegationAmountContested ? c.allegationAmountContested + " USDC · " : ""}${c.payoutRef} · ${c.status}`}
                  onClick={() => {
                    actions.viewCase(c.caseNumber);
                    closeSearch();
                  }}
                />
              ))}
            </div>
          )}
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
                <div style={{ padding: "10px 12px", fontSize: 12, fontWeight: 700, color: "var(--color-fg)", borderBottom: "1px solid var(--color-border)", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ flex: 1 }}>Notifications</span>
                  {unreadCount > 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); api.markAllNotificationsRead().catch(() => {}); }}
                      style={{ border: "none", background: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "var(--brand-600)" }}
                    >
                      Mark all read
                    </button>
                  )}
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
                        if (n.caseNumber) {
                          actions.viewCase(n.caseNumber);
                        } else if (n.paymentId) {
                          actions.viewReceipt(n.paymentId);
                        } else {
                          actions.go("receipt");
                        }
                        api.markNotificationRead(n._id).catch(() => {});
                        setShowNotif(false);
                      }}
                      style={{
                        padding: "10px 12px",
                        borderBottom: "1px solid var(--color-border)",
                        cursor: "pointer",
                        background: n.readAt ? "transparent" : "var(--brand-50)",
                        opacity: n.readAt ? 0.6 : 1,
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
                <ProfileRow label="Balance" value={balanceLoading ? "Loading…" : wb?.usdc != null ? `${wb.usdc} USDC` : walletAddr ? "—" : "No wallet linked"} mono />
                {wb?.protected != null && Number(wb.protected) > 0 && (
                  <ProfileRow label="Protected" value={`${wb.protected} USDC`} mono />
                )}
                {wb?.debt != null && Number(wb.debt) > 0 && (
                  <ProfileRow label="Debt" value={`${wb.debt} USDC`} mono />
                )}
                {/* Full wallet address with copy button */}
                {walletAddr ? (
                  <div style={{ padding: "5px 12px" }}>
                    <div style={{ fontSize: 11, color: "var(--color-fg-subtle)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 4 }}>Wallet</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--color-fg-muted)", wordBreak: "break-all", flex: 1 }}>
                        {walletAddr}
                      </span>
                      <button
                        onClick={() => { navigator.clipboard.writeText(walletAddr); }}
                        title="Copy address"
                        style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)", cursor: "pointer", borderRadius: "var(--radius-sm)", padding: "3px 6px", fontSize: 13, color: "var(--color-fg-muted)", flexShrink: 0 }}
                      >
                        ⧉
                      </button>
                    </div>
                  </div>
                ) : (
                  <ProfileRow label="Wallet" value="Not connected" />
                )}
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

function SearchGroup({ label }: { label: string }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-fg-subtle)", padding: "8px 12px 4px" }}>
      {label}
    </div>
  );
}

function SearchRow({ title, sub, onClick }: { title: string; sub: string; onClick: () => void }) {
  return (
    <a
      onClick={onClick}
      style={{ display: "block", padding: "8px 12px", borderRadius: "var(--radius-sm)", cursor: "pointer", textDecoration: "none" }}
      className="hoverable"
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
      <div style={{ fontSize: 11.5, color: "var(--color-fg-muted)", fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>
    </a>
  );
}
