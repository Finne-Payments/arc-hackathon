import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AddedEvidence,
  CaseStage,
  DecOption,
  DecPhase,
  InfoRequest,
  InfoTarget,
  LedgerState,
  Role,
  Screen,
  WalletSim,
} from "./types";

/**
 * useFinne is the single source of truth for the prototype.
 * It mirrors the original DC component's `state`, props and `renderVals()`,
 * including the wallet-signing simulation, info-request log, evidence composer
 * and the live reply countdown.
 */

const SIX_HOURS_ELEVEN_MIN = (6 * 3600 + 11 * 60) * 1000;

// Mirrors the backend decision rule (PRD §11.2: reason ≥ 20 chars). No shared
// @finne/domain package exists yet, so this is a local mirror of the constant
// (GAP-W1's shared-package half stays out of scope).
const MIN_DECISION_REASON = 20;
// Backend caps info requests at 2 per case (PRD §10.2, MAX_INFO_REQUESTS).
const MAX_INFO_REQUESTS = 2;

export interface FinneState {
  /* props (demo-controllable) */
  role: Role;
  caseStage: CaseStage;
  ledgerState: LedgerState;
  walletSim: WalletSim;
  demoMode: boolean;

  /* internal interaction state */
  screen: Screen | null;
  roleOverride: Role | null;
  stripDismissed: boolean;
  copied: boolean;
  exportToast: boolean;

  reqOpen: boolean;
  reqLog: InfoRequest[];
  reqTarget: InfoTarget;
  reqText: string;

  evOpen: boolean;
  evText: string;
  evItems: AddedEvidence[];

  decOption: DecOption;
  decReason: string;
  decPhase: DecPhase;

  deadline: number;
  now: number;
}

export function useFinne(initialRole: Role = "arbiter") {
  const [state, setState] = useState<FinneState>({
    role: initialRole,
    caseStage: "under_review",
    ledgerState: "normal",
    walletSim: "approves",
    demoMode: false,
    screen: null,
    roleOverride: null,
    stripDismissed: false,
    copied: false,
    exportToast: false,
    reqOpen: false,
    reqLog: [],
    reqTarget: "customer",
    reqText: "",
    evOpen: false,
    evText: "",
    evItems: [],
    decOption: null,
    decReason: "",
    decPhase: "idle",
    deadline: Date.now() + SIX_HOURS_ELEVEN_MIN,
    now: Date.now(),
  });

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const setTimer = (fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    timers.current.push(id);
    return id;
  };
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  /* live countdown — ticks every 30s like the prototype */
  useEffect(() => {
    const t = setInterval(() => setState((s) => ({ ...s, now: Date.now() })), 30000);
    return () => {
      clearInterval(t);
      clearTimers();
    };
  }, []);

  const patch = useCallback((p: Partial<FinneState>) => setState((s) => ({ ...s, ...p })), []);

  const go = useCallback((screen: Screen) => {
    setState((s) => ({ ...s, screen }));
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  const setRoleProp = useCallback((role: Role) => patch({ role }), [patch]);
  const setCaseStage = useCallback((caseStage: CaseStage) => patch({ caseStage }), [patch]);
  const setLedgerState = useCallback((ledgerState: LedgerState) => patch({ ledgerState }), [patch]);
  const setWalletSim = useCallback((walletSim: WalletSim) => patch({ walletSim }), [patch]);
  const setDemoMode = useCallback((demoMode: boolean) => patch({ demoMode }), [patch]);

  /* session switcher — resets to the role's home screen */
  const asRole = useCallback(
    (roleOverride: Role) =>
      setState((s) => ({ ...s, roleOverride, screen: null, decPhase: "idle" })),
    []
  );

  const startSim = useCallback(() => {
    setState((s) => {
      const sim = s.walletSim;
      setTimer(() => {
        setState((cur) => {
          if (sim === "rejects_signature") return { ...cur, decPhase: "sig_rejected" };
          setTimer(() => {
            setState((c2) => {
              if (sim === "transaction_fails") return { ...c2, decPhase: "failed" };
              setTimer(() => go("final"), 1600);
              return { ...c2, decPhase: "confirmed" };
            });
          }, 2400);
          return { ...cur, decPhase: "pending" };
        });
      }, 2200);
      return { ...s, decPhase: "awaiting" };
    });
  }, [go]);

  /* ---- derived view model (mirrors renderVals) ---- */
  const v = useMemo(() => {
    const role = state.roleOverride ?? state.role;
    const isReviewer = role === "arbiter";
    const isClaimant = role === "merchant";
    const isRecipient = role === "customer";
    const isPlatformSide = role === "platform";

    const screen: Screen =
      state.screen ??
      (isRecipient ? "home" : role === "platform" ? "platform" : isReviewer ? "disputes" : "ledger");

    const stage = state.caseStage;
    const stageAwaiting = stage === "awaiting_response";
    const stageReview = stage === "under_review";
    const stageMoreInfo = stage === "more_info";
    const stageDecided = stage === "decided";

    const ledger = state.ledgerState;

    const rem = Math.max(0, state.deadline - state.now);
    const h = Math.floor(rem / 3600000);
    const m = Math.floor((rem % 3600000) / 60000);
    const countdown = `${h}h ${String(m).padStart(2, "0")}m`;

    const opt = state.decOption;
    const reasonEmpty = state.decReason.trim().length === 0;
    // Backend requires reason ≥ 20 chars (route + Mongo minlength, PRD §11.2).
    // Enforce client-side so the user sees the rule before the API rejects it.
    const reasonTooShort = !reasonEmpty && state.decReason.trim().length < MIN_DECISION_REASON;
    const recordDisabled = reasonEmpty || reasonTooShort || !opt;

    const previews: Record<string, string> = {
      approve:
        "33 USDC reverts from escrow to Northbeam’s refund address, fixed when the payment was made; the remaining 67 USDC stays protected for Maya until 13 August. If the money had already been withdrawn, the refund draws on the arbiter reserve and is clawed back from Maya’s future payouts.",
      reject:
        "The payout stands; Maya can withdraw the full 100 USDC when the protection window ends on 13 August. Your reasons are shown to both sides.",
      close:
        "The dispute ends with no refund. The payout continues on its original schedule and the case record is locked.",
    };

    const optStyle = (name: DecOption) => ({
      border: opt === name ? "var(--brand-700)" : "var(--ink-200)",
      bg: opt === name ? "var(--brand-50)" : "var(--color-surface)",
    });
    const a = optStyle("approve");
    const r = optStyle("reject");
    const c = optStyle("close");

    const reqLog = state.reqLog;
    const reqSent = reqLog.length > 0;
    const lastReq = reqLog[reqLog.length - 1];
    const nameFor = (t: InfoTarget) =>
      t === "merchant" ? "the merchant (Northbeam Studios)" : "the customer (Maya Reyes)";
    const reqSentLabel = !reqSent
      ? ""
      : reqLog.length === 1
        ? "Request sent to " + nameFor(lastReq.target) + "."
        : reqLog.length + " requests sent · most recently to " + nameFor(lastReq.target) + ".";
    const myReqs = reqLog.filter(
      (rq) => (rq.target === "merchant" && isClaimant) || (rq.target === "customer" && isRecipient)
    );
    const myLastReq = myReqs[myReqs.length - 1];

    return {
      role,
      isReviewer,
      isClaimant,
      isRecipient,
      isPlatformSide,
      screen,
      stage,
      stageAwaiting,
      stageReview,
      stageMoreInfo,
      stageDecided,
      ledger,
      walletSim: state.walletSim,
      demoModeState: state.demoMode,
      countdown,

      decReason: state.decReason,
      onReason: (val: string) => patch({ decReason: val }),
      reasonEmpty,
      reasonHint: reasonTooShort
        ? `Reason must be at least ${MIN_DECISION_REASON} characters (${state.decReason.trim().length}/${MIN_DECISION_REASON}).`
        : "",
      optionsOpacity: reasonEmpty ? ".45" : "1",
      optionsPointer: reasonEmpty ? "none" : "auto",
      selectApprove: () => patch({ decOption: "approve" }),
      selectReject: () => patch({ decOption: "reject" }),
      selectClose: () => patch({ decOption: "close" }),
      approveBorder: a.border,
      approveBg: a.bg,
      rejectBorder: r.border,
      rejectBg: r.bg,
      closeBorder: c.border,
      closeBg: c.bg,
      approveSelected: opt === "approve",
      showPreview: !!opt && !reasonEmpty,
      previewText: opt ? previews[opt] : "",
      recordDisabled,
      recordCursor: recordDisabled ? "not-allowed" : "pointer",
      recordBg: recordDisabled ? "var(--ink-100)" : "var(--brand-600)",
      recordHoverBg: recordDisabled ? "var(--ink-100)" : "var(--brand-700)",
      recordFg: recordDisabled ? "var(--color-fg-subtle)" : "#fff",
      recordDecision: () => {
        if (recordDisabled) return;
        if (opt === "approve") startSim();
        else patch({ decPhase: "recorded" });
      },
      cancelSignature: () => {
        clearTimers();
        patch({ decPhase: "idle" });
      },
      retrySign: startSim,
      decPhase: state.decPhase,

      reqSent,
      reqNotSent: !state.reqOpen,
      reqBtnLabel: reqSent ? "Request more information" : "Request information",
      showReqComposer: state.reqOpen,
      reqTimeline: reqLog.map((rq) => ({ targetName: nameFor(rq.target), text: rq.text })),
      reqSentLabel,
      toggleReq: () => patch({ reqOpen: !state.reqOpen }),
      reqToMerchant: () => patch({ reqTarget: "merchant" }),
      reqToCustomer: () => patch({ reqTarget: "customer" }),
      reqMerBorder: state.reqTarget === "merchant" ? "var(--brand-600)" : "var(--ink-200)",
      reqMerBg: state.reqTarget === "merchant" ? "var(--brand-50)" : "var(--color-surface)",
      reqCusBorder: state.reqTarget === "customer" ? "var(--brand-600)" : "var(--ink-200)",
      reqCusBg: state.reqTarget === "customer" ? "var(--brand-50)" : "var(--color-surface)",
      reqText: state.reqText,
      onReqText: (val: string) => patch({ reqText: val }),
      // Backend caps at MAX_INFO_REQUESTS per case (PRD §10.2). Disable the
      // button once the limit is reached so the UI matches the rule.
      reqCapReached: state.reqLog.length >= MAX_INFO_REQUESTS,
      reqSendDisabled: state.reqLog.length >= MAX_INFO_REQUESTS || !state.reqText.trim(),
      reqSendCursor: state.reqLog.length >= MAX_INFO_REQUESTS || !state.reqText.trim() ? "not-allowed" : "pointer",
      reqSendBg: state.reqLog.length >= MAX_INFO_REQUESTS || !state.reqText.trim() ? "var(--ink-100)" : "var(--brand-600)",
      reqSendFg: state.reqLog.length >= MAX_INFO_REQUESTS || !state.reqText.trim() ? "var(--color-fg-subtle)" : "#fff",
      sendReq: () => {
        const t = state.reqText.trim();
        if (t && state.reqLog.length < MAX_INFO_REQUESTS)
          setState((s) => ({
            ...s,
            reqLog: [...s.reqLog, { target: s.reqTarget, text: t }],
            reqText: "",
            reqOpen: false,
          }));
      },
      showReqCard: !!myLastReq && !stageDecided,
      reqCardText: myLastReq ? myLastReq.text : "",

      showAddEvidence: (isClaimant || isRecipient) && !stageDecided,
      evidenceAsLabel: isClaimant ? "the merchant" : "the service provider",
      evSideLabel: isClaimant ? "Merchant" : "Customer",
      evItems: state.evItems,
      evComposerOpen: state.evOpen,
      evPrompt: !state.evOpen,
      evText: state.evText,
      onEvText: (val: string) => patch({ evText: val }),
      openEv: () => patch({ evOpen: true }),
      cancelEv: () => patch({ evOpen: false, evText: "" }),
      evSendDisabled: !state.evText.trim(),
      evSendCursor: state.evText.trim() ? "pointer" : "not-allowed",
      evSendBg: state.evText.trim() ? "var(--brand-600)" : "var(--ink-100)",
      evSendFg: state.evText.trim() ? "#fff" : "var(--color-fg-subtle)",
      addEv: () => {
        const t = state.evText.trim();
        if (t)
          setState((s) => ({
            ...s,
            evItems: [...s.evItems, { text: t, side: isClaimant ? "Merchant" : "Customer" }],
            evText: "",
            evOpen: false,
          }));
      },

      /* receipt / final */
      showOutcome: screen === "final",
      receiptTitle: screen === "final" ? "Final receipt" : "Payment receipt",
      receiptChipColor: stageDecided || screen === "final" ? "var(--risk-500)" : "var(--warn-500)",
      receiptChipLabel: stageDecided || screen === "final" ? "Refunded" : "Disputed",
      showDisputeBanner: screen === "receipt" && !stageDecided,
      mayaRowDot: stageDecided ? "var(--risk-500)" : "var(--warn-500)",
      mayaRowStatus: stageDecided ? "Refunded" : "Disputed",

      /* case chips */
      caseChipColor: stageDecided
        ? "var(--risk-500)"
        : stageMoreInfo
          ? "var(--brand-500)"
          : "var(--warn-500)",
      caseChipLabel: stageDecided
        ? "Refunded"
        : stageMoreInfo
          ? "More information requested"
          : "Under review",
      showReply: !stageAwaiting,
      canDecide: (stageReview || stageMoreInfo) && isReviewer,
      showComposer: isRecipient && (stageAwaiting || stageMoreInfo) && screen === "case",
      disputeDeadlineCell: stageAwaiting ? "in " + countdown : stageDecided ? "Closed 29 Jul" : "—",
    };
  }, [state, patch, startSim]);

  const actions = useMemo(
    () => ({
      go,
      asRole,
      setRoleProp,
      setCaseStage,
      setLedgerState,
      setWalletSim,
      setDemoMode,
      doExport: () => {
        patch({ exportToast: true });
        setTimer(() => patch({ exportToast: false }), 2200);
      },
      copyTech: (value: string) => {
        if (value && navigator.clipboard) navigator.clipboard.writeText(value);
        patch({ copied: true });
        setTimer(() => patch({ copied: false }), 1400);
      },
      dismissStrip: () => patch({ stripDismissed: true }),
      printPage: () => window.print(),
      /**
       * Sign a refund with the reviewer's browser wallet (D1). Falls back to the
       * labeled simulation (D11) when no wallet is detected. The Decision screen
       * calls this after receiving the unsigned tx from the API.
       */
      signRefundWithWallet: async (unsignedTx: { to: string; abi: unknown[]; functionName: string; args: (string | number)[] }) => {
        const { signRefund, isUserRejection } = await import("./wallet.ts");
        try {
          patch({ decPhase: "awaiting" });
          const txHash = await signRefund(unsignedTx as never);
          patch({ decPhase: "pending" });
          // The indexer independently confirms; the UI forwards after a short delay.
          // In a real deployment, the app would poll for indexer confirmation.
          setTimer(() => patch({ decPhase: "confirmed" }), 3000);
          setTimer(() => go("final"), 4600);
          return txHash;
        } catch (e) {
          if (isUserRejection(e)) {
            patch({ decPhase: "sig_rejected" });
          } else {
            patch({ decPhase: "failed" });
          }
          throw e;
        }
      },
    }),
    [go, asRole, setRoleProp, setCaseStage, setLedgerState, setWalletSim, setDemoMode, patch]
  );

  return { v, actions, state };
}

export type ViewModel = ReturnType<typeof useFinne>["v"];
export type FinneActions = ReturnType<typeof useFinne>["actions"];
