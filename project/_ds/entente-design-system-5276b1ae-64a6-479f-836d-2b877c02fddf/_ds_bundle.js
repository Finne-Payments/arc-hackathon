/* @ds-bundle: {"format":4,"namespace":"EntenteDesignSystem_5276b1","components":[],"sourceHashes":{"DirectionTile.jsx":"18a49da34e8f","design-canvas.jsx":"bd8746af6e58","ui_kits/app/ClaimsList.jsx":"a43d97573bb7","ui_kits/app/Detail.jsx":"7f8c7bd86363","ui_kits/app/Intake.jsx":"208c2bfdcb40","ui_kits/app/Sidebar.jsx":"74a937c84fce","ui_kits/app/Topbar.jsx":"8aad0f23cff0","ui_kits/app/icons.jsx":"0f11bed9b7a9","ui_kits/app/ui.jsx":"2d3f580a5bcc"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.EntenteDesignSystem_5276b1 = window.EntenteDesignSystem_5276b1 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// DirectionTile.jsx
try { (() => {
// DirectionTile.jsx — one full brand direction shown as a tile:
// mark + wordmark, palette, type specimen, and a real Entente app card.
// Three configs (Concord / Ledger / Instrument) exported via window.

const Mark = ({
  kind,
  color,
  accent
}) => {
  // Minimal geometric logo marks — "agreement / common ground" motif.
  if (kind === "arcs") {
    return /*#__PURE__*/React.createElement("svg", {
      width: "34",
      height: "34",
      viewBox: "0 0 34 34",
      fill: "none"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M17 3a14 14 0 0 1 0 28",
      stroke: accent,
      strokeWidth: "3.2",
      strokeLinecap: "round"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M17 31a14 14 0 0 1 0-28",
      stroke: color,
      strokeWidth: "3.2",
      strokeLinecap: "round"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "17",
      cy: "17",
      r: "3",
      fill: accent
    }));
  }
  if (kind === "venn") {
    return /*#__PURE__*/React.createElement("svg", {
      width: "34",
      height: "34",
      viewBox: "0 0 34 34",
      fill: "none"
    }, /*#__PURE__*/React.createElement("circle", {
      cx: "13",
      cy: "17",
      r: "9.5",
      stroke: color,
      strokeWidth: "2.6"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: "21",
      cy: "17",
      r: "9.5",
      stroke: accent,
      strokeWidth: "2.6"
    }));
  }
  // balance
  return /*#__PURE__*/React.createElement("svg", {
    width: "34",
    height: "34",
    viewBox: "0 0 34 34",
    fill: "none"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M6 11h22",
    stroke: color,
    strokeWidth: "2.6",
    strokeLinecap: "round"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "9",
    cy: "11",
    r: "2.6",
    fill: accent
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "25",
    cy: "11",
    r: "2.6",
    fill: accent
  }), /*#__PURE__*/React.createElement("path", {
    d: "M17 11v14",
    stroke: color,
    strokeWidth: "2.6",
    strokeLinecap: "round"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M11 27h12",
    stroke: color,
    strokeWidth: "2.6",
    strokeLinecap: "round"
  }));
};
function DirectionTile({
  d
}) {
  const s = d.scale;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: "100%",
      height: "100%",
      background: d.bg,
      color: d.fg1,
      fontFamily: d.body,
      display: "flex",
      flexDirection: "column",
      padding: "40px 44px",
      boxSizing: "border-box",
      gap: 30
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Mark, {
    kind: d.mark,
    color: d.fg1,
    accent: d.accent
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: d.display,
      fontWeight: 700,
      fontSize: 27,
      letterSpacing: d.wordSpacing,
      color: d.fg1
    }
  }, "Entente")), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: d.mono,
      fontSize: 11,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      color: d.fg3
    }
  }, d.codename)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: d.display,
      fontWeight: d.tagWeight,
      fontSize: 26,
      lineHeight: 1.2,
      letterSpacing: "-0.01em",
      color: d.fg1,
      maxWidth: 460,
      textWrap: "balance"
    }
  }, "Settle, counter or litigate \u2014 ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: d.accent
    }
  }, "defensibly.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Label, {
    d: d
  }, "Palette"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, d.swatches.map(sw => /*#__PURE__*/React.createElement("div", {
    key: sw.hex,
    style: {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 44,
      borderRadius: d.radiusSm,
      background: sw.hex,
      border: sw.border ? `1px solid ${d.border}` : "none"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: d.mono,
      fontSize: 9.5,
      color: d.fg3,
      letterSpacing: "0.02em"
    }
  }, sw.hex))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Label, {
    d: d
  }, "Type \u2014 ", d.typeNote), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "baseline",
      gap: 14,
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: d.display,
      fontWeight: 700,
      fontSize: 40,
      letterSpacing: "-0.02em",
      color: d.fg1
    }
  }, "Aa"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: d.body,
      fontSize: 14,
      color: d.fg2,
      maxWidth: 320,
      lineHeight: 1.5
    }
  }, "Defensible decisions for claims teams. Every legal point cited to corpus.")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: d.mono,
      fontSize: 13,
      color: d.fg2,
      letterSpacing: "0.01em"
    }
  }, "$180,000 \u2014 $240,000 \xB7 0123456789")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: "auto"
    }
  }, /*#__PURE__*/React.createElement(Label, {
    d: d
  }, "In product"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10,
      background: d.cardBg,
      border: `1px solid ${d.border}`,
      borderRadius: d.radiusLg,
      boxShadow: d.shadow,
      padding: "18px 20px",
      display: "flex",
      flexDirection: "column",
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: d.mono,
      fontSize: 11,
      color: d.fg3,
      letterSpacing: "0.04em"
    }
  }, "CLAIM\xA0GL-4471"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: d.body,
      fontSize: 11,
      fontWeight: 600,
      color: d.accent,
      background: d.accentSoft,
      padding: "3px 9px",
      borderRadius: 999
    }
  }, "Recommend counter")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline",
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: d.fg2
    }
  }, "Defensible range"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: d.mono,
      fontSize: 15,
      fontWeight: 600,
      color: d.fg1
    }
  }, "$180k \u2013 $240k")), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      height: 8,
      borderRadius: 999,
      background: d.track
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      left: "22%",
      right: "18%",
      top: 0,
      bottom: 0,
      borderRadius: 999,
      background: d.accent
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      left: "52%",
      top: -3,
      width: 14,
      height: 14,
      borderRadius: 999,
      background: d.cardBg,
      border: `3px solid ${d.accent}`
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      marginTop: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: d.mono,
      fontSize: 10,
      color: d.fg3
    }
  }, "Demand $310k"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: d.mono,
      fontSize: 10,
      color: d.accent
    }
  }, "Rec. $210k"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      background: d.warnSoft,
      border: `1px solid ${d.warnBorder}`,
      borderRadius: d.radiusSm,
      padding: "9px 12px"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 7,
      height: 7,
      borderRadius: 2,
      background: d.warn,
      flex: "0 0 auto"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: d.fg2,
      flex: 1
    }
  }, "Future medicals inflated"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: d.mono,
      fontSize: 12,
      fontWeight: 600,
      color: d.warn
    }
  }, "+$45k")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      paddingTop: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: d.fg3
    }
  }, "Reserve impact"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: d.mono,
      fontSize: 14,
      fontWeight: 600,
      color: d.fg1
    }
  }, "+$30,000")))));
}
const Label = ({
  d,
  children
}) => /*#__PURE__*/React.createElement("span", {
  style: {
    fontFamily: d.mono,
    fontSize: 10,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: d.fg3
  }
}, children);

// ---- Direction configs ----------------------------------------------------

const DIR_CONCORD = {
  codename: "A · Concord",
  display: "'Hanken Grotesk', sans-serif",
  body: "'Hanken Grotesk', sans-serif",
  mono: "'IBM Plex Mono', monospace",
  typeNote: "Hanken Grotesk + Plex Mono",
  mark: "arcs",
  wordSpacing: "-0.02em",
  tagWeight: 600,
  bg: "#F7F8FA",
  cardBg: "#FFFFFF",
  fg1: "#0E1B2E",
  fg2: "#42526B",
  fg3: "#8190A6",
  accent: "#2563C9",
  accentSoft: "#E7EFFB",
  warn: "#C2710C",
  warnSoft: "#FBF1E2",
  warnBorder: "#F0DDBE",
  border: "#E4E8EF",
  track: "#E4E8EF",
  radiusSm: 8,
  radiusLg: 14,
  shadow: "0 1px 2px rgba(14,27,46,0.04), 0 8px 24px rgba(14,27,46,0.06)",
  swatches: [{
    hex: "#0E1B2E"
  }, {
    hex: "#2563C9"
  }, {
    hex: "#42526B"
  }, {
    hex: "#C2710C"
  }, {
    hex: "#E4E8EF"
  }, {
    hex: "#FFFFFF",
    border: true
  }]
};
const DIR_LEDGER = {
  codename: "B · Ledger",
  display: "'Schibsted Grotesk', sans-serif",
  body: "'Schibsted Grotesk', sans-serif",
  mono: "'IBM Plex Mono', monospace",
  typeNote: "Schibsted Grotesk + Plex Mono",
  mark: "balance",
  wordSpacing: "-0.01em",
  tagWeight: 600,
  bg: "#FAF9F5",
  cardBg: "#FFFFFF",
  fg1: "#1B1A16",
  fg2: "#4A4840",
  fg3: "#8C887C",
  accent: "#1F7A5A",
  accentSoft: "#E4F1EB",
  warn: "#B5500F",
  warnSoft: "#FBEDE2",
  warnBorder: "#F0D9C5",
  border: "#E7E3D8",
  track: "#EAE6DC",
  radiusSm: 7,
  radiusLg: 12,
  shadow: "0 1px 2px rgba(27,26,22,0.05), 0 10px 28px rgba(27,26,22,0.05)",
  swatches: [{
    hex: "#1B1A16"
  }, {
    hex: "#1F7A5A"
  }, {
    hex: "#4A4840"
  }, {
    hex: "#B5500F"
  }, {
    hex: "#E7E3D8"
  }, {
    hex: "#FAF9F5",
    border: true
  }]
};
const DIR_INSTRUMENT = {
  codename: "C · Instrument",
  display: "'Space Grotesk', sans-serif",
  body: "'Albert Sans', sans-serif",
  mono: "'JetBrains Mono', monospace",
  typeNote: "Space Grotesk + Albert Sans",
  mark: "venn",
  wordSpacing: "-0.03em",
  tagWeight: 700,
  bg: "#EEF1F4",
  cardBg: "#FFFFFF",
  fg1: "#10151C",
  fg2: "#3B4654",
  fg3: "#7C8896",
  accent: "#1A56DB",
  accentSoft: "#E5ECFB",
  warn: "#C026A6",
  warnSoft: "#FBE9F6",
  warnBorder: "#F2CDE9",
  border: "#DCE1E7",
  track: "#DCE1E7",
  radiusSm: 6,
  radiusLg: 10,
  shadow: "0 1px 2px rgba(16,21,28,0.05), 0 6px 18px rgba(16,21,28,0.07)",
  swatches: [{
    hex: "#10151C"
  }, {
    hex: "#1A56DB"
  }, {
    hex: "#3B4654"
  }, {
    hex: "#C026A6"
  }, {
    hex: "#DCE1E7"
  }, {
    hex: "#FFFFFF",
    border: true
  }]
};
Object.assign(window, {
  DirectionTile,
  DIR_CONCORD,
  DIR_LEDGER,
  DIR_INSTRUMENT
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "DirectionTile.jsx", error: String((e && e.message) || e) }); }

// design-canvas.jsx
try { (() => {
// @ds-adherence-ignore -- omelette starter scaffold (raw elements/hex/px by design)

/* BEGIN USAGE */
// DesignCanvas.jsx — Figma-ish design canvas wrapper
// Warm gray grid bg + Sections + Artboards + PostIt notes.
// Exports (to window): DesignCanvas, DCSection, DCArtboard, DCPostIt.
// Artboards are reorderable (grip-drag), deletable, labels/titles are
// inline-editable, and any artboard can be opened in a fullscreen focus
// overlay (←/→/Esc). State persists to a .design-canvas.state.json sidecar
// via the host bridge. No assets, no deps.
//
// Usage:
//   <DesignCanvas>
//     <DCSection id="onboarding" title="Onboarding" subtitle="First-run variants">
//       <DCArtboard id="a" label="A · Dusk" width={260} height={480}>…</DCArtboard>
//       <DCArtboard id="b" label="B · Minimal" width={260} height={480}>…</DCArtboard>
//     </DCSection>
//   </DesignCanvas>
//
// Artboards are static design frames, not scroll regions — never use
// height: 100% + overflow: auto/scroll on inner elements; size each artboard
// to fit its content (explicit pixel height, or let it grow).
/* END USAGE */

const DC = {
  bg: '#f0eee9',
  grid: 'rgba(0,0,0,0.06)',
  label: 'rgba(60,50,40,0.7)',
  title: 'rgba(40,30,20,0.85)',
  subtitle: 'rgba(60,50,40,0.6)',
  postitBg: '#fef4a8',
  postitText: '#5a4a2a',
  font: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'
};

// One-time CSS injection (classes are dc-prefixed so they don't collide with
// the hosted design's own styles).
if (typeof document !== 'undefined' && !document.getElementById('dc-styles')) {
  const s = document.createElement('style');
  s.id = 'dc-styles';
  s.textContent = ['.dc-editable{cursor:text;outline:none;white-space:nowrap;border-radius:3px;padding:0 2px;margin:0 -2px}', '.dc-editable:focus{background:#fff;box-shadow:0 0 0 1.5px #c96442}', '[data-dc-slot]{transition:transform .18s cubic-bezier(.2,.7,.3,1)}', '[data-dc-slot].dc-dragging{transition:none;z-index:10;pointer-events:none}', '[data-dc-slot].dc-dragging .dc-card{box-shadow:0 12px 40px rgba(0,0,0,.25),0 0 0 2px #c96442;transform:scale(1.02)}',
  // isolation:isolate contains artboard content's z-indexes so a
  // z-indexed child (sticky navbar etc.) can't paint over .dc-header or
  // the .dc-menu popover that drops into the top of the card.
  '.dc-card{isolation:isolate;transition:box-shadow .15s,transform .15s}', '.dc-card *{scrollbar-width:none}', '.dc-card *::-webkit-scrollbar{display:none}',
  // Per-artboard header: grip + label on the left, delete/expand on the
  // right. Single flex row; when the artboard's on-screen width is too
  // narrow for both the label yields (ellipsis, then hidden entirely below
  // ~4ch via the container query) and the buttons stay on the row.
  '.dc-header{position:absolute;bottom:100%;left:-4px;margin-bottom:calc(4px * var(--dc-inv-zoom,1));z-index:2;', '  display:flex;align-items:center;container-type:inline-size}', '.dc-labelrow{display:flex;align-items:center;gap:4px;height:24px;flex:1 1 auto;min-width:0}', '.dc-grip{flex:0 0 auto;cursor:grab;display:flex;align-items:center;padding:5px 4px;border-radius:4px;transition:background .12s,opacity .12s}', '.dc-grip:hover{background:rgba(0,0,0,.08)}', '.dc-grip:active{cursor:grabbing}', '.dc-labeltext{flex:1 1 auto;min-width:0;cursor:pointer;border-radius:4px;padding:3px 6px;', '  display:flex;align-items:center;transition:background .12s;overflow:hidden}',
  // Below ~4ch of label room: hide the label entirely, and drop the grip to
  // hover-only (same reveal rule as .dc-btns) so a narrow header is clean
  // until the card is moused.
  '@container (max-width: 110px){', '  .dc-labeltext{display:none}', '  .dc-grip{opacity:0}', '  [data-dc-slot]:hover .dc-grip{opacity:1}', '}', '.dc-labeltext:hover{background:rgba(0,0,0,.05)}', '.dc-labeltext .dc-editable{overflow:hidden;text-overflow:ellipsis;max-width:100%}', '.dc-labeltext .dc-editable:focus{overflow:visible;text-overflow:clip}', '.dc-btns{flex:0 0 auto;margin-left:auto;display:flex;gap:2px;opacity:0;transition:opacity .12s}', '[data-dc-slot]:hover .dc-btns,.dc-btns:has(.dc-menu){opacity:1}', '.dc-expand,.dc-kebab{width:22px;height:22px;border-radius:5px;border:none;cursor:pointer;padding:0;', '  background:transparent;color:rgba(60,50,40,.7);display:flex;align-items:center;justify-content:center;', '  font:inherit;transition:background .12s,color .12s}', '.dc-expand:hover,.dc-kebab:hover{background:rgba(0,0,0,.06);color:#2a251f}',
  // Slot hosting an open menu floats above later siblings (which otherwise
  // paint on top — same z-index:auto, later DOM order) so the popup isn't
  // clipped by the next card.
  '[data-dc-slot]:has(.dc-menu){z-index:10}', '.dc-menu{position:absolute;top:100%;right:0;margin-top:4px;background:#fff;border-radius:8px;', '  box-shadow:0 8px 28px rgba(0,0,0,.18),0 0 0 1px rgba(0,0,0,.05);padding:4px;min-width:160px;z-index:10}', '.dc-menu button{display:block;width:100%;padding:7px 10px;border:0;background:transparent;', '  border-radius:5px;font-family:inherit;font-size:13px;font-weight:500;line-height:1.2;', '  color:#29261b;cursor:pointer;text-align:left;transition:background .12s;white-space:nowrap}', '.dc-menu button:hover{background:rgba(0,0,0,.05)}', '.dc-menu hr{border:0;border-top:1px solid rgba(0,0,0,.08);margin:4px 2px}', '.dc-menu .dc-danger{color:#c96442}', '.dc-menu .dc-danger:hover{background:rgba(201,100,66,.1)}',
  // Chrome (titles / labels / buttons) counter-scales against the viewport
  // zoom so it stays a constant on-screen size. --dc-inv-zoom is set by
  // DCViewport on every transform update and inherits to all descendants —
  // any overlay inside the world (e.g. a TweaksPanel on an artboard) can use
  // it the same way.
  //
  // The header uses transform:scale (out-of-flow, so layout impact doesn't
  // matter) with its world-space width set to card-width / inv-zoom so that
  // after counter-scaling its on-screen width exactly matches the card's —
  // that's what lets the container query + text-overflow behave against the
  // card's visible edge at every zoom level.
  //
  // The section head uses CSS zoom instead of transform so its layout box
  // grows with the counter-scale, pushing the card row down — otherwise the
  // constant-screen-size title would overflow into the (shrinking) world-
  // space gap and overlap the artboard headers at low zoom.
  '.dc-header{width:calc((100% + 4px) / var(--dc-inv-zoom,1));', '  transform:scale(var(--dc-inv-zoom,1));transform-origin:bottom left}', '.dc-sectionhead{zoom:var(--dc-inv-zoom,1)}'].join('\n');
  document.head.appendChild(s);
}
const DCCtx = React.createContext(null);

// Recursively unwrap React.Fragment so <>…</> grouping doesn't hide
// DCSection/DCArtboard children from the type-based walks below.
function dcFlatten(children) {
  const out = [];
  React.Children.forEach(children, c => {
    if (c && c.type === React.Fragment) out.push(...dcFlatten(c.props.children));else out.push(c);
  });
  return out;
}

// ─────────────────────────────────────────────────────────────
// DesignCanvas — stateful wrapper around the pan/zoom viewport.
// Owns runtime state (per-section order, renamed titles/labels, hidden
// artboards, focused artboard). Order/titles/labels/hidden persist to a
// .design-canvas.state.json
// sidecar next to the HTML. Reads go via plain fetch() so the saved
// arrangement is visible anywhere the HTML + sidecar are served together
// (omelette preview, direct link, downloaded zip). Writes go through the
// host's window.omelette bridge — editing requires the omelette runtime.
// Focus is ephemeral.
// ─────────────────────────────────────────────────────────────
const DC_STATE_FILE = '.design-canvas.state.json';
function DesignCanvas({
  children,
  minScale,
  maxScale,
  style
}) {
  const [state, setState] = React.useState({
    sections: {},
    focus: null
  });
  // Hold rendering until the sidecar read settles so the saved order/titles
  // appear on first paint (no source-order flash). didRead gates writes until
  // the read settles so the empty initial state can't clobber a slow read;
  // skipNextWrite suppresses the one echo-write that would otherwise follow
  // hydration.
  const [ready, setReady] = React.useState(false);
  const didRead = React.useRef(false);
  const skipNextWrite = React.useRef(false);
  React.useEffect(() => {
    let off = false;
    fetch('./' + DC_STATE_FILE).then(r => r.ok ? r.json() : null).then(saved => {
      if (off || !saved || !saved.sections) return;
      skipNextWrite.current = true;
      setState(s => ({
        ...s,
        sections: saved.sections
      }));
    }).catch(() => {}).finally(() => {
      didRead.current = true;
      if (!off) setReady(true);
    });
    const t = setTimeout(() => {
      if (!off) setReady(true);
    }, 150);
    return () => {
      off = true;
      clearTimeout(t);
    };
  }, []);
  React.useEffect(() => {
    if (!didRead.current) return;
    if (skipNextWrite.current) {
      skipNextWrite.current = false;
      return;
    }
    const t = setTimeout(() => {
      window.omelette?.writeFile(DC_STATE_FILE, JSON.stringify({
        sections: state.sections
      })).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [state.sections]);

  // Build registries synchronously from children so FocusOverlay can read
  // them in the same render. Fragments are flattened; wrapping in other
  // elements still opts out of focus/reorder.
  const registry = {}; // slotId -> { sectionId, artboard }
  const sectionMeta = {}; // sectionId -> { title, subtitle, slotIds[] }
  const sectionOrder = [];
  dcFlatten(children).forEach(sec => {
    if (!sec || sec.type !== DCSection) return;
    const sid = sec.props.id ?? sec.props.title;
    if (!sid) return;
    sectionOrder.push(sid);
    const persisted = state.sections[sid] || {};
    const abs = [];
    dcFlatten(sec.props.children).forEach(ab => {
      if (!ab || ab.type !== DCArtboard) return;
      const aid = ab.props.id ?? ab.props.label;
      if (aid) abs.push([aid, ab]);
    });
    // hidden is scoped to one source revision — when the agent regenerates
    // (artboard-ID set changes), prior deletes don't apply to new content.
    const srcKey = abs.map(([k]) => k).join('\x1f');
    const hidden = persisted.srcKey === srcKey ? persisted.hidden || [] : [];
    const srcIds = [];
    abs.forEach(([aid, ab]) => {
      if (hidden.includes(aid)) return;
      registry[`${sid}/${aid}`] = {
        sectionId: sid,
        artboard: ab
      };
      srcIds.push(aid);
    });
    const kept = (persisted.order || []).filter(k => srcIds.includes(k));
    sectionMeta[sid] = {
      title: persisted.title ?? sec.props.title,
      subtitle: sec.props.subtitle,
      slotIds: [...kept, ...srcIds.filter(k => !kept.includes(k))]
    };
  });
  const api = React.useMemo(() => ({
    state,
    section: id => state.sections[id] || {},
    patchSection: (id, p) => setState(s => ({
      ...s,
      sections: {
        ...s.sections,
        [id]: {
          ...s.sections[id],
          ...(typeof p === 'function' ? p(s.sections[id] || {}) : p)
        }
      }
    })),
    setFocus: slotId => setState(s => ({
      ...s,
      focus: slotId
    }))
  }), [state]);

  // Esc exits focus; any outside pointerdown commits an in-progress rename.
  React.useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') api.setFocus(null);
    };
    const onPd = e => {
      const ae = document.activeElement;
      if (ae && ae.isContentEditable && !ae.contains(e.target)) ae.blur();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPd, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPd, true);
    };
  }, [api]);
  return /*#__PURE__*/React.createElement(DCCtx.Provider, {
    value: api
  }, /*#__PURE__*/React.createElement(DCViewport, {
    minScale: minScale,
    maxScale: maxScale,
    style: style
  }, ready && children), state.focus && registry[state.focus] && /*#__PURE__*/React.createElement(DCFocusOverlay, {
    entry: registry[state.focus],
    sectionMeta: sectionMeta,
    sectionOrder: sectionOrder
  }));
}

// ─────────────────────────────────────────────────────────────
// DCViewport — transform-based pan/zoom (internal)
//
// Input mapping (Figma-style):
//   • trackpad pinch  → zoom   (ctrlKey wheel; Safari gesture* events)
//   • trackpad scroll → pan    (two-finger)
//   • mouse wheel     → zoom   (notched; distinguished from trackpad scroll)
//   • middle-drag / primary-drag-on-bg → pan
//
// Transform state lives in a ref and is written straight to the DOM
// (translate3d + will-change) so wheel ticks don't go through React —
// keeps pans at 60fps on dense canvases.
// ─────────────────────────────────────────────────────────────
function DCViewport({
  children,
  minScale = 0.1,
  maxScale = 8,
  style = {}
}) {
  const vpRef = React.useRef(null);
  const worldRef = React.useRef(null);
  const tf = React.useRef({
    x: 0,
    y: 0,
    scale: 1
  });
  // Persist viewport across reloads so the user lands back where they were
  // after an agent edit or browser refresh. The sandbox origin is already
  // per-project; pathname keeps multiple canvas files in one project apart.
  const tfKey = 'dc-viewport:' + location.pathname;
  const saveT = React.useRef(0);
  const lastPostedScale = React.useRef();
  const apply = React.useCallback(() => {
    const {
      x,
      y,
      scale
    } = tf.current;
    const el = worldRef.current;
    if (!el) return;
    el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
    // Exposed for zoom-invariant chrome (labels, buttons, TweaksPanel).
    el.style.setProperty('--dc-inv-zoom', String(1 / scale));
    // Keep the host toolbar's % readout in sync with the canvas scale. Pan
    // ticks leave scale unchanged — skip the cross-frame post for those.
    if (lastPostedScale.current !== scale) {
      lastPostedScale.current = scale;
      window.parent.postMessage({
        type: '__dc_zoom',
        scale
      }, '*');
    }
    clearTimeout(saveT.current);
    saveT.current = setTimeout(() => {
      try {
        localStorage.setItem(tfKey, JSON.stringify(tf.current));
      } catch {}
    }, 200);
  }, [tfKey]);
  React.useLayoutEffect(() => {
    const flush = () => {
      clearTimeout(saveT.current);
      try {
        localStorage.setItem(tfKey, JSON.stringify(tf.current));
      } catch {}
    };
    try {
      const s = JSON.parse(localStorage.getItem(tfKey) || 'null');
      if (s && Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.scale)) {
        tf.current = {
          x: s.x,
          y: s.y,
          scale: Math.min(maxScale, Math.max(minScale, s.scale))
        };
        apply();
      }
    } catch {}
    // Flush on pagehide and unmount so a reload within the 200ms debounce
    // window doesn't drop the last pan/zoom.
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);
  React.useEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    const zoomAt = (cx, cy, factor) => {
      const r = vp.getBoundingClientRect();
      const px = cx - r.left,
        py = cy - r.top;
      const t = tf.current;
      const next = Math.min(maxScale, Math.max(minScale, t.scale * factor));
      const k = next / t.scale;
      // --dc-inv-zoom consumers (.dc-sectionhead's CSS zoom, each section's
      // marginBottom) reflow on every scale change, vertically shifting the
      // world layout — so a world point mathematically pinned under the cursor
      // drifts as you zoom (content creeps up on zoom-in, down on zoom-out).
      // Anchor the DOM element under the cursor instead: record its screen Y,
      // apply the transform + --dc-inv-zoom, then cancel whatever vertical
      // drift the reflow introduced so it stays put on screen.
      let marker = null,
        markerY0 = 0;
      if (k !== 1) {
        const hit = document.elementFromPoint(cx, cy);
        marker = hit && hit.closest ? hit.closest('[data-dc-slot],[data-dc-section]') : null;
        if (marker) markerY0 = marker.getBoundingClientRect().top;
      }
      // keep the world point under the cursor fixed
      t.x = px - (px - t.x) * k;
      t.y = py - (py - t.y) * k;
      t.scale = next;
      apply();
      if (marker) {
        // A pure zoom around (cx, cy) maps screen Y → cy + (Y - cy) * k. Any
        // departure after the --dc-inv-zoom reflow is the layout drift.
        const drift = marker.getBoundingClientRect().top - (cy + (markerY0 - cy) * k);
        if (Math.abs(drift) > 0.1) {
          t.y -= drift;
          apply();
        }
      }
    };

    // Mouse-wheel vs trackpad-scroll heuristic. A physical wheel sends
    // line-mode deltas (Firefox) or large integer pixel deltas with no X
    // component (Chrome/Safari, typically multiples of 100/120). Trackpad
    // two-finger scroll sends small/fractional pixel deltas, often with
    // non-zero deltaX. ctrlKey is set by the browser for trackpad pinch.
    const isMouseWheel = e => e.deltaMode !== 0 || e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 40;
    const onWheel = e => {
      e.preventDefault();
      if (isGesturing) return; // Safari: gesture* owns the pinch — discard concurrent wheels
      if ((e.ctrlKey || e.metaKey) && !isMouseWheel(e)) {
        // trackpad pinch, or ctrl/cmd + smooth-scroll mouse. Notched
        // wheels fall through to the fixed-step branch below.
        zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01));
      } else if (isMouseWheel(e)) {
        // notched mouse wheel — fixed-ratio step per click
        zoomAt(e.clientX, e.clientY, Math.exp(-Math.sign(e.deltaY) * 0.18));
      } else {
        // trackpad two-finger scroll — pan
        tf.current.x -= e.deltaX;
        tf.current.y -= e.deltaY;
        apply();
      }
    };

    // Safari sends native gesture* events for trackpad pinch with a smooth
    // e.scale; preferring these over the ctrl+wheel fallback gives a much
    // better feel there. No-ops on other browsers. Safari also fires
    // ctrlKey wheel events during the same pinch — isGesturing makes
    // onWheel drop those entirely so they neither zoom nor pan.
    let gsBase = 1;
    let isGesturing = false;
    const onGestureStart = e => {
      e.preventDefault();
      isGesturing = true;
      gsBase = tf.current.scale;
    };
    const onGestureChange = e => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, gsBase * e.scale / tf.current.scale);
    };
    const onGestureEnd = e => {
      e.preventDefault();
      isGesturing = false;
    };

    // Drag-pan: middle button anywhere, or primary button on canvas
    // background (anything that isn't an artboard or an inline editor).
    let drag = null;
    const onPointerDown = e => {
      const onBg = !e.target.closest('[data-dc-slot], .dc-editable');
      if (!(e.button === 1 || e.button === 0 && onBg)) return;
      e.preventDefault();
      vp.setPointerCapture(e.pointerId);
      drag = {
        id: e.pointerId,
        lx: e.clientX,
        ly: e.clientY
      };
      vp.style.cursor = 'grabbing';
    };
    const onPointerMove = e => {
      if (!drag || e.pointerId !== drag.id) return;
      tf.current.x += e.clientX - drag.lx;
      tf.current.y += e.clientY - drag.ly;
      drag.lx = e.clientX;
      drag.ly = e.clientY;
      apply();
    };
    const onPointerUp = e => {
      if (!drag || e.pointerId !== drag.id) return;
      vp.releasePointerCapture(e.pointerId);
      drag = null;
      vp.style.cursor = '';
    };

    // Host-driven zoom (toolbar % menu). Zooms around viewport centre so the
    // visible midpoint stays fixed — matching the host's iframe-zoom feel.
    const onHostMsg = e => {
      const d = e.data;
      if (d && d.type === '__dc_set_zoom' && typeof d.scale === 'number') {
        const r = vp.getBoundingClientRect();
        zoomAt(r.left + r.width / 2, r.top + r.height / 2, d.scale / tf.current.scale);
      } else if (d && d.type === '__dc_probe') {
        // Host's [readyGen] reset asks whether a canvas is present; it
        // fires on the iframe's native 'load', which for canvases with
        // images/fonts is after our mount-time announce, so re-announce.
        // Clear the pan-tick guard so apply() re-posts the current scale
        // even if it's unchanged — the host just reset dcScale to 1.
        window.parent.postMessage({
          type: '__dc_present'
        }, '*');
        lastPostedScale.current = undefined;
        apply();
      }
    };
    window.addEventListener('message', onHostMsg);
    // Announce canvas mode so the host toolbar proxies its % control here
    // instead of scaling the iframe element (which would just shrink the
    // viewport window of an infinite canvas). The apply() that follows emits
    // the initial __dc_zoom so the toolbar % is correct before first pinch.
    // lastPostedScale reset mirrors the __dc_probe handler: the layout
    // effect's restore-path apply() may already have posted the restored
    // scale (before __dc_present), so clear the guard to re-post it in order.
    window.parent.postMessage({
      type: '__dc_present'
    }, '*');
    lastPostedScale.current = undefined;
    apply();
    vp.addEventListener('wheel', onWheel, {
      passive: false
    });
    vp.addEventListener('gesturestart', onGestureStart, {
      passive: false
    });
    vp.addEventListener('gesturechange', onGestureChange, {
      passive: false
    });
    vp.addEventListener('gestureend', onGestureEnd, {
      passive: false
    });
    vp.addEventListener('pointerdown', onPointerDown);
    vp.addEventListener('pointermove', onPointerMove);
    vp.addEventListener('pointerup', onPointerUp);
    vp.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('message', onHostMsg);
      vp.removeEventListener('wheel', onWheel);
      vp.removeEventListener('gesturestart', onGestureStart);
      vp.removeEventListener('gesturechange', onGestureChange);
      vp.removeEventListener('gestureend', onGestureEnd);
      vp.removeEventListener('pointerdown', onPointerDown);
      vp.removeEventListener('pointermove', onPointerMove);
      vp.removeEventListener('pointerup', onPointerUp);
      vp.removeEventListener('pointercancel', onPointerUp);
    };
  }, [apply, minScale, maxScale]);
  const gridSvg = `url("data:image/svg+xml,%3Csvg width='120' height='120' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M120 0H0v120' fill='none' stroke='${encodeURIComponent(DC.grid)}' stroke-width='1'/%3E%3C/svg%3E")`;
  return /*#__PURE__*/React.createElement("div", {
    ref: vpRef,
    className: "design-canvas",
    style: {
      height: '100vh',
      width: '100vw',
      background: DC.bg,
      overflow: 'hidden',
      overscrollBehavior: 'none',
      touchAction: 'none',
      position: 'relative',
      fontFamily: DC.font,
      boxSizing: 'border-box',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    ref: worldRef,
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      transformOrigin: '0 0',
      willChange: 'transform',
      width: 'max-content',
      minWidth: '100%',
      minHeight: '100%',
      padding: '60px 0 80px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: -6000,
      backgroundImage: gridSvg,
      backgroundSize: '120px 120px',
      pointerEvents: 'none',
      zIndex: -1
    }
  }), children));
}

// ─────────────────────────────────────────────────────────────
// DCSection — editable title + h-row of artboards in persisted order
// ─────────────────────────────────────────────────────────────
function DCSection({
  id,
  title,
  subtitle,
  children,
  gap = 48
}) {
  const ctx = React.useContext(DCCtx);
  const sid = id ?? title;
  const all = React.Children.toArray(dcFlatten(children));
  const artboards = all.filter(c => c && c.type === DCArtboard);
  const rest = all.filter(c => !(c && c.type === DCArtboard));
  const sec = ctx && sid && ctx.section(sid) || {};
  // Must match DesignCanvas's srcKey computation exactly (it filters falsy
  // IDs), or onDelete persists a srcKey that DesignCanvas never recognizes.
  const allIds = artboards.map(a => a.props.id ?? a.props.label).filter(Boolean);
  const srcKey = allIds.join('\x1f');
  const hidden = sec.srcKey === srcKey ? sec.hidden || [] : [];
  const srcOrder = allIds.filter(k => !hidden.includes(k));
  const order = React.useMemo(() => {
    const kept = (sec.order || []).filter(k => srcOrder.includes(k));
    return [...kept, ...srcOrder.filter(k => !kept.includes(k))];
  }, [sec.order, srcOrder.join('|')]);
  const byId = Object.fromEntries(artboards.map(a => [a.props.id ?? a.props.label, a]));

  // marginBottom counter-scales so the on-screen gap between sections stays
  // constant — otherwise at low zoom the (world-space) gap collapses while
  // the screen-constant sectionhead below it doesn't, and the title reads as
  // belonging to the section above. paddingBottom below is just enough for
  // the 24px artboard-header (abs-positioned above each card) plus ~8px, so
  // the title sits tight against its own row at every zoom.
  return /*#__PURE__*/React.createElement("div", {
    "data-dc-section": sid,
    style: {
      marginBottom: 'calc(80px * var(--dc-inv-zoom, 1))',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 60px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "dc-sectionhead",
    style: {
      paddingBottom: 36
    }
  }, /*#__PURE__*/React.createElement(DCEditable, {
    tag: "div",
    value: sec.title ?? title,
    onChange: v => ctx && sid && ctx.patchSection(sid, {
      title: v
    }),
    style: {
      fontSize: 28,
      fontWeight: 600,
      color: DC.title,
      letterSpacing: -0.4,
      marginBottom: 6,
      display: 'inline-block'
    }
  }), subtitle && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      color: DC.subtitle
    }
  }, subtitle))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap,
      padding: '0 60px',
      alignItems: 'flex-start',
      width: 'max-content'
    }
  }, order.map(k => /*#__PURE__*/React.createElement(DCArtboardFrame, {
    key: k,
    sectionId: sid,
    artboard: byId[k],
    order: order,
    label: (sec.labels || {})[k] ?? byId[k].props.label,
    onRename: v => ctx && ctx.patchSection(sid, x => ({
      labels: {
        ...x.labels,
        [k]: v
      }
    })),
    onReorder: next => ctx && ctx.patchSection(sid, {
      order: next
    }),
    onDelete: () => ctx && ctx.patchSection(sid, x => ({
      hidden: [...(x.srcKey === srcKey ? x.hidden || [] : []), k],
      srcKey
    })),
    onFocus: () => ctx && ctx.setFocus(`${sid}/${k}`)
  }))), rest);
}

// DCArtboard — marker; rendered by DCArtboardFrame via DCSection.
function DCArtboard() {
  return null;
}

// Per-artboard export (kind: 'png' | 'html'). Both paths share the same
// self-contained clone: computed styles baked in, @font-face / <img> /
// inline-style background-image urls inlined as data URIs. PNG wraps the
// clone in foreignObject→canvas at 3× the artboard's natural width×height
// (same pipeline the host uses for page captures); HTML wraps it in a
// minimal standalone document. Both are independent of viewport zoom.
async function dcExport(node, w, h, name, kind) {
  try {
    await document.fonts.ready;
  } catch {}
  const toDataURL = url => fetch(url).then(r => r.blob()).then(b => new Promise(res => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => res(url);
    fr.readAsDataURL(b);
  })).catch(() => url);

  // Collect @font-face rules. ss.cssRules throws SecurityError on
  // cross-origin sheets (e.g. fonts.googleapis.com) — in that case fetch
  // the CSS text directly (those endpoints send ACAO:*) and regex-extract
  // the blocks. @import and @media/@supports are walked so nested
  // @font-face rules aren't missed.
  const fontRules = [],
    pending = [],
    seen = new Set();
  const scrapeCss = href => {
    if (seen.has(href)) return;
    seen.add(href);
    pending.push(fetch(href).then(r => r.text()).then(css => {
      for (const m of css.match(/@font-face\s*{[^}]*}/g) || []) fontRules.push({
        css: m,
        base: href
      });
      for (const m of css.matchAll(/@import\s+(?:url\()?['"]?([^'")\s;]+)/g)) scrapeCss(new URL(m[1], href).href);
    }).catch(() => {}));
  };
  const walk = (rules, base) => {
    for (const r of rules) {
      if (r.type === CSSRule.FONT_FACE_RULE) fontRules.push({
        css: r.cssText,
        base
      });else if (r.type === CSSRule.IMPORT_RULE && r.styleSheet) {
        const ibase = r.styleSheet.href || base;
        try {
          walk(r.styleSheet.cssRules, ibase);
        } catch {
          scrapeCss(ibase);
        }
      } else if (r.cssRules) walk(r.cssRules, base);
    }
  };
  for (const ss of document.styleSheets) {
    const base = ss.href || location.href;
    try {
      walk(ss.cssRules, base);
    } catch {
      if (ss.href) scrapeCss(ss.href);
    }
  }
  while (pending.length) await pending.shift();
  const fontCss = (await Promise.all(fontRules.map(async rule => {
    let out = rule.css,
      m;
    const re = /url\((['"]?)([^'")]+)\1\)/g;
    while (m = re.exec(rule.css)) {
      if (m[2].indexOf('data:') === 0) continue;
      let abs;
      try {
        abs = new URL(m[2], rule.base).href;
      } catch {
        continue;
      }
      out = out.split(m[0]).join('url("' + (await toDataURL(abs)) + '")');
    }
    return out;
  }))).join('\n');
  const cloneStyled = src => {
    if (src.nodeType === 8 || src.nodeType === 1 && src.tagName === 'SCRIPT') return document.createTextNode('');
    const dst = src.cloneNode(false);
    if (src.nodeType === 1) {
      const cs = getComputedStyle(src);
      let txt = '';
      for (let i = 0; i < cs.length; i++) txt += cs[i] + ':' + cs.getPropertyValue(cs[i]) + ';';
      dst.setAttribute('style', txt + 'animation:none;transition:none;');
      if (src.tagName === 'CANVAS') try {
        const im = document.createElement('img');
        im.src = src.toDataURL();
        im.setAttribute('style', txt);
        return im;
      } catch {}
    }
    for (let c = src.firstChild; c; c = c.nextSibling) dst.appendChild(cloneStyled(c));
    return dst;
  };
  const clone = cloneStyled(node);
  clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  // Drop the card's own shadow/radius so the export is a flush w×h rect;
  // the artboard's own background (if any) is already in the computed style.
  clone.style.boxShadow = 'none';
  clone.style.borderRadius = '0';
  const jobs = [];
  clone.querySelectorAll('img').forEach(el => {
    const s = el.getAttribute('src');
    if (s && s.indexOf('data:') !== 0) jobs.push(toDataURL(el.src).then(d => el.setAttribute('src', d)));
  });
  [clone, ...clone.querySelectorAll('*')].forEach(el => {
    const bg = el.style.backgroundImage;
    if (!bg) return;
    let m;
    const re = /url\(["']?([^"')]+)["']?\)/g;
    while (m = re.exec(bg)) {
      const tok = m[0],
        url = m[1];
      if (url.indexOf('data:') === 0) continue;
      jobs.push(toDataURL(url).then(d => {
        el.style.backgroundImage = el.style.backgroundImage.split(tok).join('url("' + d + '")');
      }));
    }
  });
  await Promise.all(jobs);
  const xml = new XMLSerializer().serializeToString(clone);
  const save = (blob, ext) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name + '.' + ext;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  if (kind === 'html') {
    const html = '<!doctype html><html><head><meta charset="utf-8"><title>' + name + '</title>' + (fontCss ? '<style>' + fontCss + '</style>' : '') + '</head><body style="margin:0">' + xml + '</body></html>';
    return save(new Blob([html], {
      type: 'text/html'
    }), 'html');
  }

  // PNG: the SVG's own width/height must be the output resolution — an
  // <img>-loaded SVG rasterizes at its intrinsic size, so sizing it at 1×
  // and ctx.scale()-ing up would just upscale a 1× bitmap. viewBox maps the
  // w×h foreignObject onto the px·w × px·h SVG canvas so the browser renders
  // the HTML at full resolution.
  const px = 3;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w * px + '" height="' + h * px + '" viewBox="0 0 ' + w + ' ' + h + '"><foreignObject width="' + w + '" height="' + h + '">' + (fontCss ? '<style><![CDATA[' + fontCss + ']]></style>' : '') + xml + '</foreignObject></svg>';
  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = () => rej(new Error('svg load failed'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
  const cv = document.createElement('canvas');
  cv.width = w * px;
  cv.height = h * px;
  cv.getContext('2d').drawImage(img, 0, 0);
  cv.toBlob(blob => save(blob, 'png'), 'image/png');
}
function DCArtboardFrame({
  sectionId,
  artboard,
  label,
  order,
  onRename,
  onReorder,
  onFocus,
  onDelete
}) {
  const {
    id: rawId,
    label: rawLabel,
    width = 260,
    height = 480,
    children,
    style = {}
  } = artboard.props;
  const id = rawId ?? rawLabel;
  const ref = React.useRef(null);
  const cardRef = React.useRef(null);
  const menuRef = React.useRef(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

  // ⋯ menu: close on any outside pointerdown. Two-click delete lives inside
  // the menu — first click arms the row, second commits; closing disarms.
  React.useEffect(() => {
    if (!menuOpen) {
      setConfirming(false);
      return;
    }
    const off = e => {
      if (!menuRef.current || !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', off, true);
    return () => document.removeEventListener('pointerdown', off, true);
  }, [menuOpen]);
  const doExport = kind => {
    setMenuOpen(false);
    if (!cardRef.current) return;
    const name = String(label || id || 'artboard').replace(/[^\w\s.-]+/g, '_');
    dcExport(cardRef.current, width, height, name, kind).catch(e => console.error('[design-canvas] export failed:', e));
  };

  // Live drag-reorder: dragged card sticks to cursor; siblings slide into
  // their would-be slots in real time via transforms. DOM order only
  // changes on drop.
  const onGripDown = e => {
    e.preventDefault();
    e.stopPropagation();
    const me = ref.current;
    // translateX is applied in local (pre-scale) space but pointer deltas and
    // getBoundingClientRect().left are screen-space — divide by the viewport's
    // current scale so the dragged card tracks the cursor at any zoom level.
    const scale = me.getBoundingClientRect().width / me.offsetWidth || 1;
    const peers = Array.from(document.querySelectorAll(`[data-dc-section="${sectionId}"] [data-dc-slot]`));
    const homes = peers.map(el => ({
      el,
      id: el.dataset.dcSlot,
      x: el.getBoundingClientRect().left
    }));
    const slotXs = homes.map(h => h.x);
    const startIdx = order.indexOf(id);
    const startX = e.clientX;
    let liveOrder = order.slice();
    me.classList.add('dc-dragging');
    const layout = () => {
      for (const h of homes) {
        if (h.id === id) continue;
        const slot = liveOrder.indexOf(h.id);
        h.el.style.transform = `translateX(${(slotXs[slot] - h.x) / scale}px)`;
      }
    };
    const move = ev => {
      const dx = ev.clientX - startX;
      me.style.transform = `translateX(${dx / scale}px)`;
      const cur = homes[startIdx].x + dx;
      let nearest = 0,
        best = Infinity;
      for (let i = 0; i < slotXs.length; i++) {
        const d = Math.abs(slotXs[i] - cur);
        if (d < best) {
          best = d;
          nearest = i;
        }
      }
      if (liveOrder.indexOf(id) !== nearest) {
        liveOrder = order.filter(k => k !== id);
        liveOrder.splice(nearest, 0, id);
        layout();
      }
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      const finalSlot = liveOrder.indexOf(id);
      me.classList.remove('dc-dragging');
      me.style.transform = `translateX(${(slotXs[finalSlot] - homes[startIdx].x) / scale}px)`;
      // After the settle transition, kill transitions + clear transforms +
      // commit the reorder in the same frame so there's no visual snap-back.
      setTimeout(() => {
        for (const h of homes) {
          h.el.style.transition = 'none';
          h.el.style.transform = '';
        }
        if (liveOrder.join('|') !== order.join('|')) onReorder(liveOrder);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          for (const h of homes) h.el.style.transition = '';
        }));
      }, 180);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  };
  return /*#__PURE__*/React.createElement("div", {
    ref: ref,
    "data-dc-slot": id,
    style: {
      position: 'relative',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "dc-header",
    "data-omelette-chrome": "",
    style: {
      color: DC.label
    },
    onPointerDown: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("div", {
    className: "dc-labelrow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "dc-grip",
    onPointerDown: onGripDown,
    title: "Drag to reorder"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "9",
    height: "13",
    viewBox: "0 0 9 13",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "2",
    cy: "2",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "7",
    cy: "2",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "2",
    cy: "6.5",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "7",
    cy: "6.5",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "2",
    cy: "11",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "7",
    cy: "11",
    r: "1.1"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "dc-labeltext",
    onClick: onFocus,
    title: "Click to focus"
  }, /*#__PURE__*/React.createElement(DCEditable, {
    value: label,
    onChange: onRename,
    onClick: e => e.stopPropagation(),
    style: {
      fontSize: 15,
      fontWeight: 500,
      color: DC.label,
      lineHeight: 1
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "dc-btns"
  }, /*#__PURE__*/React.createElement("div", {
    ref: menuRef,
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "dc-kebab",
    title: "More",
    onClick: () => setMenuOpen(o => !o)
  }, /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 12 12",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "2.5",
    cy: "6",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "6",
    cy: "6",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "9.5",
    cy: "6",
    r: "1.1"
  }))), menuOpen && /*#__PURE__*/React.createElement("div", {
    className: "dc-menu",
    onPointerDown: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => doExport('png')
  }, "Download PNG"), /*#__PURE__*/React.createElement("button", {
    onClick: () => doExport('html')
  }, "Download HTML"), /*#__PURE__*/React.createElement("hr", null), /*#__PURE__*/React.createElement("button", {
    className: "dc-danger",
    onClick: () => {
      if (confirming) {
        setMenuOpen(false);
        onDelete();
      } else setConfirming(true);
    }
  }, confirming ? 'Click again to delete' : 'Delete'))), /*#__PURE__*/React.createElement("button", {
    className: "dc-expand",
    onClick: onFocus,
    title: "Focus"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 12 12",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.6",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M7 1h4v4M5 11H1V7M11 1L7.5 4.5M1 11l3.5-3.5"
  }))))), /*#__PURE__*/React.createElement("div", {
    ref: cardRef,
    className: "dc-card",
    style: {
      borderRadius: 2,
      boxShadow: '0 1px 3px rgba(0,0,0,.08),0 4px 16px rgba(0,0,0,.06)',
      overflow: 'hidden',
      width,
      height,
      background: '#fff',
      ...style
    }
  }, children || /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#bbb',
      fontSize: 13,
      fontFamily: DC.font
    }
  }, id)));
}

// Inline rename — commits on blur or Enter.
function DCEditable({
  value,
  onChange,
  style,
  tag = 'span',
  onClick
}) {
  const T = tag;
  return /*#__PURE__*/React.createElement(T, {
    className: "dc-editable",
    contentEditable: true,
    suppressContentEditableWarning: true,
    onClick: onClick,
    onPointerDown: e => e.stopPropagation(),
    onBlur: e => onChange && onChange(e.currentTarget.textContent),
    onKeyDown: e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.currentTarget.blur();
      }
    },
    style: style
  }, value);
}

// ─────────────────────────────────────────────────────────────
// Focus mode — overlay one artboard; ←/→ within section, ↑/↓ across
// sections, Esc or backdrop click to exit.
// ─────────────────────────────────────────────────────────────
function DCFocusOverlay({
  entry,
  sectionMeta,
  sectionOrder
}) {
  const ctx = React.useContext(DCCtx);
  const {
    sectionId,
    artboard
  } = entry;
  const sec = ctx.section(sectionId);
  const meta = sectionMeta[sectionId];
  const peers = meta.slotIds;
  const aid = artboard.props.id ?? artboard.props.label;
  const idx = peers.indexOf(aid);
  const secIdx = sectionOrder.indexOf(sectionId);
  const go = d => {
    const n = peers[(idx + d + peers.length) % peers.length];
    if (n) ctx.setFocus(`${sectionId}/${n}`);
  };
  const goSection = d => {
    // Sections whose artboards are all deleted have slotIds:[] — step past
    // them to the next non-empty section so ↑/↓ doesn't dead-end.
    const n = sectionOrder.length;
    for (let i = 1; i < n; i++) {
      const ns = sectionOrder[((secIdx + d * i) % n + n) % n];
      const first = sectionMeta[ns] && sectionMeta[ns].slotIds[0];
      if (first) {
        ctx.setFocus(`${ns}/${first}`);
        return;
      }
    }
  };
  React.useEffect(() => {
    const k = e => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(-1);
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        go(1);
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        goSection(-1);
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        goSection(1);
      }
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  });
  const {
    width = 260,
    height = 480,
    children
  } = artboard.props;
  const [vp, setVp] = React.useState({
    w: window.innerWidth,
    h: window.innerHeight
  });
  React.useEffect(() => {
    const r = () => setVp({
      w: window.innerWidth,
      h: window.innerHeight
    });
    window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
  }, []);
  const scale = Math.max(0.1, Math.min((vp.w - 200) / width, (vp.h - 260) / height, 2));
  const [ddOpen, setDd] = React.useState(false);
  const Arrow = ({
    dir,
    onClick
  }) => /*#__PURE__*/React.createElement("button", {
    onClick: e => {
      e.stopPropagation();
      onClick();
    },
    style: {
      position: 'absolute',
      top: '50%',
      [dir]: 28,
      transform: 'translateY(-50%)',
      border: 'none',
      background: 'rgba(255,255,255,.08)',
      color: 'rgba(255,255,255,.9)',
      width: 44,
      height: 44,
      borderRadius: 22,
      fontSize: 18,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'background .15s'
    },
    onMouseEnter: e => e.currentTarget.style.background = 'rgba(255,255,255,.18)',
    onMouseLeave: e => e.currentTarget.style.background = 'rgba(255,255,255,.08)'
  }, /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 18 18",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: dir === 'left' ? 'M11 3L5 9l6 6' : 'M7 3l6 6-6 6'
  })));

  // Portal to body so position:fixed is the real viewport regardless of any
  // transform on DesignCanvas's ancestors (including the canvas zoom itself).
  return ReactDOM.createPortal(/*#__PURE__*/React.createElement("div", {
    onClick: () => ctx.setFocus(null),
    onWheel: e => e.preventDefault(),
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 100,
      background: 'rgba(24,20,16,.6)',
      backdropFilter: 'blur(14px)',
      fontFamily: DC.font,
      color: '#fff'
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 72,
      display: 'flex',
      alignItems: 'flex-start',
      padding: '16px 20px 0',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setDd(o => !o),
    style: {
      border: 'none',
      background: 'transparent',
      color: '#fff',
      cursor: 'pointer',
      padding: '6px 8px',
      borderRadius: 6,
      textAlign: 'left',
      fontFamily: 'inherit'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 18,
      fontWeight: 600,
      letterSpacing: -0.3
    }
  }, meta.title), /*#__PURE__*/React.createElement("svg", {
    width: "11",
    height: "11",
    viewBox: "0 0 11 11",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    style: {
      opacity: .7
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M2 4l3.5 3.5L9 4"
  }))), meta.subtitle && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 13,
      opacity: .6,
      fontWeight: 400,
      marginTop: 2
    }
  }, meta.subtitle)), ddOpen && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: '100%',
      left: 0,
      marginTop: 4,
      background: '#2a251f',
      borderRadius: 8,
      boxShadow: '0 8px 32px rgba(0,0,0,.4)',
      padding: 4,
      minWidth: 200,
      zIndex: 10
    }
  }, sectionOrder.filter(sid => sectionMeta[sid].slotIds.length).map(sid => /*#__PURE__*/React.createElement("button", {
    key: sid,
    onClick: () => {
      setDd(false);
      const f = sectionMeta[sid].slotIds[0];
      if (f) ctx.setFocus(`${sid}/${f}`);
    },
    style: {
      display: 'block',
      width: '100%',
      textAlign: 'left',
      border: 'none',
      cursor: 'pointer',
      background: sid === sectionId ? 'rgba(255,255,255,.1)' : 'transparent',
      color: '#fff',
      padding: '8px 12px',
      borderRadius: 5,
      fontSize: 14,
      fontWeight: sid === sectionId ? 600 : 400,
      fontFamily: 'inherit'
    }
  }, sectionMeta[sid].title)))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => ctx.setFocus(null),
    onMouseEnter: e => e.currentTarget.style.background = 'rgba(255,255,255,.12)',
    onMouseLeave: e => e.currentTarget.style.background = 'transparent',
    style: {
      border: 'none',
      background: 'transparent',
      color: 'rgba(255,255,255,.7)',
      width: 32,
      height: 32,
      borderRadius: 16,
      fontSize: 20,
      cursor: 'pointer',
      lineHeight: 1,
      transition: 'background .12s'
    }
  }, "\xD7")), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 64,
      bottom: 56,
      left: 100,
      right: 100,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      width: width * scale,
      height: height * scale,
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width,
      height,
      transform: `scale(${scale})`,
      transformOrigin: 'top left',
      background: '#fff',
      borderRadius: 2,
      overflow: 'hidden',
      boxShadow: '0 20px 80px rgba(0,0,0,.4)'
    }
  }, children || /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#bbb'
    }
  }, aid))), /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      fontSize: 14,
      fontWeight: 500,
      opacity: .85,
      textAlign: 'center'
    }
  }, (sec.labels || {})[aid] ?? artboard.props.label, /*#__PURE__*/React.createElement("span", {
    style: {
      opacity: .5,
      marginLeft: 10,
      fontVariantNumeric: 'tabular-nums'
    }
  }, idx + 1, " / ", peers.length))), /*#__PURE__*/React.createElement(Arrow, {
    dir: "left",
    onClick: () => go(-1)
  }), /*#__PURE__*/React.createElement(Arrow, {
    dir: "right",
    onClick: () => go(1)
  }), /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      position: 'absolute',
      bottom: 20,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      gap: 8
    }
  }, peers.map((p, i) => /*#__PURE__*/React.createElement("button", {
    key: p,
    onClick: () => ctx.setFocus(`${sectionId}/${p}`),
    style: {
      border: 'none',
      padding: 0,
      cursor: 'pointer',
      width: 6,
      height: 6,
      borderRadius: 3,
      background: i === idx ? '#fff' : 'rgba(255,255,255,.3)'
    }
  })))), document.body);
}

// ─────────────────────────────────────────────────────────────
// Post-it — absolute-positioned sticky note
// ─────────────────────────────────────────────────────────────
function DCPostIt({
  children,
  top,
  left,
  right,
  bottom,
  rotate = -2,
  width = 180
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top,
      left,
      right,
      bottom,
      width,
      background: DC.postitBg,
      padding: '14px 16px',
      fontFamily: '"Comic Sans MS", "Marker Felt", "Segoe Print", cursive',
      fontSize: 14,
      lineHeight: 1.4,
      color: DC.postitText,
      boxShadow: '0 2px 8px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)',
      transform: `rotate(${rotate}deg)`,
      zIndex: 5
    }
  }, children);
}
Object.assign(window, {
  DesignCanvas,
  DCSection,
  DCArtboard,
  DCPostIt
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "design-canvas.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/ClaimsList.jsx
try { (() => {
// ClaimsList.jsx — claims table + summary stats. Exports ClaimsList to window.

function Stat({
  label,
  value,
  sub,
  tone
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      background: '#fff',
      border: '1px solid var(--color-border)',
      borderRadius: 12,
      padding: '16px 18px',
      boxShadow: 'var(--shadow-sm)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 10.5,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color: 'var(--ink-400)'
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 8,
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement(Money, {
    size: 26,
    weight: 600,
    color: tone || 'var(--ink-900)'
  }, value), sub && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 12.5,
      color: 'var(--ink-400)'
    }
  }, sub)));
}
function Row({
  c,
  onOpen
}) {
  const [h, setH] = React.useState(false);
  const reco = RECO[c.recommendation];
  const queued = c.status === 'queued';
  const delta = c.rec - c.reserveCurrent;
  return /*#__PURE__*/React.createElement("tr", {
    onClick: () => onOpen(c),
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    style: {
      cursor: 'pointer',
      background: h ? 'var(--ink-50)' : '#fff',
      transition: 'background .1s'
    }
  }, /*#__PURE__*/React.createElement("td", {
    style: cellId
  }, /*#__PURE__*/React.createElement(Money, {
    size: 13,
    weight: 500,
    color: "var(--brand-700)"
  }, c.id)), /*#__PURE__*/React.createElement("td", {
    style: cell
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 600,
      color: 'var(--ink-900)',
      lineHeight: 1.3
    }
  }, c.claimant), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: 'var(--ink-400)',
      lineHeight: 1.3,
      marginTop: 1
    }
  }, c.type, " \xB7 ", c.jurisdiction)), /*#__PURE__*/React.createElement("td", {
    style: {
      ...cell,
      textAlign: 'right'
    }
  }, queued ? /*#__PURE__*/React.createElement("span", {
    style: dash
  }, "\u2014") : /*#__PURE__*/React.createElement(Money, {
    size: 14
  }, fmtK(c.demand))), /*#__PURE__*/React.createElement("td", {
    style: {
      ...cell,
      textAlign: 'right'
    }
  }, queued ? /*#__PURE__*/React.createElement("span", {
    style: dash
  }, "\u2014") : /*#__PURE__*/React.createElement(Money, {
    size: 14,
    color: "var(--ink-700)"
  }, fmtK(c.low), " \u2013 ", fmtK(c.high))), /*#__PURE__*/React.createElement("td", {
    style: {
      ...cell
    }
  }, queued ? /*#__PURE__*/React.createElement(Badge, {
    tone: "neutral",
    dot: true
  }, "Queued") : /*#__PURE__*/React.createElement(Badge, {
    tone: reco.tone,
    dot: true
  }, reco.label.replace('Recommend ', ''))), /*#__PURE__*/React.createElement("td", {
    style: {
      ...cell,
      textAlign: 'right'
    }
  }, queued ? /*#__PURE__*/React.createElement("span", {
    style: dash
  }, "\u2014") : /*#__PURE__*/React.createElement(Money, {
    size: 14,
    color: delta > 0 ? 'var(--warn-600)' : 'var(--ok-600)'
  }, delta >= 0 ? '+' : '−', fmtK(Math.abs(delta)))), /*#__PURE__*/React.createElement("td", {
    style: {
      ...cell,
      textAlign: 'right',
      color: 'var(--ink-400)',
      fontSize: 12.5
    }
  }, c.updated), /*#__PURE__*/React.createElement("td", {
    style: {
      ...cell,
      width: 30
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    n: "chevron-right",
    size: 16,
    color: h ? 'var(--ink-500)' : 'var(--ink-300)'
  })));
}
const cell = {
  padding: '14px 16px',
  borderBottom: '1px solid var(--color-border)',
  fontFamily: 'var(--font-sans)',
  fontSize: 14,
  color: 'var(--ink-700)',
  verticalAlign: 'middle',
  whiteSpace: 'nowrap'
};
const cellId = {
  ...cell
};
const dash = {
  color: 'var(--ink-300)',
  fontFamily: 'var(--font-mono)'
};
const th = {
  padding: '0 16px 10px',
  textAlign: 'left',
  fontFamily: 'var(--font-mono)',
  fontSize: 10.5,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--ink-400)',
  fontWeight: 500
};
function ClaimsList({
  claims,
  onOpen,
  search
}) {
  const filtered = claims.filter(c => !search || (c.id + ' ' + c.claimant + ' ' + c.policy + ' ' + c.type).toLowerCase().includes(search.toLowerCase()));
  const open = claims.filter(c => c.status !== 'queued');
  const flagged = open.reduce((s, c) => s + c.lineItems.reduce((a, li) => a + (li.inflated || 0), 0), 0);
  const avgRed = Math.round(open.reduce((s, c) => s + (1 - c.rec / c.demand), 0) / open.length * 100);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '28px 32px',
      maxWidth: 1080,
      margin: '0 auto',
      width: '100%',
      boxSizing: 'border-box'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 16,
      marginBottom: 26
    }
  }, /*#__PURE__*/React.createElement(Stat, {
    label: "Open claims",
    value: "12",
    sub: "across 2 policies"
  }), /*#__PURE__*/React.createElement(Stat, {
    label: "Inflated demand flagged",
    value: fmtK(flagged),
    sub: "this week",
    tone: "var(--warn-600)"
  }), /*#__PURE__*/React.createElement(Stat, {
    label: "Avg. defensible reduction",
    value: avgRed + '%',
    sub: "vs. demand",
    tone: "var(--brand-700)"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("h2", {
    className: "e-h3",
    style: {
      margin: 0,
      whiteSpace: 'nowrap'
    }
  }, "Active claims"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    icon: "sliders-horizontal"
  }, "Filter"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    icon: "arrow-up-down"
  }, "Sort"))), /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid var(--color-border)',
      borderRadius: 14,
      boxShadow: 'var(--shadow-sm)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: '100%',
      borderCollapse: 'collapse'
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: 'var(--ink-50)'
    }
  }, /*#__PURE__*/React.createElement("th", {
    style: {
      ...th,
      paddingTop: 12
    }
  }, "Claim"), /*#__PURE__*/React.createElement("th", {
    style: {
      ...th,
      paddingTop: 12
    }
  }, "Claimant"), /*#__PURE__*/React.createElement("th", {
    style: {
      ...th,
      paddingTop: 12,
      textAlign: 'right'
    }
  }, "Demand"), /*#__PURE__*/React.createElement("th", {
    style: {
      ...th,
      paddingTop: 12,
      textAlign: 'right'
    }
  }, "Defensible range"), /*#__PURE__*/React.createElement("th", {
    style: {
      ...th,
      paddingTop: 12
    }
  }, "Recommendation"), /*#__PURE__*/React.createElement("th", {
    style: {
      ...th,
      paddingTop: 12,
      textAlign: 'right'
    }
  }, "Reserve \u0394"), /*#__PURE__*/React.createElement("th", {
    style: {
      ...th,
      paddingTop: 12,
      textAlign: 'right'
    }
  }, "Updated"), /*#__PURE__*/React.createElement("th", {
    style: th
  }))), /*#__PURE__*/React.createElement("tbody", null, filtered.map(c => /*#__PURE__*/React.createElement(Row, {
    key: c.id,
    c: c,
    onOpen: onOpen
  })))), filtered.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '40px',
      textAlign: 'center',
      color: 'var(--ink-400)',
      fontFamily: 'var(--font-sans)',
      fontSize: 14
    }
  }, "No claims match \u201C", search, "\u201D.")));
}
Object.assign(window, {
  ClaimsList
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/ClaimsList.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/Detail.jsx
try { (() => {
// Detail.jsx — claim analysis view. Exports ClaimDetail to window.
// Composes: RecommendationCard, SettlementRange, DemandBreakdown, CitationPanel.

function Card({
  title,
  right,
  children,
  pad = 20,
  style
}) {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      background: '#fff',
      border: '1px solid var(--color-border)',
      borderRadius: 14,
      boxShadow: 'var(--shadow-sm)',
      ...style
    }
  }, title && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '14px 20px',
      borderBottom: '1px solid var(--color-border)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "e-label",
    style: {
      color: 'var(--ink-500)'
    }
  }, title), right), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: pad
    }
  }, children));
}
function SettlementRange({
  c
}) {
  // scale across demand
  const span = c.demand || 1;
  const pct = v => Math.max(0, Math.min(100, v / span * 100));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "e-body",
    style: {
      color: 'var(--ink-600)'
    }
  }, "Defensible range"), /*#__PURE__*/React.createElement(Money, {
    size: 18,
    weight: 600,
    style: {
      whiteSpace: 'nowrap'
    }
  }, fmtMoney(c.low), " \u2013 ", fmtMoney(c.high))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      height: 10,
      borderRadius: 999,
      background: 'var(--ink-100)',
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: pct(c.low) + '%',
      width: pct(c.high) - pct(c.low) + '%',
      top: 0,
      bottom: 0,
      borderRadius: 999,
      background: 'var(--brand-600)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: pct(c.rec) + '%',
      top: -4,
      transform: 'translateX(-50%)',
      width: 18,
      height: 18,
      borderRadius: 999,
      background: '#fff',
      border: '4px solid var(--brand-600)',
      boxShadow: 'var(--shadow-sm)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: pct(c.demand) + '%',
      top: -7,
      transform: 'translateX(-50%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 2,
      height: 24,
      background: 'var(--warn-500)'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginTop: 6,
      gap: 12,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Money, {
    size: 12,
    color: "var(--brand-700)",
    style: {
      whiteSpace: 'nowrap'
    }
  }, "Recommend ", fmtMoney(c.rec), " \xB7 within band"), /*#__PURE__*/React.createElement(Money, {
    size: 12,
    color: "var(--warn-600)",
    style: {
      whiteSpace: 'nowrap'
    }
  }, "Demand ", fmtMoney(c.demand), " \xB7 ", Math.round((1 - c.rec / c.demand) * 100), "% above")));
}
function LineItem({
  li,
  total
}) {
  const inflated = li.inflated || 0;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      padding: '13px 0',
      borderBottom: '1px solid var(--color-border)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, inflated ? /*#__PURE__*/React.createElement(Ic, {
    n: "triangle-alert",
    size: 16,
    color: "var(--warn-500)"
  }) : /*#__PURE__*/React.createElement(Ic, {
    n: "circle-check",
    size: 16,
    color: "var(--ok-500)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontFamily: 'var(--font-sans)',
      fontSize: 14,
      color: 'var(--ink-800)',
      fontWeight: 500
    }
  }, li.label), inflated > 0 && /*#__PURE__*/React.createElement(Badge, {
    tone: "warn"
  }, "\u2212", fmtK(inflated), " inflated"), /*#__PURE__*/React.createElement(Money, {
    size: 14,
    style: {
      minWidth: 78,
      textAlign: 'right'
    }
  }, fmtMoney(li.amount))), li.note && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 12.5,
      color: 'var(--ink-500)',
      paddingLeft: 26,
      lineHeight: 1.45
    }
  }, li.note));
}
function DemandBreakdown({
  c
}) {
  const total = c.lineItems.reduce((s, li) => s + li.amount, 0);
  const inflated = c.lineItems.reduce((s, li) => s + (li.inflated || 0), 0);
  return /*#__PURE__*/React.createElement("div", null, c.lineItems.map((li, i) => /*#__PURE__*/React.createElement(LineItem, {
    key: i,
    li: li,
    total: total
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 14
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 13.5,
      color: 'var(--ink-500)'
    }
  }, "Demanded total"), /*#__PURE__*/React.createElement(Money, {
    size: 15,
    color: "var(--ink-500)"
  }, fmtMoney(total))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 12,
      padding: '13px 14px',
      background: 'var(--brand-50)',
      borderRadius: 10
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontWeight: 600,
      fontSize: 14,
      color: 'var(--ink-900)'
    }
  }, "Defensible total"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 12.5,
      color: 'var(--ink-500)'
    }
  }, fmtK(inflated), " of demand flagged as inflated")), /*#__PURE__*/React.createElement(Money, {
    size: 18,
    weight: 600,
    color: "var(--brand-700)"
  }, fmtMoney(c.rec))));
}
function RecommendationCard({
  c
}) {
  const reco = RECO[c.recommendation];
  const delta = c.rec - c.reserveCurrent;
  return /*#__PURE__*/React.createElement(Card, {
    pad: 0,
    style: {
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '20px 22px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: reco.tone,
    dot: true
  }, reco.label), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 10,
      marginTop: 12,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "e-h2",
    style: {
      margin: 0
    }
  }, reco.verb), /*#__PURE__*/React.createElement(Money, {
    size: 30,
    weight: 700,
    color: "var(--ink-900)"
  }, fmtMoney(c.rec))), /*#__PURE__*/React.createElement("p", {
    className: "e-body",
    style: {
      margin: '8px 0 0',
      maxWidth: 440
    }
  }, c.summary)), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'right',
      flex: '0 0 auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "e-label",
    style: {
      color: 'var(--ink-400)',
      whiteSpace: 'nowrap'
    }
  }, "Confidence"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      marginTop: 6,
      fontFamily: 'var(--font-sans)',
      fontWeight: 600,
      fontSize: 15,
      color: c.confidence === 'High' ? 'var(--ok-600)' : 'var(--warn-600)'
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    n: c.confidence === 'High' ? 'shield-check' : 'shield-alert',
    size: 17
  }), c.confidence))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 24,
      rowGap: 10,
      padding: '14px 22px',
      background: 'var(--ink-50)',
      borderTop: '1px solid var(--color-border)',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 9
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    n: "trending-up",
    size: 17,
    color: "var(--ink-500)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 13.5,
      color: 'var(--ink-600)',
      fontWeight: 500
    }
  }, "Reserve impact")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Money, {
    size: 14,
    color: "var(--ink-500)"
  }, fmtMoney(c.reserveCurrent)), /*#__PURE__*/React.createElement(Ic, {
    n: "arrow-right",
    size: 14,
    color: "var(--ink-400)"
  }), /*#__PURE__*/React.createElement(Money, {
    size: 14,
    color: "var(--ink-900)"
  }, fmtMoney(c.rec))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginLeft: 'auto'
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: delta > 0 ? 'warn' : 'ok'
  }, delta >= 0 ? '+' : '−', fmtMoney(Math.abs(delta)), " ", delta >= 0 ? 'increase' : 'release'))));
}
function CitationPanel({
  c
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement(Card, {
    title: `Citations · ${c.citations.filter(x => x.inCorpus).length} in corpus`,
    pad: 0
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '6px 0'
    }
  }, c.citations.filter(x => x.inCorpus).map((cit, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      padding: '14px 20px',
      borderBottom: i < c.citations.filter(x => x.inCorpus).length - 1 ? '1px solid var(--color-border)' : 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 8,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement(Money, {
    size: 12,
    weight: 500,
    color: "var(--brand-700)",
    style: {
      background: 'var(--brand-100)',
      padding: '2px 7px',
      borderRadius: 5,
      whiteSpace: 'nowrap',
      flex: '0 0 auto'
    }
  }, cit.section, " ", cit.para), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontWeight: 600,
      fontSize: 13,
      color: 'var(--ink-800)',
      lineHeight: 1.35
    }
  }, cit.title)), /*#__PURE__*/React.createElement("div", {
    style: {
      borderLeft: '3px solid var(--brand-300)',
      paddingLeft: 12
    }
  }, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-sans)',
      fontSize: 13,
      lineHeight: 1.5,
      color: 'var(--ink-600)'
    }
  }, cit.text)))))), c.citations.some(x => !x.inCorpus) && /*#__PURE__*/React.createElement(Card, {
    title: "Outside the corpus",
    pad: 16
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, c.citations.filter(x => !x.inCorpus).map((cit, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      gap: 10,
      alignItems: 'flex-start',
      background: 'var(--ink-50)',
      border: '1px solid var(--color-border)',
      borderRadius: 9,
      padding: '11px 13px'
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    n: "help-circle",
    size: 16,
    color: "var(--ink-400)",
    style: {
      marginTop: 1
    }
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 13.5,
      fontWeight: 600,
      color: 'var(--ink-800)'
    }
  }, cit.topic), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 12.5,
      color: 'var(--ink-500)',
      marginTop: 2,
      lineHeight: 1.45
    }
  }, "Not in corpus \u2014 flagged rather than guessed. Review with counsel.")))))));
}
function ClaimDetail({
  c
}) {
  const reco = RECO[c.recommendation];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '24px 32px 48px',
      maxWidth: 1180,
      margin: '0 auto',
      width: '100%',
      boxSizing: 'border-box'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 20,
      marginBottom: 22,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("h1", {
    className: "e-h1",
    style: {
      margin: 0,
      fontSize: 28,
      lineHeight: 1.2
    }
  }, c.claimant), /*#__PURE__*/React.createElement(Money, {
    size: 13,
    weight: 500,
    color: "var(--brand-700)",
    style: {
      background: 'var(--brand-100)',
      padding: '3px 9px',
      borderRadius: 6
    }
  }, c.id)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 16,
      fontFamily: 'var(--font-sans)',
      fontSize: 13.5,
      color: 'var(--ink-500)',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: meta
  }, /*#__PURE__*/React.createElement(Ic, {
    n: "file-text",
    size: 14
  }), " ", c.type), /*#__PURE__*/React.createElement("span", {
    style: meta
  }, /*#__PURE__*/React.createElement(Ic, {
    n: "shield",
    size: 14
  }), " Policy ", c.policy), /*#__PURE__*/React.createElement("span", {
    style: meta
  }, /*#__PURE__*/React.createElement(Ic, {
    n: "scale",
    size: 14
  }), " ", c.jurisdiction))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    icon: "download"
  }, "Export to reserve"), /*#__PURE__*/React.createElement(Button, {
    icon: "check"
  }, reco.verb, " at ", fmtK(c.rec)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'minmax(0,1.55fr) minmax(0,1fr)',
      gap: 20,
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 20
    }
  }, /*#__PURE__*/React.createElement(RecommendationCard, {
    c: c
  }), /*#__PURE__*/React.createElement(Card, {
    title: "Settlement range"
  }, /*#__PURE__*/React.createElement(SettlementRange, {
    c: c
  })), /*#__PURE__*/React.createElement(Card, {
    title: "Demand breakdown",
    right: /*#__PURE__*/React.createElement(Badge, {
      tone: "warn"
    }, fmtK(c.lineItems.reduce((s, li) => s + (li.inflated || 0), 0)), " flagged")
  }, /*#__PURE__*/React.createElement(DemandBreakdown, {
    c: c
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'sticky',
      top: 80
    }
  }, /*#__PURE__*/React.createElement(CitationPanel, {
    c: c
  }))));
}
const meta = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5
};
Object.assign(window, {
  ClaimDetail,
  Card
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/Detail.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/Intake.jsx
try { (() => {
// Intake.jsx — "New analysis" modal: upload demand/policy/facts → generate.
// Exports IntakeModal to window.

function DropTile({
  icon,
  title,
  hint,
  attached,
  onClick
}) {
  const [h, setH] = React.useState(false);
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
      padding: '20px 14px',
      borderRadius: 12,
      cursor: 'pointer',
      border: attached ? '1.5px solid var(--brand-400)' : '1.5px dashed var(--color-border-strong)',
      background: attached ? 'var(--brand-50)' : h ? 'var(--ink-50)' : '#fff',
      transition: '.12s'
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    n: attached ? 'check-circle-2' : icon,
    size: 24,
    color: attached ? 'var(--brand-600)' : 'var(--ink-400)'
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontWeight: 600,
      fontSize: 13.5,
      color: 'var(--ink-800)'
    }
  }, title), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 12,
      color: attached ? 'var(--brand-700)' : 'var(--ink-400)'
    }
  }, attached ? 'Attached' : hint));
}
function IntakeModal({
  onClose,
  onComplete
}) {
  const [files, setFiles] = React.useState({
    demand: false,
    policy: false,
    facts: false
  });
  const [juris, setJuris] = React.useState('CA · 9th Cir.');
  const [phase, setPhase] = React.useState('form'); // form | running
  const [step, setStep] = React.useState(0);
  const ready = files.demand && files.policy;
  const STEPS = ['Reading demand letter…', 'Parsing policy terms…', 'Matching authored corpus…', 'Computing defensible range…'];
  const run = () => {
    setPhase('running');
    let i = 0;
    const iv = setInterval(() => {
      i += 1;
      setStep(i);
      if (i >= STEPS.length) {
        clearInterval(iv);
        setTimeout(() => onComplete(NEW_CLAIM(juris)), 450);
      }
    }, 620);
  };
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(14,27,46,0.42)',
      backdropFilter: 'blur(3px)',
      WebkitBackdropFilter: 'blur(3px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 50,
      padding: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      width: 560,
      maxWidth: '100%',
      background: '#fff',
      borderRadius: 18,
      boxShadow: 'var(--shadow-lg)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '18px 22px',
      borderBottom: '1px solid var(--color-border)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/entente-mark.svg",
    width: "22",
    height: "22",
    alt: ""
  }), /*#__PURE__*/React.createElement("h3", {
    className: "e-h4",
    style: {
      margin: 0,
      whiteSpace: 'nowrap'
    }
  }, "New analysis")), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      color: 'var(--ink-400)',
      display: 'inline-flex'
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    n: "x",
    size: 20
  }))), phase === 'form' ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 22
    }
  }, /*#__PURE__*/React.createElement("p", {
    className: "e-small",
    style: {
      margin: '0 0 16px'
    }
  }, "Upload the demand, the policy and any claim facts. Entente returns a defensible range with every legal point cited to corpus."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement(DropTile, {
    icon: "file-text",
    title: "Demand letter",
    hint: "PDF \xB7 required",
    attached: files.demand,
    onClick: () => setFiles(f => ({
      ...f,
      demand: true
    }))
  }), /*#__PURE__*/React.createElement(DropTile, {
    icon: "shield",
    title: "Policy",
    hint: "PDF \xB7 required",
    attached: files.policy,
    onClick: () => setFiles(f => ({
      ...f,
      policy: true
    }))
  }), /*#__PURE__*/React.createElement(DropTile, {
    icon: "paperclip",
    title: "Claim facts",
    hint: "optional",
    attached: files.facts,
    onClick: () => setFiles(f => ({
      ...f,
      facts: true
    }))
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontWeight: 600,
      fontSize: 13,
      color: 'var(--ink-700)'
    }
  }, "Jurisdiction"), /*#__PURE__*/React.createElement("input", {
    value: juris,
    onChange: e => setJuris(e.target.value),
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 14,
      padding: '9px 12px',
      border: '1px solid var(--color-border-strong)',
      borderRadius: 8,
      color: 'var(--ink-900)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    onClick: onClose
  }, "Cancel"), /*#__PURE__*/React.createElement(Button, {
    icon: "sparkles",
    disabled: !ready,
    onClick: run
  }, "Generate analysis"))) : /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '34px 24px 40px',
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, STEPS.map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      opacity: i < step ? 1 : i === step ? 1 : 0.4,
      transition: 'opacity .3s'
    }
  }, i < step ? /*#__PURE__*/React.createElement(Ic, {
    n: "check-circle-2",
    size: 19,
    color: "var(--ok-500)"
  }) : i === step ? /*#__PURE__*/React.createElement("span", {
    style: {
      width: 17,
      height: 17,
      borderRadius: 999,
      border: '2px solid var(--brand-300)',
      borderTopColor: 'var(--brand-600)',
      animation: 'spin .7s linear infinite',
      display: 'inline-block'
    }
  }) : /*#__PURE__*/React.createElement("span", {
    style: {
      width: 17,
      height: 17,
      borderRadius: 999,
      border: '2px solid var(--ink-200)',
      display: 'inline-block'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 14,
      color: i <= step ? 'var(--ink-800)' : 'var(--ink-400)',
      fontWeight: i === step ? 600 : 400
    }
  }, s))))));
}
const NEW_CLAIM = juris => ({
  id: 'GL-4480',
  claimant: 'S. Petrov',
  type: 'General Liability',
  policy: 'CGL-8820',
  jurisdiction: juris,
  demand: 268000,
  low: 140000,
  high: 185000,
  rec: 165000,
  recommendation: 'counter',
  status: 'analyzed',
  confidence: 'High',
  reserveCurrent: 150000,
  updated: 'just now',
  summary: 'Slip-and-fall at insured premises. Liability probable; demand inflated on future care and general damages.',
  lineItems: [{
    label: 'Past medicals',
    amount: 54000,
    supported: true,
    note: 'Supported by treatment record.'
  }, {
    label: 'Future care',
    amount: 96000,
    inflated: 52000,
    note: '$52k beyond the certified life-care plan.'
  }, {
    label: 'Lost wages',
    amount: 28000,
    supported: true
  }, {
    label: 'Pain & suffering',
    amount: 90000,
    inflated: 31000,
    note: 'Above comparable-verdict band for jurisdiction.'
  }],
  citations: [{
    section: '§7.1',
    title: 'Future Medical Specials',
    para: '¶2',
    inCorpus: true,
    text: 'Future medical specials require support by a treatment record or certified life-care plan to be recoverable.'
  }, {
    section: '§9.4',
    title: 'General Damages Benchmarks',
    para: '¶1',
    inCorpus: true,
    text: 'Pain-and-suffering awards are evaluated against the jurisdiction\u2019s comparable-verdict band.'
  }, {
    topic: 'Premises-liability comparative fault (slip-and-fall)',
    inCorpus: false
  }]
});
Object.assign(window, {
  IntakeModal
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/Intake.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/Sidebar.jsx
try { (() => {
// Sidebar.jsx — fixed left navigation. Exports Sidebar to window.

function Sidebar({
  active = 'claims',
  onNav
}) {
  const NavItem = ({
    id,
    icon,
    label,
    badge
  }) => {
    const [h, setH] = React.useState(false);
    const on = active === id;
    return /*#__PURE__*/React.createElement("button", {
      onClick: () => onNav && onNav(id),
      onMouseEnter: () => setH(true),
      onMouseLeave: () => setH(false),
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        width: '100%',
        textAlign: 'left',
        padding: '9px 12px',
        borderRadius: 8,
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'var(--font-sans)',
        fontWeight: on ? 600 : 500,
        fontSize: 14,
        color: on ? 'var(--brand-700)' : 'var(--ink-600)',
        background: on ? 'var(--brand-100)' : h ? 'var(--ink-100)' : 'transparent',
        transition: 'background .12s'
      }
    }, /*#__PURE__*/React.createElement(Ic, {
      n: icon,
      size: 18,
      color: on ? 'var(--brand-600)' : 'var(--ink-500)'
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1
      }
    }, label), badge != null && /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--ink-400)'
      }
    }, badge));
  };
  const Section = ({
    children
  }) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 2
    }
  }, children);
  return /*#__PURE__*/React.createElement("aside", {
    style: {
      width: 240,
      flex: '0 0 240px',
      height: '100%',
      background: '#fff',
      borderRight: '1px solid var(--color-border)',
      display: 'flex',
      flexDirection: 'column',
      padding: '18px 14px',
      boxSizing: 'border-box',
      gap: 22
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '2px 6px 0'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/entente-mark.svg",
    width: "28",
    height: "28",
    alt: ""
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontWeight: 800,
      fontSize: 19,
      letterSpacing: '-0.02em',
      color: 'var(--ink-900)'
    }
  }, "Entente")), /*#__PURE__*/React.createElement(Section, null, /*#__PURE__*/React.createElement(NavItem, {
    id: "claims",
    icon: "folder-open",
    label: "Claims",
    badge: "12"
  }), /*#__PURE__*/React.createElement(NavItem, {
    id: "queue",
    icon: "inbox",
    label: "Intake queue",
    badge: "3"
  }), /*#__PURE__*/React.createElement(NavItem, {
    id: "reserves",
    icon: "trending-up",
    label: "Reserves"
  }), /*#__PURE__*/React.createElement(NavItem, {
    id: "corpus",
    icon: "book-marked",
    label: "Corpus"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 1,
      background: 'var(--color-border)'
    }
  }), /*#__PURE__*/React.createElement(Section, null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color: 'var(--ink-400)',
      padding: '2px 12px 6px'
    }
  }, "Saved views"), /*#__PURE__*/React.createElement(NavItem, {
    id: "open",
    icon: "circle-dot",
    label: "Open \xB7 high value"
  }), /*#__PURE__*/React.createElement(NavItem, {
    id: "flagged",
    icon: "flag",
    label: "Flagged demands"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 'auto',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 8px',
      borderTop: '1px solid var(--color-border)'
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    initials: "JR"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      lineHeight: 1.25,
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontWeight: 600,
      fontSize: 13,
      color: 'var(--ink-800)'
    }
  }, "J. Reyes"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 12,
      color: 'var(--ink-400)'
    }
  }, "Sr. Claims Adjuster")), /*#__PURE__*/React.createElement(Ic, {
    n: "settings",
    size: 16,
    color: "var(--ink-400)"
  })));
}
Object.assign(window, {
  Sidebar
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/Sidebar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/Topbar.jsx
try { (() => {
// Topbar.jsx — sticky top bar: breadcrumb/title + search + new analysis.
// Exports Topbar to window.

function Topbar({
  title,
  crumb,
  onBack,
  onNew,
  search,
  setSearch
}) {
  return /*#__PURE__*/React.createElement("header", {
    style: {
      height: 60,
      flex: '0 0 60px',
      background: 'rgba(255,255,255,0.85)',
      backdropFilter: 'saturate(180%) blur(8px)',
      WebkitBackdropFilter: 'saturate(180%) blur(8px)',
      borderBottom: '1px solid var(--color-border)',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      padding: '0 24px',
      boxSizing: 'border-box',
      position: 'sticky',
      top: 0,
      zIndex: 5
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      flex: '0 0 auto'
    }
  }, onBack && /*#__PURE__*/React.createElement("button", {
    onClick: onBack,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      color: 'var(--ink-500)',
      fontFamily: 'var(--font-sans)',
      fontSize: 13,
      fontWeight: 500,
      padding: '4px 6px',
      borderRadius: 6
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    n: "chevron-left",
    size: 16
  }), " ", crumb || 'Claims'), onBack && /*#__PURE__*/React.createElement(Ic, {
    n: "chevron-right",
    size: 14,
    color: "var(--ink-300)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontWeight: 700,
      fontSize: 16,
      color: 'var(--ink-900)',
      letterSpacing: '-0.01em',
      whiteSpace: 'nowrap'
    }
  }, title)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), setSearch && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      background: 'var(--ink-50)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      padding: '7px 11px',
      flex: '0 1 260px',
      minWidth: 130
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    n: "search",
    size: 16,
    color: "var(--ink-400)"
  }), /*#__PURE__*/React.createElement("input", {
    value: search,
    onChange: e => setSearch(e.target.value),
    placeholder: 'Search claims, policies\u2026',
    style: {
      border: 'none',
      outline: 'none',
      background: 'transparent',
      fontFamily: 'var(--font-sans)',
      fontSize: 13.5,
      color: 'var(--ink-800)',
      width: '100%'
    }
  })), /*#__PURE__*/React.createElement("button", {
    title: "Notifications",
    style: {
      width: 36,
      height: 36,
      borderRadius: 8,
      border: '1px solid var(--color-border)',
      background: '#fff',
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--ink-500)'
    }
  }, /*#__PURE__*/React.createElement(Ic, {
    n: "bell",
    size: 17
  })), onNew && /*#__PURE__*/React.createElement(Button, {
    icon: "plus",
    onClick: onNew
  }, "New analysis"));
}
Object.assign(window, {
  Topbar
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/Topbar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/icons.jsx
try { (() => {
// icons.jsx — Entente bespoke icon set (inline SVG, no CDN dependency).
// Geometric line style on a 24px grid, 1.8 stroke, round caps/joins.
// Each value is the INNER svg markup; Ic (in ui.jsx) wraps it. Filled dots use
// fill="currentColor" stroke="none". Exports window.ENTENTE_ICONS.

const ENTENTE_ICONS = {
  'chevron-left': '<path d="M15 6l-6 6 6 6"/>',
  'chevron-right': '<path d="M9 6l6 6-6 6"/>',
  'arrow-right': '<path d="M4 12h15"/><path d="M13 6l6 6-6 6"/>',
  'arrow-up-down': '<path d="M7 4v15"/><path d="M4 8l3-4 3 4"/><path d="M17 20V5"/><path d="M14 16l3 4 3-4"/>',
  'search': '<circle cx="11" cy="11" r="6.5"/><path d="M20.5 20.5l-4.6-4.6"/>',
  'bell': '<path d="M6 10a6 6 0 0 1 12 0c0 4.5 1.5 5.5 2 6.5H4c.5-1 2-2 2-6.5Z"/><path d="M9.5 20a2.5 2.5 0 0 0 5 0"/>',
  'plus': '<path d="M12 5v14"/><path d="M5 12h14"/>',
  'sliders-horizontal': '<path d="M3 7h13"/><path d="M3 17h13"/><path d="M3 12h6"/><circle cx="18.5" cy="7" r="2.3" fill="currentColor" stroke="none"/><circle cx="18.5" cy="17" r="2.3" fill="currentColor" stroke="none"/><circle cx="11.5" cy="12" r="2.3" fill="currentColor" stroke="none"/>',
  'folder-open': '<path d="M4 7a2 2 0 0 1 2-2h3.2a2 2 0 0 1 1.4.6L12 7h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/>',
  'inbox': '<path d="M4 13l2.3-7a2 2 0 0 1 1.9-1.4h7.6a2 2 0 0 1 1.9 1.4L20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><path d="M4 13h4.5a3.5 3.5 0 0 0 7 0H20"/>',
  'trending-up': '<path d="M4 16l5-5 3 3 7-7"/><path d="M16 7h4v4"/>',
  'book-marked': '<path d="M5 5a2 2 0 0 1 2-2h11v15H7a2 2 0 0 0-2 2Z"/><path d="M18 18H7"/><path d="M9 3v7l2.5-1.8L14 10V3"/>',
  'circle-dot': '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.3" fill="currentColor" stroke="none"/>',
  'flag': '<path d="M6 21V4"/><path d="M6 4.5h11.5l-2.2 4 2.2 4H6"/>',
  'settings': '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2.1 2.1M16.9 16.9 19 19M19 5l-2.1 2.1M7.1 16.9 5 19"/>',
  'x': '<path d="M6 6l12 12"/><path d="M18 6 6 18"/>',
  'file-text': '<path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v4h4"/><path d="M9 13h6M9 16.5h6"/>',
  'shield': '<path d="M12 3l7 2.7v5.8c0 4.2-3 7-7 8.5-4-1.5-7-4.3-7-8.5V5.7Z"/>',
  'shield-check': '<path d="M12 3l7 2.7v5.8c0 4.2-3 7-7 8.5-4-1.5-7-4.3-7-8.5V5.7Z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
  'shield-alert': '<path d="M12 3l7 2.7v5.8c0 4.2-3 7-7 8.5-4-1.5-7-4.3-7-8.5V5.7Z"/><path d="M12 8v4.2"/><circle cx="12" cy="15.4" r="0.95" fill="currentColor" stroke="none"/>',
  'paperclip': '<path d="M16.5 8.5l-6.3 6.3a2.3 2.3 0 0 0 3.2 3.2l6.3-6.3a4.3 4.3 0 0 0-6-6L7.3 12a6.3 6.3 0 0 0 8.9 8.9l4.8-4.8"/>',
  'sparkles': '<path d="M12 4l1.4 4.2L18 9.6l-4.6 1.4L12 15l-1.4-4L6 9.6l4.6-1.4Z"/><path d="M18.5 14.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7Z"/>',
  'triangle-alert': '<path d="M12 4.5l8.5 15H3.5Z"/><path d="M12 10v4"/><circle cx="12" cy="16.6" r="0.95" fill="currentColor" stroke="none"/>',
  'circle-check': '<circle cx="12" cy="12" r="8"/><path d="M8.5 12l2.4 2.4 4.6-4.8"/>',
  'check-circle-2': '<circle cx="12" cy="12" r="8"/><path d="M8.5 12l2.4 2.4 4.6-4.8"/>',
  'help-circle': '<circle cx="12" cy="12" r="8"/><path d="M9.6 9.6a2.4 2.4 0 0 1 3.9-.8c.9.9.5 1.9-.5 2.6-.7.5-1 .9-1 1.8"/><circle cx="12" cy="16.4" r="0.95" fill="currentColor" stroke="none"/>',
  'scale': '<path d="M12 4v16"/><path d="M7.5 20h9"/><path d="M5 7.5h14"/><path d="M8.5 6.5 12 5l3.5 1.5"/><path d="M5 7.5l-2.2 4.6a2.4 2.4 0 0 0 4.8 0Z"/><path d="M19 7.5l-2.2 4.6a2.4 2.4 0 0 0 4.8 0Z"/>',
  'download': '<path d="M12 4v10.5"/><path d="M8 11l4 4 4-4"/><path d="M5 19.5h14"/>',
  'check': '<path d="M5 12.5l4.5 4.5L19 7"/>',
  'gavel': '<path d="M14.5 3.5l6 6-2.5 2.5-6-6Z"/><path d="M11.5 6.5 4 14l3 3 7.5-7.5"/><path d="M3.5 20.5h8"/>',
  'quote': '<path d="M9 7H6a2 2 0 0 0-2 2v2.5a2 2 0 0 0 2 2h1.5v-2.5"/><path d="M18 7h-3a2 2 0 0 0-2 2v2.5a2 2 0 0 0 2 2h1.5v-2.5"/>'
};
window.ENTENTE_ICONS = ENTENTE_ICONS;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/icons.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/ui.jsx
try { (() => {
// ui.jsx — Entente app UI kit: shared primitives, icon helper, sample data.
// Exports to window: Ic, Button, Badge, Money, Avatar, CLAIMS, fmtMoney, fmtK

const fmtMoney = n => '$' + n.toLocaleString('en-US');
const fmtK = n => '$' + Math.round(n / 1000) + 'k';

// Entente icon: inline SVG from the bespoke set (icons.jsx → window.ENTENTE_ICONS).
// No CDN/font dependency, so it always renders. Color via currentColor.
function Ic({
  n,
  size = 18,
  color,
  style
}) {
  const inner = window.ENTENTE_ICONS && window.ENTENTE_ICONS[n] || window.ENTENTE_ICONS && window.ENTENTE_ICONS['help-circle'] || '';
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
    style: {
      display: 'block',
      flex: '0 0 auto',
      color: color || 'currentColor',
      ...style
    },
    dangerouslySetInnerHTML: {
      __html: inner
    }
  });
}
function Button({
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  children,
  onClick,
  disabled,
  style
}) {
  const base = {
    fontFamily: 'var(--font-sans)',
    fontWeight: 600,
    borderRadius: 8,
    border: '1px solid transparent',
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    lineHeight: 1,
    transition: 'background .15s, border-color .15s, color .15s',
    whiteSpace: 'nowrap',
    opacity: disabled ? 0.45 : 1,
    ...(size === 'sm' ? {
      padding: '7px 12px',
      fontSize: 13
    } : {
      padding: '9px 16px',
      fontSize: 14
    })
  };
  const variants = {
    primary: {
      background: 'var(--brand-600)',
      color: '#fff'
    },
    secondary: {
      background: '#fff',
      color: 'var(--ink-900)',
      borderColor: 'var(--color-border-strong)'
    },
    ghost: {
      background: 'transparent',
      color: 'var(--brand-600)'
    },
    danger: {
      background: 'var(--risk-500)',
      color: '#fff'
    },
    subtle: {
      background: 'var(--ink-100)',
      color: 'var(--ink-700)'
    }
  };
  const hovers = {
    primary: 'var(--brand-700)',
    secondary: 'var(--ink-50)',
    ghost: 'var(--brand-50)',
    danger: 'var(--risk-600)',
    subtle: 'var(--ink-150)'
  };
  const [h, setH] = React.useState(false);
  const v = variants[variant];
  const hoverStyle = h && !disabled ? variant === 'primary' || variant === 'danger' ? {
    background: hovers[variant]
  } : {
    background: hovers[variant]
  } : {};
  return /*#__PURE__*/React.createElement("button", {
    onClick: disabled ? undefined : onClick,
    disabled: disabled,
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    style: {
      ...base,
      ...v,
      ...hoverStyle,
      ...style
    }
  }, icon && /*#__PURE__*/React.createElement(Ic, {
    n: icon,
    size: size === 'sm' ? 15 : 17
  }), children, iconRight && /*#__PURE__*/React.createElement(Ic, {
    n: iconRight,
    size: size === 'sm' ? 15 : 17
  }));
}
const BADGE_TONES = {
  ok: {
    bg: 'var(--ok-soft)',
    fg: 'var(--ok-600)',
    dot: 'var(--ok-600)'
  },
  warn: {
    bg: 'var(--warn-soft)',
    fg: 'var(--warn-600)',
    dot: 'var(--warn-600)'
  },
  risk: {
    bg: 'var(--risk-soft)',
    fg: 'var(--risk-600)',
    dot: 'var(--risk-600)'
  },
  brand: {
    bg: 'var(--brand-100)',
    fg: 'var(--brand-700)',
    dot: 'var(--brand-600)'
  },
  neutral: {
    bg: 'var(--ink-100)',
    fg: 'var(--ink-600)',
    dot: 'var(--ink-400)'
  }
};
function Badge({
  tone = 'neutral',
  dot,
  mono,
  children,
  style
}) {
  const t = BADGE_TONES[tone];
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      background: t.bg,
      color: t.fg,
      fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
      fontWeight: mono ? 500 : 600,
      fontSize: 12,
      padding: '4px 11px',
      borderRadius: 999,
      lineHeight: 1.3,
      whiteSpace: 'nowrap',
      ...style
    }
  }, dot && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 7,
      height: 7,
      borderRadius: 2,
      background: t.dot
    }
  }), children);
}
function Money({
  children,
  size = 15,
  weight = 600,
  color = 'var(--ink-900)',
  style
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontVariantNumeric: 'tabular-nums',
      fontSize: size,
      fontWeight: weight,
      color,
      letterSpacing: '0.01em',
      ...style
    }
  }, children);
}
function Avatar({
  initials,
  size = 30,
  tone = 'brand'
}) {
  const bg = tone === 'brand' ? 'var(--brand-100)' : 'var(--ink-150)';
  const fg = tone === 'brand' ? 'var(--brand-700)' : 'var(--ink-700)';
  return /*#__PURE__*/React.createElement("span", {
    style: {
      width: size,
      height: size,
      borderRadius: 999,
      background: bg,
      color: fg,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-sans)',
      fontWeight: 700,
      fontSize: size * 0.38,
      flex: '0 0 auto'
    }
  }, initials);
}

// ---- Sample claims --------------------------------------------------------
const CLAIMS = [{
  id: 'GL-4471',
  claimant: 'M. Alvarez',
  type: 'General Liability',
  policy: 'CGL-8820',
  jurisdiction: 'CA · 9th Cir.',
  demand: 310000,
  low: 180000,
  high: 240000,
  rec: 210000,
  recommendation: 'counter',
  status: 'analyzed',
  confidence: 'High',
  reserveCurrent: 180000,
  updated: '2h ago',
  summary: 'Rear-end MVA, disputed future medicals and inflated general damages. Comparative-fault reduction supported.',
  lineItems: [{
    label: 'Past medicals',
    amount: 62000,
    supported: true,
    note: 'Supported by treatment record.'
  }, {
    label: 'Future medicals',
    amount: 78000,
    inflated: 45000,
    note: '$45k unsupported by the treatment record or life-care plan.'
  }, {
    label: 'Lost wages',
    amount: 40000,
    supported: true,
    note: 'Documented; consistent with payroll.'
  }, {
    label: 'Pain & suffering',
    amount: 130000,
    inflated: 35000,
    note: 'Exceeds comparable verdicts for jurisdiction by ~37%.'
  }],
  citations: [{
    section: '§4.2',
    title: 'Comparative Negligence',
    para: '¶3',
    inCorpus: true,
    text: 'Recovery is diminished in proportion to the claimant\u2019s share of fault; a 25% allocation reduces the gross figure accordingly.'
  }, {
    section: '§7.1',
    title: 'Future Medical Specials',
    para: '¶2',
    inCorpus: true,
    text: 'Future medical specials require support by a treatment record or certified life-care plan to be recoverable.'
  }, {
    section: '§9.4',
    title: 'General Damages Benchmarks',
    para: '¶1',
    inCorpus: true,
    text: 'Pain-and-suffering awards are evaluated against the jurisdiction\u2019s comparable-verdict band.'
  }, {
    topic: 'Punitive-damages exposure',
    inCorpus: false
  }]
}, {
  id: 'GL-4468',
  claimant: 'Brightway Logistics',
  type: 'Commercial',
  policy: 'CGL-7711',
  jurisdiction: 'TX · 5th Cir.',
  demand: 525000,
  low: 300000,
  high: 380000,
  rec: 340000,
  recommendation: 'counter',
  status: 'analyzed',
  confidence: 'Medium',
  reserveCurrent: 400000,
  updated: '5h ago',
  summary: 'Premises liability, slip-and-fall. Liability contested; damages partially supported.',
  lineItems: [{
    label: 'Medical specials',
    amount: 145000,
    supported: true
  }, {
    label: 'Lost earning capacity',
    amount: 220000,
    inflated: 70000,
    note: 'Vocational basis thin; partially speculative.'
  }, {
    label: 'Pain & suffering',
    amount: 160000,
    supported: true
  }],
  citations: [{
    section: '§3.1',
    title: 'Premises Liability — Notice',
    para: '¶4',
    inCorpus: true,
    text: 'A possessor is liable only where the hazard was known or should have been discovered through reasonable inspection.'
  }, {
    topic: 'Lost earning capacity (vocational expert standard)',
    inCorpus: false
  }]
}, {
  id: 'GL-4455',
  claimant: 'D. Okonkwo',
  type: 'General Liability',
  policy: 'CGL-8820',
  jurisdiction: 'NY · 2nd Cir.',
  demand: 95000,
  low: 70000,
  high: 90000,
  rec: 80000,
  recommendation: 'settle',
  status: 'analyzed',
  confidence: 'High',
  reserveCurrent: 75000,
  updated: '1d ago',
  summary: 'Minor injury claim; demand within defensible band. Settle to avoid cost of defense.',
  lineItems: [{
    label: 'Medical specials',
    amount: 38000,
    supported: true
  }, {
    label: 'Lost wages',
    amount: 12000,
    supported: true
  }, {
    label: 'Pain & suffering',
    amount: 45000,
    supported: true
  }],
  citations: [{
    section: '§11.2',
    title: 'Cost-of-Defense Settlement',
    para: '¶1',
    inCorpus: true,
    text: 'Where projected defense cost approaches the gap to demand, early settlement within the defensible band is favored.'
  }]
}, {
  id: 'GL-4449',
  claimant: 'Vertex Property Mgmt',
  type: 'Commercial',
  policy: 'CGL-7711',
  jurisdiction: 'FL · 11th Cir.',
  demand: 880000,
  low: 250000,
  high: 360000,
  rec: 300000,
  recommendation: 'litigate',
  status: 'analyzed',
  confidence: 'High',
  reserveCurrent: 350000,
  updated: '2d ago',
  summary: 'Demand vastly exceeds defensible exposure; liability strongly contested. Litigation favored.',
  lineItems: [{
    label: 'Medical specials',
    amount: 180000,
    inflated: 60000,
    note: 'Treatment unrelated to incident per IME.'
  }, {
    label: 'Future care',
    amount: 400000,
    inflated: 280000,
    note: 'Life-care plan assumptions unsupported.'
  }, {
    label: 'Pain & suffering',
    amount: 300000,
    inflated: 180000,
    note: 'Far exceeds comparable-verdict band.'
  }],
  citations: [{
    section: '§2.3',
    title: 'Causation — IME Findings',
    para: '¶2',
    inCorpus: true,
    text: 'Where an independent medical exam attributes treatment to a pre-existing condition, related specials are not recoverable.'
  }, {
    section: '§9.4',
    title: 'General Damages Benchmarks',
    para: '¶1',
    inCorpus: true,
    text: 'Awards beyond the comparable-verdict band are unlikely to survive remittitur.'
  }]
}, {
  id: 'GL-4480',
  claimant: 'S. Petrov',
  type: 'General Liability',
  policy: 'CGL-8820',
  jurisdiction: 'IL · 7th Cir.',
  demand: 0,
  low: 0,
  high: 0,
  rec: 0,
  recommendation: 'pending',
  status: 'queued',
  confidence: '—',
  reserveCurrent: 0,
  updated: 'just now',
  summary: 'Awaiting analysis.',
  lineItems: [],
  citations: []
}];
const RECO = {
  counter: {
    label: 'Recommend counter',
    tone: 'brand',
    verb: 'Counter'
  },
  settle: {
    label: 'Recommend settle',
    tone: 'ok',
    verb: 'Settle'
  },
  litigate: {
    label: 'Recommend litigate',
    tone: 'risk',
    verb: 'Litigate'
  },
  pending: {
    label: 'Queued',
    tone: 'neutral',
    verb: '—'
  }
};
Object.assign(window, {
  Ic,
  Button,
  Badge,
  Money,
  Avatar,
  CLAIMS,
  RECO,
  fmtMoney,
  fmtK
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/ui.jsx", error: String((e && e.message) || e) }); }

})();
