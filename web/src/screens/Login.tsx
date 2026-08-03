import { useState } from "react";
import { setToken, walletLogin, type PublicUser } from "../api";
import { connectWallet } from "../wallet";
import { isUserRejection } from "../wallet";
import type { Role } from "../types";

/* ============================================================================
   Login screen — pick a role, then connect a wallet. The wallet address is the
   identity (no passwords, no external service). The backend binds one wallet to
   one role: on first sign-in the chosen role sticks, thereafter the same wallet
   may only sign in with that role.
   ========================================================================== */

type RoleKey = "arbiter" | "merchant" | "customer" | "platform";

const ROLE_CARDS: Record<RoleKey, { name: string; title: string; desc: string; color: string }> = {
  arbiter: {
    name: "Dana Whitfield",
    title: "Arbiter",
    desc: "Decides refunds, signs on-chain",
    color: "var(--brand-500)",
  },
  merchant: {
    name: "Northbeam",
    title: "Merchant",
    desc: "Creates payouts, opens disputes",
    color: "var(--warn-500)",
  },
  customer: {
    name: "Maya Reyes",
    title: "Customer",
    desc: "Receives payouts, withdraws",
    color: "var(--ok-500)",
  },
  platform: {
    name: "Parkline",
    title: "Platform",
    desc: "Read-only marketplace view",
    color: "var(--brand-400)",
  },
};

export function Login({ onLogin }: { onLogin: (user: PublicUser, frontendRole?: string) => void }) {
  const [selectedRole, setSelectedRole] = useState<RoleKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const selectRole = (role: RoleKey) => {
    setSelectedRole(role);
    setError(null);
  };

  // Connect an injected wallet (MetaMask/Rabby) and sign in with its address.
  // The wallet also becomes the signing client for on-chain actions.
  const connectAndSignIn = async () => {
    setError(null);
    setConnecting(true);
    try {
      const client = await connectWallet();
      const addr = client.account?.address;
      if (!addr) throw new Error("No address returned by the wallet.");
      const { token, user } = await walletLogin({
        walletAddress: addr,
        role: (selectedRole ?? "customer") as Role,
      });
      setToken(token);
      // The backend binds one wallet to one seat and returns the authoritative
      // seat (it rejects a mismatch with 409, including arbiter vs merchant).
      // Hand the seat back so the app uses it rather than guessing from role.
      onLogin(user, user.seat ?? undefined);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Wallet connection failed.";
      setError(isUserRejection(e) ? "Wallet connection was rejected." : msg);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-bg)", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 520, background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-2xl)", boxShadow: "var(--shadow-lg)", padding: 28 }}>
        {/* Brand */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontFamily: "var(--font-sans)", fontWeight: 800, fontSize: 22, letterSpacing: ".14em", color: "var(--color-fg)" }}>FINNÉ</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-fg-subtle)", marginTop: 3 }}>
            Dispute system · on Arc
          </div>
        </div>

        {/* Role-select cards */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-fg-subtle)", marginBottom: 10 }}>
            Choose a role to sign in
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
            {(Object.keys(ROLE_CARDS) as RoleKey[]).map((key) => {
              const acct = ROLE_CARDS[key];
              const active = selectedRole === key;
              return (
                <div
                  key={key}
                  onClick={() => selectRole(key)}
                  style={{
                    border: active ? "2px solid var(--brand-600)" : "1px solid var(--color-border)",
                    background: active ? "var(--brand-50)" : "var(--color-surface)",
                    borderRadius: "var(--radius-md)",
                    padding: "10px 8px",
                    cursor: "pointer",
                    textAlign: "center",
                    transition: "all .15s ease",
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: acct.color, display: "block", margin: "0 auto 6px" }} />
                  <div style={{ fontSize: 12, fontWeight: 700, color: active ? "var(--brand-700)" : "var(--color-fg)", marginBottom: 2 }}>{acct.title}</div>
                  <div style={{ fontSize: 10, color: "var(--color-fg-muted)", marginBottom: 3 }}>{acct.name}</div>
                  <div style={{ fontSize: 9.5, color: "var(--color-fg-subtle)", lineHeight: 1.3 }}>{acct.desc}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Connect wallet (primary) */}
        <button
          onClick={connectAndSignIn}
          disabled={connecting}
          style={{
            width: "100%",
            border: "none",
            background: connecting ? "var(--brand-50)" : "var(--brand-600)",
            color: connecting ? "var(--brand-700)" : "#fff",
            cursor: connecting ? "not-allowed" : "pointer",
            padding: "11px 16px",
            fontSize: 13.5,
            fontWeight: 600,
            fontFamily: "var(--font-sans)",
            borderRadius: "var(--radius-md)",
            boxShadow: connecting ? "none" : "var(--shadow-sm)",
          }}
        >
          {connecting ? "Connecting…" : "Connect wallet"}
        </button>
        <div style={{ marginTop: 8, fontSize: 11, color: "var(--color-fg-subtle)", textAlign: "center", lineHeight: 1.4 }}>
          MetaMask / Rabby on Arc testnet. Your wallet is your account — no password needed.
        </div>

        {/* Error */}
        {error && (
          <div style={{ marginTop: 14, background: "var(--risk-soft)", border: "1px solid var(--risk-border)", borderRadius: "var(--radius-md)", padding: "8px 12px", fontSize: 12, color: "var(--risk-600)", lineHeight: 1.5 }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
