/* ============================================================================
   useV1Api — the sole data hook for the v1 registrar API (UI-01).
   Replaces useFinne prototype state with API-driven state. No polling (Arc
   testnet rate-limits); refresh is called on screen change + user actions.
   ========================================================================== */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  v1api, idemKey, formatUsdc, shortAddr,
  type V1Payment, type V1Case, type V1CaseDetail, type V1Meta, type V1Dashboard,
  type V1Correction,
} from "./v1api.ts";

export interface V1Data {
  meta: V1Meta | null;
  dashboard: V1Dashboard | null;
  payments: V1Payment[];
  cases: V1Case[];
  activeCase: V1CaseDetail | null;
  activeCorrection: V1Correction | null;
  loading: boolean;
  error: string | null;
}

export interface V1Actions {
  refresh: () => Promise<void>;
  loadCase: (caseId: string) => Promise<void>;
  loadCorrection: (correctionId: string) => Promise<void>;
  openCase: (paymentId: string, body: { claimType: string; allegation: string; challengedAmountMicroUsdc: string }) => Promise<string | null>;
  respond: (caseId: string, text: string) => Promise<boolean>;
  decide: (caseId: string, outcome: string, rationale: string, correctionAmount?: string) => Promise<boolean>;
  createCorrection: (caseId: string) => Promise<string | null>;
  declineCorrection: (caseId: string, reason: string) => Promise<boolean>;
  verifyCorrection: (correctionId: string, txHash: string) => Promise<boolean>;
  importPayment: (txHash: string) => Promise<boolean>;
  demoPayout: (recipient: string, amount: string) => Promise<boolean>;
  anchorReceipt: (paymentId: string) => Promise<boolean>;
  allocateEvidence: (caseId: string, filename: string, mime: string, size: number) => Promise<string | null>;
  completeEvidence: (uploadId: string, caseId: string, title: string) => Promise<boolean>;
  /** Generate the verdict-free decision frame (Addendum A4). Degrade-safe. */
  runFrame: (caseId: string) => Promise<boolean>;
  /** Re-fetch on-chain + off-chain data and re-run the agents (refresh action). */
  refreshCase: (caseId: string) => Promise<boolean>;
}

const INITIAL: V1Data = {
  meta: null,
  dashboard: null,
  payments: [],
  cases: [],
  activeCase: null,
  activeCorrection: null,
  loading: true,
  error: null,
};

export function useV1Api(): { data: V1Data; actions: V1Actions } {
  const [data, setData] = useState<V1Data>(INITIAL);
  const metaLoaded = useRef(false);

  const refresh = useCallback(async () => {
    setData((d) => ({ ...d, loading: true, error: null }));
    try {
      const [payments, cases, dashboard] = await Promise.all([
        v1api.listPayments().catch(() => []),
        v1api.listCases().catch(() => []),
        v1api.dashboard().catch(() => null),
      ]);
      if (!metaLoaded.current) {
        const meta = await v1api.meta().catch(() => null);
        metaLoaded.current = true;
        setData((d) => ({ ...d, meta }));
      }
      setData((d) => ({ ...d, payments, cases, dashboard, loading: false }));
    } catch (e) {
      setData((d) => ({ ...d, loading: false, error: e instanceof Error ? e.message : "Failed to load data." }));
    }
  }, []);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  const loadCase = useCallback(async (caseId: string) => {
    try {
      const detail = await v1api.getCase(caseId);
      setData((d) => ({ ...d, activeCase: detail }));
    } catch (e) {
      setData((d) => ({ ...d, error: e instanceof Error ? e.message : "Failed to load case." }));
    }
  }, []);

  const loadCorrection = useCallback(async (correctionId: string) => {
    try {
      const correction = await v1api.getCorrection(correctionId);
      setData((d) => ({ ...d, activeCorrection: correction }));
    } catch (e) {
      setData((d) => ({ ...d, error: e instanceof Error ? e.message : "Failed to load correction." }));
    }
  }, []);

  const openCase = useCallback(async (paymentId: string, body: { claimType: string; allegation: string; challengedAmountMicroUsdc: string }) => {
    try {
      const result = await v1api.openCase(paymentId, body, idemKey("open"));
      await refresh();
      return result.caseId;
    } catch { return null; }
  }, [refresh]);

  const respond = useCallback(async (caseId: string, text: string) => {
    try {
      await v1api.respond(caseId, text, [], idemKey("resp"));
      await loadCase(caseId);
      await refresh();
      return true;
    } catch { return false; }
  }, [loadCase, refresh]);

  const decide = useCallback(async (caseId: string, outcome: string, rationale: string, correctionAmount?: string) => {
    try {
      await v1api.decide(caseId, { outcome, rationale, correctionAmountMicroUsdc: correctionAmount }, idemKey("dec"));
      await loadCase(caseId);
      await refresh();
      return true;
    } catch { return false; }
  }, [loadCase, refresh]);

  // Decision frame (PRD Addendum A4): assemble the verdict-free frame. The
  // backend degrades safely when the model is unplugged (rung 1/2); the action
  // still returns true so the panel re-renders with whatever frame exists.
  const runFrame = useCallback(async (caseId: string) => {
    try {
      await v1api.runFrame(caseId, {}, idemKey("frame"));
      await loadCase(caseId);
      return true;
    } catch { return false; }
  }, [loadCase]);

  // Refresh: re-fetch on-chain + off-chain data and re-run the agents. Same
  // degrade-safe contract as runFrame; the "agents running" card shows progress.
  const refreshCase = useCallback(async (caseId: string) => {
    try {
      await v1api.refreshCase(caseId, idemKey("refresh"));
      await loadCase(caseId);
      return true;
    } catch { return false; }
  }, [loadCase]);

  const createCorrection = useCallback(async (caseId: string) => {
    try {
      const result = await v1api.createCorrectionInstruction(caseId, idemKey("cor"));
      return result.correctionId;
    } catch { return null; }
  }, []);

  const declineCorrection = useCallback(async (caseId: string, reason: string) => {
    try {
      // Need correctionId — find from active case
      const detail = await v1api.getCase(caseId);
      if (!detail.correction) return false;
      await v1api.declineCorrection(detail.correction.correctionId, reason, idemKey("dec"));
      await loadCase(caseId);
      return true;
    } catch { return false; }
  }, [loadCase]);

  const verifyCorrection = useCallback(async (correctionId: string, txHash: string) => {
    try {
      await v1api.verifyCorrection(correctionId, txHash, idemKey("ver"));
      await refresh();
      return true;
    } catch { return false; }
  }, [refresh]);

  const importPayment = useCallback(async (txHash: string) => {
    try {
      await v1api.importPayment(txHash, idemKey("imp"));
      await refresh();
      return true;
    } catch { return false; }
  }, [refresh]);

  const demoPayout = useCallback(async (recipient: string, amount: string) => {
    try {
      await v1api.demoPayout(recipient, amount, idemKey("pay"));
      await refresh();
      return true;
    } catch { return false; }
  }, [refresh]);

  const anchorReceipt = useCallback(async (paymentId: string) => {
    try {
      await v1api.anchorReceipt(paymentId, idemKey("anc"));
      await refresh();
      return true;
    } catch { return false; }
  }, [refresh]);

  const allocateEvidence = useCallback(async (caseId: string, filename: string, mime: string, size: number) => {
    try {
      const result = await v1api.allocateUpload(caseId, filename, mime, size, idemKey("ev"));
      return result.uploadId;
    } catch { return null; }
  }, []);

  const completeEvidence = useCallback(async (uploadId: string, caseId: string, title: string) => {
    try {
      await v1api.completeUpload(uploadId, caseId, title, idemKey("evc"));
      await loadCase(caseId);
      return true;
    } catch { return false; }
  }, [loadCase]);

  return {
    data,
    actions: {
      refresh, loadCase, loadCorrection,
      openCase, respond, decide,
      createCorrection, declineCorrection, verifyCorrection,
      importPayment, demoPayout, anchorReceipt,
      allocateEvidence, completeEvidence,
      runFrame, refreshCase,
    },
  };
}

export { formatUsdc, shortAddr };
