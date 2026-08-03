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
   useApi — on-demand data hook (PRD §14.1).
   Fetches GET /status + /payouts + /cases + /notifications + /wallet/balance
   ONLY when refresh() is called — on initial load, screen change, or a user
   action. There is NO automatic interval poll: the Arc testnet RPC rate-limits
   aggressively, and continuous polling (every 3s from the frontend + every 2s
   from the backend indexer) was exceeding the request limit. Call refresh()
   when the user navigates, submits a form, or explicitly asks for fresh data.
   ========================================================================== */

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
      const [status, payouts, cases, notifsResult, walletBalance] = await Promise.all([
        api.status(),
        api.payouts(),
        api.cases(),
        api.notifications().catch((e) => {
          console.warn("[useApi] notifications fetch failed:", e instanceof Error ? e.message : e);
          return { notifications: [], unreadCount: 0 };
        }),
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
        notifications: notifsResult.notifications,
        unreadCount: notifsResult.unreadCount,
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

  // Initial load only — no interval polling. refresh() is called on demand by
  // the app when the screen changes or the user takes an action.
  useEffect(() => {
    applyRole(initialRole);
    void refresh();
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
