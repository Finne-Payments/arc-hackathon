# Finné

**The Dispute resolution system for stablecoin payouts.** Built on Circle's Refund Protocol, running on Arc testnet. An entry for the Encode Programmable Money Hackathon (DeFi track).

Circle built the mechanism that *can* refund a stablecoin payment. Finné determines whether it *should* be refunded, shows why, hears both sides, and records the outcome: one protected payout, one dispute, one human decision, one on-chain correction, one permanent receipt.

## The problem

Businesses and platforms pay creators, contractors and sellers in USDC. The chain records that a wallet sent 100 USDC to another wallet — it does not record *why*. When a payout is wrong, short, or challenged, there is no claim, no evidence, no hearing and no record. Platforms claw money back by silent deduction; recipients have nowhere to appeal. Every other payment rail grew a Dispute resolution system — card networks got chargebacks, banks got recalls. Stablecoins shipped without one.

Circle's Refund Protocol is the rail that admits the gap. It escrows an ERC-20 payment, fixes a refund address at payment time, and gives a named arbiter three narrow powers: hold funds for a lockup period, refund to the pre-set address, and permit early withdrawal for an agreed fee. What it cannot answer is the only question that matters in a dispute: **should this money move back?** It has no concept of the work, the terms, the evidence, or the recipient's side. That empty seat is Finné.

## Principles

1. **The agent reads and explains. It never decides and never signs.** The Proof Agent holds no keys, submits no transactions, and renders no verdicts. Its output is a brief, not a judgement.
2. **A human at the platform decides.** The platform's own reviewer reads the case, chooses the outcome, and signs the on-chain action from the arbiter wallet. There is no automatic-decision button anywhere in the product.
3. **Both sides see the same evidence.** The case room is one shared record. No hidden fraud score, no one-sided file.
4. **Money moves only through Circle's contract, only to pre-set addresses.** Refunds execute through `refundByArbiter`, which can pay only the refund address fixed when the payment was made. Finné cannot redirect funds and neither can the reviewer.
5. **Every payment ends with a receipt and a right of reply.** The receipt links the on-chain transfer to the work, terms, evidence and — if disputed — the decision and its reasons. Only hashes and identifiers go on chain; content stays off chain.

## How a dispute runs

```
pay (escrowed on Arc) → payout receipt → dispute opened → right of reply
→ agent brief (deterministic checks, no verdict) → human decision with written reasons
→ refundByArbiter / release → final receipt, hash-anchored on Arc
```

If the lockup has already expired and the recipient has withdrawn, an approved refund draws on the arbiter reserve and the contract records a debt against the recipient, repaid automatically from their next payout — voluntary refund, small reserve, next payment: all three correction legs, native to the contract.

## Architecture

| Component | Purpose |
|---|---|
| C1 · Refund Protocol | Escrow, refund, withdrawal, debt. Circle's contract deployed unchanged on Arc testnet. |
| C2 · Case Registry | Finné's own thin contract. Anchors receipt, case and decision hashes against a payment ID. Events only, minimal storage. |
| C3 · Indexer | Watches C1 and C2 events over the Arc RPC; converts chain events into database records and status changes. |
| C4 · Backend + database | Receipts, work orders, evidence, cases, responses, decisions, policies. REST API for the web app. |
| C5 · Proof Agent | Deterministic checks plus evidence assembly. Runs on payment detected and on dispute opened. Holds no keys. |
| C6 · Web app | The product screens. Reviewer signing via injected browser wallet on Arc testnet. |

**Money path, stated once.** USDC moves in exactly two ways: the platform wallet calls `pay`, and the reviewer's arbiter wallet calls `refundByArbiter` (or the recipient calls `withdraw` after lockup). Finné's servers and agent are read-only against the chain at all times.

## This repository, right now

`project/Finne Dispute resolution system.dc.html` is the interactive prototype of the product — open it in a browser, no build step. It covers the payout ledger, disputes queue, shared payout receipt, case room, decision-and-signing flow, recipient home and final receipt, with a session switcher for each role (arbiter, merchant, recipient, platform) and simulated wallet outcomes. `project/_ds/` holds the design tokens the prototype imports.

Contracts, indexer, backend, agent and production web app land here next, targeting the 9 August submission.

## Demo scenario

Northbeam Studios pays Maya Reyes 100 USDC for three product videos. Two arrive; the third is contested. Northbeam opens a case for 33 USDC, Maya replies with her side and evidence, the agent's brief flags what is on file and what is missing, and a named reviewer decides — with written reasons both sides can read — before signing the refund from the arbiter wallet. The final receipt carries the decision, the decider, the reasons and the chain anchors, permanently.

## Disclaimer

Circle's Refund Protocol is unaudited, carries no security guarantees, and is released for educational purposes under Apache 2.0. This build runs on Arc testnet only.

## Team

Arko Ganguli · Abhishek Sira Chandrashekar
