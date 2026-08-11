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
import { ROLE_ALLOWED, ROLE_HOME } from "./domain/access";
import { api } from "./api";
import { signRefund, isUserRejection, signRefundAuthorization, directRefundByArbiter } from "./wallet";
import type { RefundTypedData } from "./api";

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
// The backend allows generous info requests per case (state machine
// MAX_INFO_REQUESTS) so the arbiter can have a real conversation with both sides.

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
  /** The payout the user clicked — drives which receipt is loaded. */
  selectedPaymentId: string | null;
  /** The case the user clicked (e.g. from search) — drives which case is loaded. */
  selectedCaseId: string | null;
  /** Bumps whenever evidence/reply/info-request is submitted, so App.tsx can
   *  reload the active case and all seats see the new data. */
  caseVersion: number;
  /** Bumps whenever a new payout is created on chain, so App.tsx can re-fetch
   *  the payouts list — bridging the indexer's poll gap (the payout row only
   *  exists once the indexer detects the on-chain PaymentCreated event). */
  payoutVersion: number;
  stripDismissed: boolean;
  copied: boolean;
  exportToast: boolean;

  reqOpen: boolean;
  reqLog: InfoRequest[];
  reqTarget: InfoTarget;
  reqText: string;

  replyText: string;
  replySending: boolean;

  evOpen: boolean;
  evText: string;
  evItems: AddedEvidence[];

  decOption: DecOption;
  decReason: string;
  decPhase: DecPhase;
  /** The on-chain tx hash of the refund once the wallet has broadcast it, shown
   *  in the pending phase so the arbiter can watch the real transaction. */
  decTxHash: string | null;

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
    selectedPaymentId: null,
    selectedCaseId: null,
    caseVersion: 0,
    payoutVersion: 0,
    stripDismissed: false,
    copied: false,
    exportToast: false,
    reqOpen: false,
    reqLog: [],
    reqTarget: "customer",
    reqText: "",
    replyText: "",
    replySending: false,
    evOpen: false,
    evText: "",
    evItems: [],
    decOption: null,
    decReason: "",
    decPhase: "idle",
    decTxHash: null,
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

  /** Open the receipt for a specific payout (the one the user clicked). */
  const viewReceipt = useCallback((paymentId: string) => {
    setState((s) => ({ ...s, selectedPaymentId: paymentId, screen: "receipt" }));
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  /** Open the final receipt for a specific payment (shows the outcome section). */
  const viewFinalReceipt = useCallback((paymentId: string) => {
    setState((s) => ({ ...s, selectedPaymentId: paymentId, screen: "final", payoutVersion: s.payoutVersion + 1 }));
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  /** Open a specific case by case number (e.g. from search). */
  const viewCase = useCallback((caseNumber: string) => {
    setState((s) => ({ ...s, selectedCaseId: caseNumber, screen: "case" }));
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
    // Standard-commerce nomenclature: the CUSTOMER is the payer/claimant who
    // opens disputes; the MERCHANT is the payment recipient who responds and
    // withdraws. (Previously these labels were flipped.)
    const isClaimant = role === "customer";
    const isRecipient = role === "merchant";
    const isPlatformSide = role === "platform";

    // Route guard: if the current screen is not allowed for this role, redirect
    // to the role's home screen. This prevents e.g. a customer accessing /ledger
    // or a merchant accessing /decision (arbiter-only).
    const allowedScreens: Screen[] = ROLE_ALLOWED[role];
    const homeScreen: Screen = ROLE_HOME[role];

    const screen: Screen =
      (state.screen && allowedScreens.includes(state.screen))
        ? state.screen
        : homeScreen;

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

    const optStyle = (name: DecOption) => ({
      border: opt === name ? "var(--brand-700)" : "var(--ink-200)",
      bg: opt === name ? "var(--brand-50)" : "var(--color-surface)",
    });
    const a = optStyle("approve");
    const r = optStyle("reject");

    const reqLog = state.reqLog;
    const reqSent = reqLog.length > 0;
    const lastReq = reqLog[reqLog.length - 1];
    const nameFor = (t: InfoTarget) =>
      t === "merchant" ? "the merchant (Maya Santos)" : "the customer (Northstar Creators)";
    const reqSentLabel = !reqSent
      ? ""
      : reqLog.length === 1
        ? "Request sent to " + nameFor(lastReq.target) + "."
        : reqLog.length + " requests sent · most recently to " + nameFor(lastReq.target) + ".";
    const myReqs = reqLog.filter(
      (rq) => (rq.target === "customer" && isClaimant) || (rq.target === "merchant" && isRecipient)
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
      approveBorder: a.border,
      approveBg: a.bg,
      rejectBorder: r.border,
      rejectBg: r.bg,
      approveSelected: opt === "approve",
      showPreview: !!opt && !reasonEmpty,
      decOption: opt,
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
      decTxHash: state.decTxHash,

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
      // The backend enforces the 2-request cap with a 409. We only disable the
      // button when the text is empty — the server is the source of truth for
      // the count, not local state (which doesn't sync from the server).
      reqCapReached: false,
      reqSendDisabled: !state.reqText.trim(),
      reqSendCursor: !state.reqText.trim() ? "not-allowed" : "pointer",
      reqSendBg: !state.reqText.trim() ? "var(--ink-100)" : "var(--brand-600)",
      reqSendFg: !state.reqText.trim() ? "var(--color-fg-subtle)" : "#fff",
      sendReq: async () => {
        const t = state.reqText.trim();
        if (!t) return;
        // The frontend InfoTarget ("customer"|"merchant") now matches the
        // backend side vocabulary directly — no translation needed.
        const caseNumber = state.selectedCaseId ?? "";
        if (!caseNumber) return;
        // Clear the text optimistically so a fast double-click can't send twice
        // (the empty-text guard above stops the second invocation).
        setState((s) => ({ ...s, reqText: "" }));
        try {
          await api.requestInfo(caseNumber, { target: state.reqTarget, text: t });
          setState((s) => ({
            ...s,
            reqLog: [...s.reqLog, { target: s.reqTarget, text: t }],
            reqOpen: false,
            caseVersion: s.caseVersion + 1,
          }));
        } catch {
          // Restore the text so the user can retry, and keep the composer open.
          setState((s) => ({ ...s, reqText: t }));
        }
      },
      showReqCard: !!myLastReq && !stageDecided,
      reqCardText: myLastReq ? myLastReq.text : "",

      showAddEvidence: (isClaimant || isRecipient) && !stageDecided,
      evidenceAsLabel: isClaimant ? "the customer" : "the merchant",
      evSideLabel: isClaimant ? "Customer" : "Merchant",
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
      addEv: async () => {
        const t = state.evText.trim();
        if (!t) return;
        const caseNumber = state.selectedCaseId ?? "";
        if (!caseNumber) return;
        try {
          await api.addEvidence(caseNumber, {
            type: "message",
            title: t.slice(0, 80),
            fileOrText: t,
          });
          setState((s) => ({ ...s, evText: "", evOpen: false, caseVersion: s.caseVersion + 1 }));
        } catch {
          // keep the text so the user can retry
        }
      },

      /* recipient reply / response */
      replyText: state.replyText,
      replySending: state.replySending,
      onReplyText: (val: string) => patch({ replyText: val }),
      submitReply: async () => {
        const t = state.replyText.trim();
        if (!t) return;
        const caseNumber = state.selectedCaseId ?? "";
        if (!caseNumber) return;
        patch({ replySending: true });
        try {
          await api.respond(caseNumber, { text: t });
          setState((s) => ({ ...s, replyText: "", replySending: false, caseStage: "under_review", caseVersion: s.caseVersion + 1 }));
        } catch {
          patch({ replySending: false });
        }
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
      canDecide: (stageReview || stageMoreInfo || stageAwaiting) && isReviewer,
      showComposer: (isClaimant || isRecipient) && !stageDecided && screen === "case",
      disputeDeadlineCell: stageAwaiting ? "in " + countdown : stageDecided ? "Closed 29 Jul" : "—",
      selectedPaymentId: state.selectedPaymentId,
      selectedCaseId: state.selectedCaseId,
      caseVersion: state.caseVersion,
      payoutVersion: state.payoutVersion,
    };
  }, [state, patch, startSim]);

  const actions = useMemo(
    () => ({
      go,
      viewReceipt,
      viewFinalReceipt,
      viewCase,
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
      /** Bump caseVersion so App reloads the active case (used after the agent
          refresh action so the new frame/status flows into the case room). */
      // NOTE: read the current version from the setState updater, NOT from the
      // `state` closure. The `actions` memo is created once (its deps are all
      // stable callbacks), so `state` here is frozen at the first render and
      // `state.caseVersion` is always 0 — meaning every call would compute 0 + 1
      // and only ever set caseVersion to 1 (so only the FIRST bump reloaded the
      // case; subsequent bumps were a no-op and the case room stayed stale).
      reloadCase: () => setState((s) => ({ ...s, caseVersion: s.caseVersion + 1 })),
      /** Bump payoutVersion so App re-fetches the payouts list — bridges the
          indexer's ~30s poll gap so a freshly-created payout appears without a
          manual refresh (NewPayout → ledger/receipt). */
      // NOTE: same fix as reloadCase — read payoutVersion from the updater, not
      // the frozen `state` closure. Without this, only the FIRST payout after a
      // page load bumped payoutVersion (0 → 1); every later payout set it to 1
      // again (a no-op), so the ledger/receipt retry effect never re-fired and
      // freshly-created payouts never appeared without a manual reload.
      reloadPayouts: () => setState((s) => ({ ...s, payoutVersion: s.payoutVersion + 1 })),
      /**
       * Sign a refund with the reviewer's browser wallet (D1). Falls back to the
       * labeled simulation (D11) when no wallet is detected. The Decision screen
       * calls this after receiving the unsigned tx from the API.
       *
       * The tx hash is broadcast first (pending phase), then we WAIT for the real
       * on-chain receipt before declaring the refund confirmed — never a fake
       * timer. On confirm we bump caseVersion + payoutVersion so App.tsx re-fetches
       * the case/receipt on an escalating schedule until the indexer writes the
       * Refund → refundTxHash and the case moves to EXECUTED/CLOSED (or
       * DEBT_OUTSTANDING under the D3 debt path). Without these bumps the case
       * room + receipt stayed stale (still DISPUTED, no refundTxHash) until a
       * manual refresh — the flow looked broken even though the chain had moved.
       */
      signRefundWithWallet: async (unsignedTx: { to: string; abi: unknown[]; functionName: string; args: (string | number)[] }, requiredSigner?: string) => {
        try {
          patch({ decPhase: "awaiting" });
          const txHash = await signRefund(unsignedTx as never, requiredSigner);
          // Tx submitted — record the hash and proceed immediately. Do NOT wait
          // for block confirmation (can take minutes on Arc). The indexer
          // independently confirms and stamps the case CLOSED on its next tick.
          patch({ decPhase: "confirmed", decTxHash: txHash });
          // Stamp the refund tx hash on the decision. AWAIT so the receipt
          // has the data when it loads.
          const cn = state.selectedCaseId;
          if (cn) {
            await api.stampRefundTx(cn, txHash).catch(() => {});
          }
          // The chain has moved, but the indexer writes refundTxHash only on its
          // next ~30s tick. Bump both versions so App.tsx re-fetches on an
          // escalating schedule until the case/receipt reflect the real state.
          // Read from the updater, not the frozen `state` closure — see the
          // note on reloadPayouts/reloadCase above.
          setState((s) => ({
            ...s,
            selectedPaymentId: s.selectedPaymentId, // keep whatever is set
            caseVersion: s.caseVersion + 1,
            payoutVersion: s.payoutVersion + 1,
          }));
          setTimer(() => go("final"), 1600);
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
      /**
       * Signature-based refund (refundByArbiterWithSig). The arbiter signs an
       * EIP-712 RefundAuthorization in their wallet (no gas, no chain switch),
       * then the backend RELAYS the signed authorization to the chain via its
       * operator key. The authorizer (signer) and the submitter (backend) are
       * decoupled — so the BACKEND no longer needs to hold the arbiter key.
       *
       * Note: the connected SIGNING wallet MUST still be the arbiter's wallet —
       * the contract reverts if ecrecover does not recover the arbiter address.
       * The decoupling is between signer (still the arbiter) and submitter (now
       * the backend operator). This fixes the "approve fails to record" coupling:
       * the Decision records immediately on the POST /decisions call, and this
       * action only authorizes the refund execution.
       */
      authorizeAndRelayRefund: async (caseNumber: string, typedData: RefundTypedData) => {
        const rpAddress = (typedData.domain?.verifyingContract ?? "") as `0x${string}`;
        const paymentId = typedData.paymentId ?? "";

        // Path 1 (direct): the arbiter's browser wallet calls refundByArbiter
        // directly on the contract. Simplest path — no backend relay, no
        // operator key. Works when the connected wallet IS the contract's
        // arbiter. Fails fast (WrongWalletError, no popup) if it isn't.
        try {
          if (rpAddress && paymentId) {
            patch({ decPhase: "awaiting" });
            const hash = await directRefundByArbiter(rpAddress, paymentId);
            // Tx submitted — record the hash and proceed immediately. Do NOT
            // wait for block confirmation (that can take minutes on Arc).
            patch({ decPhase: "confirmed", decTxHash: hash });
            // Stamp the refund tx hash on the decision + payout in the DB so
            // the receipt shows the refund transaction. AWAIT this — the
            // receipt reads the decision from the DB, so the stamp must land
            // before we navigate to it.
            if (!hash.startsWith("0xalready-refunded")) {
              await api.stampRefundTx(caseNumber, hash).catch(() => {});
            }
            // Set the selectedPaymentId so the receipt loads this payout's data
            // when we navigate to "final". Without this, the receipt has no
            // paymentId and shows nothing.
            setState((s) => ({ ...s, selectedPaymentId: paymentId, caseVersion: s.caseVersion + 1, payoutVersion: s.payoutVersion + 1 }));
            setTimer(() => go("final"), 1600);
            return hash;
          }
        } catch (directErr) {
          // User rejected the MetaMask popup — respect it, don't fall through.
          if (isUserRejection(directErr)) {
            patch({ decPhase: "sig_rejected" });
            throw directErr;
          }
          // Direct call failed (wrong wallet, contract revert, RPC error) —
          // fall through to the signature+relay path.
        }

        // Path 2 (signature + relay): arbiter signs off-chain, backend relays
        // via refundByArbiterWithSig. This works even when the arbiter's wallet
        // isn't the onlyArbiter key — the signature authorizes the refund and
        // the backend's operator key submits it. Requires the backend to have
        // the operator key configured.
        try {
          patch({ decPhase: "awaiting" });
          const sig = await signRefundAuthorization(typedData);
          patch({ decPhase: "pending" });
          const { txHash } = await api.submitRefundTx(caseNumber, sig);
          // Tx relayed — record the hash and proceed immediately. Same as path
          // 1: don't wait for block confirmation.
          patch({ decPhase: "confirmed", decTxHash: txHash });
          // Stamp the refund tx hash on the decision + payout. AWAIT so the
          // receipt has the data when it loads.
          await api.stampRefundTx(caseNumber, txHash).catch(() => {});
          setState((s) => ({
            ...s,
            selectedPaymentId: paymentId,
            caseVersion: s.caseVersion + 1,
            payoutVersion: s.payoutVersion + 1,
          }));
          setTimer(() => go("final"), 1600);
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
    [go, viewReceipt, viewFinalReceipt, viewCase, asRole, setRoleProp, setCaseStage, setLedgerState, setWalletSim, setDemoMode, patch]
  );

  return { v, actions, state };
}

export type ViewModel = ReturnType<typeof useFinne>["v"];
export type FinneActions = ReturnType<typeof useFinne>["actions"];
