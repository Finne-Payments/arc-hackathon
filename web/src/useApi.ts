import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  type ConfigBody,
  type PayoutRow,
  type CaseRow,
  type SharedCase,
  type SharedReceipt,
  type StatusBody,
  type NotificationRow,
  type WalletBalance,
} from "./api";
import type { Role } from "./types";

/* ============================================================================
   useApi — live data polling hook (PRD §14.1).
   Polls GET /status + /payouts + /cases every 3 s, plus the active case
   detail and receipt on demand. Any fetch failure surfaces as an error state
   so the UI can render per-screen error cards with retry instead of crashing
   (the app must survive a dead backend — PRD §13.4 resilience).
   ========================================================================== */

const POLL_MS = 3000;

export interface ApiData {
  config: ConfigBody | null;
  status: StatusBody | null;
  payouts: PayoutRow[];
  cases: CaseRow[];
  activeCase: SharedCase | null;
  activeReceipt: SharedReceipt | null;
  notifications: NotificationRow[];
  unreadCount: number;
  walletBalance: WalletBalance | null;
  loading: boolean;
  error: string | null;
  /** Bump on every successful poll — components can use this to know data is fresh. */
  tick: number;
}

export interface ApiActions {
  setRole: (role: Role) => void;
  loadCase: (caseNumber: string | null) => Promise<void>;
  loadReceipt: (paymentId: string | null) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useApi(initialRole: Role): { data: ApiData; actions: ApiActions } {
  const [, setRoleState] = useState<Role>(initialRole);
  const [data, setData] = useState<ApiData>({
    config: null,
    status: null,
    payouts: [],
    cases: [],
    activeCase: null,
    activeReceipt: null,
    notifications: [],
    unreadCount: 0,
    walletBalance: null,
    loading: true,
    error: null,
    tick: 0,
  });

  const activeCaseId = useRef<string | null>(null);
  const activeReceiptId = useRef<string | null>(null);

  // Role is now derived from the authenticated user (JWT), not a seat header.
  // The API client sends the Bearer token automatically.
  const applyRole = useCallback((r: Role) => {
    setRoleState(r);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [status, payouts, cases, notifs, walletBalance] = await Promise.all([
        api.status(), api.payouts(), api.cases(),
        api.notifications().catch(() => ({ notifications: [], unreadCount: 0 })),
        api.walletBalance().catch(() => null),
      ]);
      let cfg = dataRef.current.config;
      if (!cfg) {
        try {
          cfg = await api.config();
        } catch {
          cfg = null;
        }
      }
      setData((d) => ({
        ...d,
        config: cfg,
        status,
        payouts: payouts.payouts,
        cases: cases.cases,
        notifications: notifs.notifications,
        unreadCount: notifs.unreadCount,
        walletBalance,
        loading: false,
        error: null,
        tick: d.tick + 1,
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Couldn't reach the backend.";
      setData((d) => ({ ...d, loading: false, error: msg }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep a ref of the latest data for refresh() to read config without re-triggering
  const dataRef = useRef(data);
  dataRef.current = data;

  // initial + interval poll
  useEffect(() => {
    applyRole(initialRole);
    void refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCase = useCallback(async (caseNumber: string | null) => {
    activeCaseId.current = caseNumber;
    if (!caseNumber) {
      setData((d) => ({ ...d, activeCase: null }));
      return;
    }
    try {
      const c = await api.case(caseNumber);
      setData((d) => ({ ...d, activeCase: c }));
    } catch (e) {
      setData((d) => ({ ...d, error: e instanceof Error ? e.message : "Couldn't load the case." }));
    }
  }, []);

  const loadReceipt = useCallback(async (paymentId: string | null) => {
    activeReceiptId.current = paymentId;
    if (!paymentId) {
      setData((d) => ({ ...d, activeReceipt: null }));
      return;
    }
    try {
      const r = await api.receipt(paymentId);
      setData((d) => ({ ...d, activeReceipt: r }));
    } catch (e) {
      setData((d) => ({ ...d, error: e instanceof Error ? e.message : "Couldn't load the receipt." }));
    }
  }, []);

  const actions = useMemo(
    () => ({ setRole: applyRole, loadCase, loadReceipt, refresh }),
    [applyRole, loadCase, loadReceipt, refresh],
  );

  return { data, actions };
}
