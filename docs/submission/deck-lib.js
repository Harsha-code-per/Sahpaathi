// shared deck helpers for submissions 2 & 3 (same visual system as SlateLens)
const pptxgen = require("pptxgenjs");
const React = require("react");
const RDS = require("react-dom/server");
const sharp = require("sharp");
const fa = require("react-icons/fa");

const C = { SLATE: "22313A", SLATE2: "34495A", INK: "1B2A33", MUTED: "5B6B75", MARI: "F4B942", TEAL: "1F9E89", CORAL: "E4572E", LIGHT: "EEF3F5", WHITE: "FFFFFF", SOFT: "DCE6EA" };
const F = "Calibri";

async function make(footerText, title) {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE";
  pres.title = title;
  const cache = {};
  const ic = async (n, c) => {
    const k = n + c;
    if (!cache[k]) {
      const svg = RDS.renderToStaticMarkup(React.createElement(fa[n], { color: "#" + c, size: 256 }));
      cache[k] = "image/png;base64," + (await sharp(Buffer.from(svg)).png().toBuffer()).toString("base64");
    }
    return cache[k];
  };
  const T = (s, text, o) => s.addText(text, Object.assign({ fontFace: F, color: C.INK, isTextBox: true, margin: 0, valign: "top" }, o));
  const shadow = () => ({ type: "outer", color: "000000", blur: 6, offset: 2, angle: 90, opacity: 0.12 });
  const card = (s, x, y, w, h, fill, sh = false) =>
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, fill: { color: fill }, line: { color: fill }, rectRadius: 0.12, shadow: sh ? shadow() : undefined });
  const circ = async (s, x, y, d, fill, n, c = C.WHITE) => {
    s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill }, line: { color: fill } });
    const p = d * 0.26;
    s.addImage({ data: await ic(n, c), x: x + p, y: y + p, w: d - 2 * p, h: d - 2 * p });
  };
  let page = 0;
  const header = (s, tag, title) => {
    page++;
    s.background = { color: C.WHITE };
    T(s, tag.toUpperCase(), { x: 0.6, y: 0.38, w: 11, h: 0.3, fontSize: 12, bold: true, color: C.TEAL, charSpacing: 3 });
    T(s, title, { x: 0.6, y: 0.68, w: 12.1, h: 0.75, fontSize: 28, bold: true, color: C.INK, valign: "middle" });
    T(s, footerText, { x: 0.6, y: 7.05, w: 9, h: 0.25, fontSize: 9, color: C.MUTED });
    T(s, String(page), { x: 12.23, y: 7.05, w: 0.5, h: 0.25, fontSize: 9, color: C.MUTED, align: "right" });
  };
  const bullets = (items) => items.map((t, k) => ({ text: t, options: { bullet: true, breakLine: k < items.length - 1 } }));
  const team = async (s, tagline) => {
    s.background = { color: C.SLATE };
    T(s, "TEAM", { x: 0.7, y: 0.8, w: 5, h: 0.3, fontSize: 12, bold: true, color: C.MARI, charSpacing: 3 });
    T(s, "A1pha", { x: 0.7, y: 1.15, w: 8, h: 1.0, fontSize: 48, bold: true, color: C.WHITE });
    const m = [["Harshavardhan K", "Team Lead"], ["Sanjjith B", "Member"], ["Loktrishal K", "Member"], ["Cholan Kinnera", "Member"]];
    for (let i = 0; i < 4; i++) {
      const x = 0.7 + i * 3.05;
      card(s, x, 2.8, 2.8, 2.6, C.SLATE2, true);
      await circ(s, x + 0.9, 3.05, 1.0, C.MARI, "FaUserTie");
      T(s, m[i][0], { x: x + 0.1, y: 4.2, w: 2.6, h: 0.45, fontSize: 17, bold: true, color: C.WHITE, align: "center" });
      T(s, m[i][1], { x: x + 0.1, y: 4.65, w: 2.6, h: 0.35, fontSize: 12, color: C.MARI, align: "center" });
    }
    T(s, tagline, { x: 0.7, y: 6.0, w: 12, h: 0.5, fontSize: 18, italic: true, color: C.SOFT });
  };
  return { pres, C, T, card, circ, header, bullets, team, ic, shadow };
}
module.exports = { make, C };
