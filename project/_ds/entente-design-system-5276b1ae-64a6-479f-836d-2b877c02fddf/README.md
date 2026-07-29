# Entente — Design System

**Entente** is a decision-support tool for **carrier claims teams** deciding whether to **settle, counter or litigate** a general-liability or commercial claim. It reads the demand, the policy and the facts, then returns a **defensible settlement range**, flags which parts of the demand are **inflated**, and shows the **reserve impact**. Every legal point is **tied to an authored corpus and cited** — and where the law is *not* in the corpus, it says so rather than guessing.

The name *entente* means a friendly understanding or agreement between parties — the resolution a good claims decision drives toward.

This repository is the brand + product design system: tokens, type, color, logo, iconography, a component preview gallery, and a high-fidelity UI kit of the claims-analysis app.

---

## Sources

> **This is a greenfield brand.** No existing codebase, Figma file, or deck was provided — only a product description. The identity here was designed from scratch and approved by the user through a directions exploration:
>
> - **Direction:** *Concord* — modern, fintech-clean, all-sans, balanced density.
> - **Primary color:** *Slate Indigo* `#3C4C82` (chosen over brighter "Ink Cobalt" / "Steel Azure" blues — deliberately muted and understated, not an electric "lightsaber" royal blue).
> - See `Brand Directions.html` for the original exploration (three directions + three blues).
>
> If you later have real brand assets, a marketing site, or a product codebase, drop them in and this system should be reconciled against them.

---

## Brand at a glance

| | |
|---|---|
| **Personality** | Modern fintech-clean. Approachable enterprise SaaS that earns trust through precision, citation, and restraint. |
| **Primary** | Slate Indigo `#3C4C82` |
| **Ink** | `#0E1B2E` headings, `#42526B` body, on `#F7F8FA` canvas |
| **Type** | Hanken Grotesk (all UI + display) · IBM Plex Mono (money, IDs, citations) |
| **Status** | Green = settled / within range · Amber = inflated / flagged · Red = litigation risk |
| **Icons** | Lucide, 1.75px stroke |
| **Shape** | 8–12px radii, soft cool shadows, 1px hairline borders |

---

## Content fundamentals — how Entente writes

The product talks to insurance professionals who carry legal and financial liability for their decisions. Copy is **plain, exact, and accountable.** It never oversells the AI; it shows its work.

- **Voice:** Calm, declarative, professional. Like a sharp colleague who hands you the analysis, not a chatbot. *"Future medicals appear inflated by ~$45k."* — not *"I think maybe this could possibly be a bit high!"*
- **Person:** Address the user as **you** ("Review the flagged line items"). Entente refers to itself in the third person or not at all — **never "I"**. It is an instrument, not a persona.
- **Tense & mood:** Present tense, active voice, imperative for actions ("Counter at $210k", "Cite to corpus", "Flag as inflated").
- **Numbers are first-class.** Money, ranges, percentages and reserve deltas are shown in **monospace, tabular** so they align and read as data. Always `$210,000` or `$210k` consistently within a view; ranges use an en-dash: `$180k – $240k`.
- **Casing:** Sentence case for everything — headings, buttons, menu items ("Settlement analysis", not "Settlement Analysis"). UPPERCASE is reserved for small mono **labels/eyebrows** with wide tracking ("DEFENSIBLE RANGE", "CLAIM GL-4471").
- **Citations are mandatory and explicit.** Every legal assertion carries a corpus reference (`Corpus §4.2 · ¶3`). When something is outside the corpus, say so plainly: **"Not in corpus — flagged rather than guessed."** This honesty is a core brand value, not a footnote.
- **Hedging is banned where the corpus is clear, and required where it isn't.** Confidence is calibrated, never performative.
- **No emoji. No exclamation points. No hype words** ("revolutionary", "AI-powered", "seamless"). The credibility comes from precision.
- **Recommendations are labeled as recommendations:** "Recommend counter", "Recommend settle within range" — the human decides; Entente advises.

**Example microcopy**
- Empty state: *"No claims yet. Upload a demand letter and policy to begin."*
- Flag: *"Demand includes $45,000 in future medicals unsupported by the treatment record."*
- Honest gap: *"Punitive-damages exposure — not in corpus. Review with counsel."*
- CTA: *"Generate analysis"* · *"Recommend counter"* · *"Export to reserve"*

---

## Visual foundations

**Overall feel.** Clean, structured, breathable enterprise SaaS. White surfaces float on a cool off-white canvas (`#F7F8FA`). Information is organized in calm cards and rows with generous-but-efficient spacing — never cramped, never sparse. The product should feel like a precise legal instrument, not a flashy consumer app.

- **Color usage.** Slate Indigo is used **sparingly and deliberately** — for the single primary action, key data accents, selected states, and the recommendation. The interface is mostly ink-on-white with cool gray structure; color earns attention. Status colors (green/amber/red) appear only on genuine status (settled / inflated / risk), never decoratively.
- **Backgrounds.** Flat. No gradients on surfaces. The canvas is a flat cool off-white; cards are flat white. The only acceptable "gradient" is none — depth comes from shadow and hairline borders, not color washes. No background images or textures in the app; marketing may use a single restrained full-bleed photo if ever needed (cool-toned, desaturated, document/office subject matter).
- **Type.** All-sans. Hanken Grotesk carries everything from 60px display to 12px labels; weights 400/500/600/700/800. Display and headings use tight negative tracking (`-0.02em`). IBM Plex Mono is used **only** for numerics and identifiers (money, ranges, claim/policy IDs, citation sections) — this typographic split is a signature: *words are humane, numbers are exact.*
- **Spacing.** 4px base scale (4/8/12/16/24/32/48/64). Cards pad `18–24px`. Related controls group with `8–12px` gaps; sections separate with `24–32px`.
- **Corner radii.** Moderate and consistent: inputs/buttons `8px`, cards `12px`, large surfaces `16px`, chips/badges fully `pill`. Nothing sharp-cornered, nothing pill-shaped except chips and the range track.
- **Borders.** 1px hairlines in `#E4E8EF` are the primary structural device — they divide rows, outline cards, and define inputs. Borders do the work that heavy shadows would in a flashier product.
- **Shadows / elevation.** Soft, cool, navy-tinted (`rgba(14,27,46,…)`), never gray or black. A four-step scale (xs→lg). Cards rest at `sm`/`md`; popovers and modals at `lg`. No glow, no colored shadows.
- **Animation.** Restrained and quick. Transitions `120–180ms`, ease-out. Hover/press feedback only — **no bounces, no decorative looping motion, no parallax.** Content appears; it doesn't perform. Respect `prefers-reduced-motion`.
- **Hover states.** Buttons deepen by one step (primary `--brand-600` → `--brand-700`); secondary/ghost get a faint `--brand-50` / `--ink-50` fill. Rows get a `--ink-50` background. Hover never moves or scales elements.
- **Press states.** A subtle darken plus optional `translateY(0.5px)`; no aggressive shrink.
- **Focus.** Always visible: a 3px slate ring (`rgba(60,76,130,0.32)`) plus a `--brand-500` border on inputs. Accessibility is non-negotiable for a professional tool.
- **Transparency & blur.** Used only for overlay scrims (ink at ~40% with a light blur behind modals) and sticky-header fades. Surfaces themselves are opaque.
- **Imagery vibe.** Minimal. The app is document- and data-forward; the "imagery" is well-set numbers, range bars, and citation blocks. Any photography stays cool-toned, desaturated, and professional.
- **Cards.** Flat white, `12px` radius, 1px `#E4E8EF` border, `sm`/`md` cool shadow. Header row with a mono eyebrow label + status badge; body with rows; optional footer divided by a hairline. This claim/analysis card is the atomic unit of the product.
- **Layout rules.** Fixed left sidebar (nav) + fixed top bar; scrollable content column with a comfortable max content width. Detail views use a two-column split (analysis ← → citations). Consistent gutters.

---

## Iconography

- **Set:** [**Phosphor**](https://phosphoricons.com) — a distinctive, geometric, professional line set at **regular** weight. Chosen specifically to *avoid* the default Lucide/Heroicons look that reads as generic AI-tool UI. Loaded from CDN (`@phosphor-icons/web`, regular stylesheet); in production install `@phosphor-icons/react`.
  > *Substitution note:* No icon set was provided (greenfield brand), so Phosphor is a chosen default. Swappable, but keep a single set at one weight.
- **Style:** Outline/stroke style, regular weight — no fill or duotone. Icons inherit `currentColor`; default `--ink-700`, muted `--ink-400`. Status icons take semantic colors (`check-circle` green, `warning` amber, etc.).
- **Sizing:** 16px inline with text, 18–20px in buttons/nav, 24–26px for feature/empty-state accents.
- **Common icons in product:** `scales`, `gavel`, `file-text`, `shield-check`, `flag`, `magnifying-glass`, `trend-up`, `check-circle`, `warning`, `quotes`, `arrow-right`, `caret-right`. (In the kit these are addressed by friendly aliases mapped to Phosphor names — see `ui_kits/app/ui.jsx`.)
- **Emoji:** Never. **Unicode as icons:** avoid, except the en-dash `–` in ranges and `§`/`¶` for legal references (these are typographic, not iconographic).
- **Logo mark** (`assets/entente-mark*.svg`) is an authored brand asset, not an icon — two arcs forming one ring (two parties → one agreement) around a settlement node. Don't restyle it as a UI icon.

---

## Index — what's in this system

**Root**
- `README.md` — this file.
- `colors_and_type.css` — all design tokens: color scales, semantic roles, type scale, radii, spacing, shadows, plus `.e-*` semantic type classes. **Import this in every artifact.**
- `Brand Directions.html` — the original brand exploration (reference only).

**`assets/`** — `entente-mark.svg` (color), `entente-mark-mono.svg` (ink), `entente-mark-white.svg` (reversed). Wordmark is set live in Hanken Grotesk 800.

**`preview/`** — the Design System gallery cards (type, color, spacing, components, brand). Small standalone HTML specimens; see the **Design System** tab.

**`ui_kits/app/`** — high-fidelity, click-through recreation of the Entente claims-analysis web app.
- `index.html` — interactive demo (claim list → analysis → citations → reserve).
- `README.md` — kit overview + component list.
- `*.jsx` — modular UI components (sidebar, topbar, claim list, settlement range, demand breakdown, citation panel, reserve impact, buttons, fields).

> No slide template was provided, so `slides/` is intentionally omitted.
