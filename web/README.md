# Finné — Web app

The React implementation of the Finné dispute-system prototype. Everything is
hard-coded for now (no backend, no wallet, no chain calls) — it reproduces the
interactive prototype in `project/Finne Dispute resolution system.dc.html` screen for screen,
with the same content and the same Entente design system.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

Build a static bundle:

```bash
npm run build      # outputs to dist/
npm run preview    # serve the production build locally
```

Requires Node 18+ (developed on Node 20).

## What's inside

A single-page app with a session switcher (Arbiter, Merchant, Customer, Platform)
and the full dispute scenario from the README:

| Screen | Reached by |
|---|---|
| Payout ledger (+ empty / loading / stale / error states) | Merchant → Payouts |
| Disputes queue | Arbiter → Disputes |
| Platform / marketplace transactions | Platform → Transactions |
| New protected payout | Merchant → Payouts → **+ New protected payout** |
| Shared payout receipt / final receipt | any "Receipt" link |
| Case room (claim, response, evidence, agent brief, timeline) | any "Open case" |
| Decision & signing (all wallet-sim phases) | Arbiter → case → **Decide this case** |
| Recipient home | Customer → Your payouts |

A floating **Demo controls** panel (bottom-right) exposes the five variables that
the original prototype's editor exposed: role, case stage, ledger state, wallet
simulation, and the chain-activity strip. Use it to walk every branch.

## Project layout

```
src/
  main.tsx            app entry
  App.tsx             screen router + app shell
  useFinne.ts         single source of truth (state + derived view model)
  data.ts             hard-coded demo content
  types.ts            shared types
  styles/             tokens.css (Entente design system) + global.css
  components/         Sidebar, TopBar, primitives, overlays
  screens/            one file per screen
```

## Deploy

The build is a plain static bundle (`dist/`), so it deploys anywhere.

- **Vercel** — import the repo, set root directory to `web/`; `vercel.json` is included.
- **Netlify** — same; `netlify.toml` is included.
- **GitHub Pages** — `.github/workflows/deploy.yml` builds and publishes on push to `main`.
  Vite's `base: "./"` makes the bundle load from the `/<repo>/` sub-path automatically.

Because `base` is relative, you can also drop `dist/` onto any static host
(S3, Cloudflare Pages, IPFS) without configuration.

## Disclaimer

Circle's Refund Protocol is unaudited and released for educational purposes
under Apache 2.0. This build runs on Arc testnet only and holds no keys.
