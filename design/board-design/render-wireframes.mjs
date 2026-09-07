// Original, dependency-free SVG drawings for the documentation package.
// This is an illustration generator, not a renderer used by the game.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = dirname(fileURLToPath(import.meta.url));
export const SIZES = [[1440, 1000], [2048, 900], [390, 844]];
export const SCENES = [
  {
    id: "s01-planning", title: "01 / Choose your actions", phase: "KINETIC", round: "3",
    selected: "LN1 / Line", question: "How will you spend two actions?",
    metric: "48% → 48%", delta: "0 pp effective calibration",
    action: "Stage Move + Range shift", actionShort: "Stage plan",
    cost: "Move 1 + Range 1 = 2 UAP", detail: "At 80% density · range 3 → 4",
    why: "Each action buys movement, reach or preparation. Choose what helps this turn.",
    skill: "Positioning versus setup",
    lines: ["Range +1 costs 1 UAP", "Move costs 1 UAP", "Calibration stays at 60%", "Density stays at 80%"],
    alternate: ["Range + Step-Up: 1 UAP each", "60% → 85% calibration", "48% → 68% effective · +20 pp", "Uses both UAP; gives up the Move."],
    compactAlternative: ["Range + Step-Up: 68% effective (+20 pp).", "Both UAP used; gives up the Move."],
    condition: "Conditional on this ordered plan resolving.",
    footer: "Pick two: movement, extra reach or better calibration.",
    map: "K01 · K03 · K05 / P02 · P10 · P11",
  },
  {
    id: "s02-triage", title: "02 / Triage and support", phase: "COMMAND", round: "4",
    selected: "A1 / Pending artifact", question: "Save this work. Keep the support?",
    metric: "Verify 1 → 0", delta: "B1 supplies −1 attention",
    action: "Verify A1", actionShort: "Verify A1",
    cost: "0 attention", detail: "Local reach · reveal truth · stabilize",
    why: "Validated work can support nearby work. Closing B1 removes that help.",
    skill: "Keeping an economy versus taking points",
    lines: ["Signal 62% · truth unknown", "Age 3 / limit 2 · overdue", "If still pending: +2 Drift", "SC1 and LN1 freeze next Register."],
    alternate: ["B1: verified, sound, objective-eligible", "80% density · 85% source calibration", "Keep: discounts now; LN1/HV1 +1 UAP", "at next Register if still supported.", "Accept B1: +1 Progress at Resolution;", "its support ends immediately."],
    compactAlternative: ["Keep: LN1/HV1 +1 UAP next Register, if supported.", "Accept: +1 Progress at Resolution; support off now."],
    condition: "Verify stops the hazard; it does not accept A1.",
    footer: "A1 is due this Resolution. B1 helps you deal with it now.",
    map: "D03 · D04 · T06 · T07 / P03 · P04 · P08",
  },
  {
    id: "s03-interference", title: "03 / Read the interference", phase: "ARTILLERY", round: "4",
    selected: "Smoke / target 4,3", question: "This footprint includes your pieces.",
    metric: "68% → 16%", delta: "−52 pp effective calibration",
    action: "Confirm Smoke target", actionShort: "Confirm target",
    cost: "1 card · cooldown 3", detail: "At 80% density · if not screened",
    why: "Smoke disrupts the mechs producing new work. Validated work keeps helping.",
    skill: "Area control and collateral effects",
    lines: ["LN1 calibration 85% → 20%", "HV1 calibration 90% → 20%", "B1 active: A1 Verify stays 0", "Old artifact generation metrics stay fixed."],
    alternate: ["Affected: LN1, HV1; either owner's mechs", "B1 still helps LN1/HV1 next Register.", "Lasts through this and next Command.", "Enemy may place Chaff this salvo.", "Known screen at 8,7 does not block", "the proposed center at 4,3."],
    compactAlternative: ["LN1/HV1 affected; B1 keeps helping.", "Smoke lasts this + next Command."],
    condition: "A shot consumes its card even when screened.",
    footer: "Read which mechs are caught and how their next output changes.",
    map: "A02 · A05 / P09 · P10 · P11",
  },
  {
    id: "s04-resolution", title: "04 / Understand the result", phase: "KINETIC", round: "5",
    selected: "Resolution / round 4", question: "What did your sequence accomplish?",
    metric: "Progress 2 → 3", delta: "Drift stays at 1 / 4",
    action: "Continue to current board", actionShort: "Continue",
    cost: "Read-only recap", detail: "Now: Register 5 complete",
    why: "You used the support before closing it. That changed today's cost and tomorrow's options.",
    skill: "Sequencing and planning ahead",
    lines: ["1  Verify A1 while B1 helps: cost 0", "2  Accept B1: support ends now", "3  End Command after output decisions", "Resolution: B1 adds 1 Progress, removed."],
    alternate: ["NOW / Round 5 Kinetic", "A1 remains verified and stable.", "B1 supplies no Register bonus.", "LN1: 2 UAP · HV1: 1 UAP", "No pause was added to the engine.", "The recap describes the previous round."],
    compactAlternative: ["Now: A1 verified; B1 removed.", "No B1 bonus: LN1 2 UAP · HV1 1 UAP."],
    condition: "History and current state are separate.",
    footer: "You stabilized A1 first, then traded B1's future support for progress.",
    map: "D03 · D04 · D09 · T08 · T11 / P01 · P02",
  },
];

const C = {
  paper: "#f4f1e9", ink: "#19333e", muted: "#526771", edge: "#c3cfcf",
  white: "#ffffff", teal: "#117d78", tealLight: "#dcf0e7", red: "#b43e38",
  redLight: "#f8e4df", amber: "#875d12", gold: "#f5e7b8", grid: "#d4dace",
  dark: "#112d37", blue: "#315d86",
};
const esc = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const rect = (x, y, w, h, fill = C.white, stroke = C.edge, r = 12, more = "") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" ${more}/>`;
const text = (x, y, value, size = 16, color = C.ink, weight = 400, extra = "") =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}" ${extra}>${esc(value)}</text>`;
const line = (x1, y1, x2, y2, color = C.teal, more = "") =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" ${more.includes("stroke-width=") ? "" : 'stroke-width="2"'} ${more}/>`;

function words(value, chars) {
  const result = [];
  let current = "";
  for (const word of value.split(" ")) {
    if (current && (current + " " + word).length > chars) { result.push(current); current = word; }
    else current = current ? current + " " + word : word;
  }
  if (current) result.push(current);
  return result;
}
function paragraph(x, y, w, value, size = 16, color = C.muted, step = 24, weight = 400) {
  const rows = words(value, Math.floor(w / (size * 0.56)));
  return { svg: rows.map((row, i) => text(x, y + i * step, row, size, color, weight)).join(""), height: rows.length * step };
}
function rows(x, y, w, values, size = 16, step = 26) {
  let svg = "";
  for (const value of values) {
    const row = paragraph(x, y, w, value, size, C.muted, step);
    svg += row.svg; y += row.height + 3;
  }
  return svg;
}
function metric(x, y, w, label, value, accent = C.ink) {
  return rect(x, y, w, 58) + text(x + 14, y + 21, label, 12, C.muted, 700) +
    text(x + 14, y + 46, value, 21, accent, 700);
}
function number(x, y, value, color = C.ink) {
  return `<circle cx="${x}" cy="${y}" r="12" fill="${color}"/>` +
    text(x, y + 4, value, 12, C.white, 700, 'text-anchor="middle"');
}

function board(scene, x, y, size) {
  const cell = size / 10;
  const compact = size < 400;
  const point = (a, b) => [x + (a + 0.5) * cell, y + (b + 0.5) * cell];
  let out = rect(x, y, size, size, "#faf8f0", C.ink, 2);
  for (let a = 0; a < 10; a++) for (let b = 0; b < 10; b++) {
    if ((a + b) % 2 === 0) out += rect(x + a * cell, y + b * cell, cell, cell, "#f0efe2", "none", 0);
  }
  const field = (a, b, radius, color, dashed = false, opacity = 0.14, excludeCenter = false) => {
    const left = Math.max(0, a - radius), top = Math.max(0, b - radius);
    const right = Math.min(10, a + radius + 1), bottom = Math.min(10, b + radius + 1);
    const style = `fill-opacity="${opacity}" stroke-width="2" ${dashed ? 'stroke-dasharray="' + (typeof dashed === "string" ? dashed : "7 5") + '"' : ""}`;
    if (excludeCenter) {
      const d = `M ${x+left*cell} ${y+top*cell} h ${(right-left)*cell} v ${(bottom-top)*cell} h ${-(right-left)*cell} Z M ${x+a*cell} ${y+b*cell} h ${cell} v ${cell} h ${-cell} Z`;
      return `<path d="${d}" fill="${color}" stroke="${color}" fill-rule="evenodd" ${style}/>`;
    }
    return rect(x + left * cell, y + top * cell, (right - left) * cell, (bottom - top) * cell,
      color, color, 0, style);
  };
  if (scene.id === "s01-planning") {
    out += field(3, 3, 4, C.teal, true, .08, true);
    out += field(2, 3, 3, C.blue, false, .025, true);
  } else if (scene.id !== "s04-resolution") {
    out += field(4, 3, 1, C.teal, false, .2);
    out += field(3, 3, 1, C.red, "2 5", .08);
  } else out += field(4, 3, 1, C.muted, true, .02);
  const front = scene.id === "s01-planning" ? [4, 4] : scene.id === "s04-resolution" ? [6, 6] : [5, 5];
  out += field(...front, 1, C.amber, false, .075);
  if (scene.id === "s03-interference") {
    out += field(4, 3, 1, C.red, true, .14);
    out += field(8, 7, 1, C.blue, true, .07);
  }
  for (let i = 1; i < 10; i++) {
    out += line(x + i * cell, y, x + i * cell, y + size, C.grid, 'stroke-width="1"');
    out += line(x, y + i * cell, x + size, y + i * cell, C.grid, 'stroke-width="1"');
  }
  out += text(x + (front[0]-1)*cell + 6, y + (front[1]+2)*cell - 7,
    "Your front · R" + scene.round, compact ? 9 : 12, C.amber, 600);
  if (scene.id === "s03-interference") out += text(x+7*cell+6,y+6*cell+15,"Chaff",compact?9:12,C.blue,600);
  if (!compact) for (let i = 0; i < 10; i++) {
    out += text(x + i * cell + 5, y + 15, i, 11, C.muted);
    if (i) out += text(x + 5, y + i * cell + 15, i, 11, C.muted);
  }
  const connect = (a, b, c, d, color, dashed = false) => {
    const [x1, y1] = point(a, b), [x2, y2] = point(c, d);
    return line(x1, y1, x2, y2, color, `stroke-width="3" ${dashed ? 'stroke-dasharray="5 4"' : ""}`);
  };
  if (scene.id === "s02-triage" || scene.id === "s03-interference") {
    out += connect(4, 3, 3, 3, C.teal) + connect(4, 3, 3, 2, C.teal, true) + connect(4, 3, 5, 3, C.teal, true);
  }
  if (scene.id === "s01-planning") out += connect(2, 3, 3, 3, C.teal, true);

  const token = (a, b, label, kind, owner = "own", state = "") => {
    const [cx, cy] = point(a, b);
    const radius = cell * (compact ? .37 : .34);
    const color = owner === "enemy" ? C.red : kind === "battery" ? C.teal : C.ink;
    const fill = owner === "enemy" ? C.redLight : kind === "battery" ? C.tealLight : C.white;
    let result = "";
    if (state === "selected" || (scene.id === "s02-triage" && label === "A1")) result += `<circle cx="${cx}" cy="${cy}" r="${radius+5}" fill="none" stroke="${C.teal}" stroke-width="3"/>`;
    if (kind === "mech") {
      const points = Array.from({length:6}, (_,i) => {
        const angle = i * Math.PI / 3;
        return `${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`;
      }).join(" ");
      result += `<polygon points="${points}" fill="${fill}" stroke="${color}" stroke-width="2.5"/>`;
    } else if (kind === "artifact") {
      result += `<polygon points="${cx},${cy-radius} ${cx+radius},${cy} ${cx},${cy+radius} ${cx-radius},${cy}" fill="${fill}" stroke="${color}" stroke-width="2.5"/>`;
    } else result += rect(cx-radius, cy-radius, radius*2, radius*2, fill, color, 4, 'stroke-width="2.5"');
    result += text(cx, cy + (compact ? 4 : 5), label, compact ? 10 : 16, color, 700, 'text-anchor="middle"');
    if (state === "hazard") {
      const tx = cx + radius, ty = cy - radius;
      result += `<path d="M ${tx} ${ty-12} l 11 20 h -22 Z" fill="${C.red}"/>`;
      result += text(tx, ty+3, "!", 12, C.white, 700, 'text-anchor="middle"');
    }
    if (state === "verified" || kind === "battery") result += text(cx+radius-1, cy-radius+3, "✓", compact ? 11 : 16, C.teal, 700);
    return result;
  };
  if (scene.id === "s01-planning") {
    out += token(1, 2, "SC1", "mech") + token(2, 3, "LN1", "mech", "own", "selected") + token(4, 2, "HV1", "mech");
    const [gx, gy] = point(3, 3);
    out += rect(gx-cell*.30, gy-cell*.30, cell*.60, cell*.60, "none", C.teal, 6, 'stroke-width="2" stroke-dasharray="5 4"');
    out += text(gx, gy+4, "1", compact ? 12 : 18, C.teal, 700, 'text-anchor="middle"');
  } else {
    out += token(2, 3, "SC1", "mech") + token(3, 2, "LN1", "mech") + token(5, 3, "HV1", "mech");
    out += token(3, 3, "A1", "artifact", "own", scene.id === "s04-resolution" ? "verified" : "hazard");
    if (scene.id !== "s04-resolution") out += token(4, 3, "B1", "battery");
    else {
      const [rx, ry] = point(4,3);
      out += text(rx, ry+5, "×", compact ? 24 : 36, C.muted, 400, 'text-anchor="middle"');
    }
  }
  out += token(8, 7, "LN2", "mech", "enemy") + token(8, 8, "SC2", "mech", "enemy") + token(7, 8, "HV2", "mech", "enemy");
  if (scene.id === "s03-interference") {
    const [cx, cy] = point(4, 3);
    out += `<circle cx="${cx}" cy="${cy}" r="${cell*.46}" fill="none" stroke="${C.red}" stroke-width="2" stroke-dasharray="4 3"/>`;
  }
  if (!compact) {
    out += number(x+size-22, y+24, "1", C.teal);
    out += text(x+14, y+size-17, scene.id === "s01-planning" ? "Dashed: proposed reach · emitter cell excluded" : scene.id === "s04-resolution" ? "× = B1 removed in Resolution" : scene.id === "s03-interference" ? "Dashes: proposed Smoke · dots: artifact hazard" : "Solid: discount now · dashed: UAP next Register", 14, C.ink, 600);
  }
  return out;
}

function desktop(scene, width, height) {
  const wide = width > 1600;
  const leftWidth = wide ? 250 : 200, bx = wide ? 302 : 244, by = wide ? 174 : 184;
  const size = wide ? 620 : 680, rx = wide ? 950 : 944, rw = wide ? 512 : 472;
  const bottom = by + size, panelY = 164;
  let out = rect(0, 0, width, height, C.paper, "none", 0);
  out += rect(0, 0, width, 68, C.dark, "none", 0);
  out += text(24, 30, "CONTEXT LANDSCAPE", 20, C.white, 700);
  out += text(24, 53, "A board of work, support and decisions", 14, "#b7d6d4");
  out += text(width-24, 30, scene.title, 22, C.white, 600, 'text-anchor="end"');
  out += text(width-24, 53, "AUTHORED WIREFRAME / " + width + " × " + height, 12, "#b7d6d4", 600, 'text-anchor="end"');
  const mw = (width-48-5*12)/6;
  const metricData = [["ROUND", scene.round+" / 8"], ["PHASE", scene.phase], ["ATTENTION", "3"], ["PROGRESS", scene.id === "s04-resolution" ? "3 / 12" : "2 / 12"], ["DRIFT", "1 / 4"], ["BATTERIES", scene.id === "s01-planning" || scene.id === "s04-resolution" ? "0" : "1"]];
  metricData.forEach(([label,value],i) => out += metric(24+i*(mw+12),84,mw,label,value,label==="DRIFT"?C.red:C.ink));

  out += rect(24,panelY,leftWidth,bottom-panelY,C.white);
  out += text(40,194,"YOUR FORCE",13,C.muted,700);
  const names = ["SC1 / Scout","LN1 / Line","HV1 / Heavy"];
  names.forEach((name,i) => {
    const yy = 210+i*72;
    out += rect(36,yy,leftWidth-24,60,scene.id==="s01-planning"&&i===1?C.tealLight:C.paper,"none",7);
    out += text(48,yy+25,name,16,C.ink,700);
    out += text(48,yy+46,scene.id==="s01-planning"?[ "3 UAP","2 UAP · selected","1 UAP"][i]:scene.id==="s04-resolution"?["3 UAP","2 UAP","1 UAP"][i]:scene.id==="s03-interference"?"Kinetic resolved":"Output decided",12,C.muted);
  });
  out += text(40,459,"OPEN WORK",13,C.muted,700);
  if (scene.id === "s01-planning") out += rows(40,488,leftWidth-32,["Output happens in Command.","No artifacts emitted yet."],14,22);
  else {
    out += rect(36,477,leftWidth-24,96,scene.id==="s02-triage"?C.tealLight:C.paper,"none",7);
    out += text(48,502,"◇ A1",18,C.ink,700);
    out += text(48,526,scene.id==="s04-resolution"?"Verified · stable":"Signal 62%",14,C.muted);
    out += text(48,552,scene.id==="s04-resolution"?"Still pending":"Age 3 / limit 2",14,scene.id==="s04-resolution"?C.teal:C.red,600);
    if (scene.id !== "s04-resolution") {
      out += rect(36,585,leftWidth-24,96,C.tealLight,"none",7);
      out += text(48,610,"▣ B1 / Battery",16,C.teal,700);
      out += text(48,634,"Verified · sound",14,C.muted);
      out += text(48,660,scene.id==="s03-interference"?"Active in Smoke":"Active support",14,C.teal,600);
    }
  }
  out += text(40,bottom-42,"ALL PIECES",12,C.muted,700);
  out += paragraph(40,bottom-21,leftWidth-30,"Shared map + ledger selection",12,C.muted,16).svg;

  out += text(bx,by-14,scene.id==="s04-resolution"?"NOW / ROUND 5 FIELD":"TACTICAL FIELD / 10 × 10",13,C.muted,700);
  out += board(scene,bx,by,size);
  out += text(bx,bottom+21,"⬡ Mech    ◇ Artifact    ▣ Battery    ! Hazard",13,C.muted,600);

  out += rect(rx,panelY,rw,192,C.dark,"none");
  out += number(rx+26,panelY+30,"2",C.teal);
  out += text(rx+48,panelY+35,scene.selected,20,C.white,700);
  out += text(rx+20,panelY+86,scene.metric,36,C.white,700);
  out += text(rx+20,panelY+119,scene.delta,18,"#bee5dd",600);
  out += text(rx+20,panelY+151,scene.detail,14,"#d3e4e8");
  out += text(rx+20,panelY+176,scene.cost,14,"#d3e4e8",700);

  const detailsY = 372;
  out += rect(rx,detailsY,rw,wide?bottom-detailsY:306,C.white);
  out += text(rx+20,detailsY+31,"WHAT CHANGES",13,C.muted,700);
  out += rows(rx+20,detailsY+65,rw-40,scene.lines,16,25);
  if (!wide) out += rows(rx+20,566,rw-40,scene.compactAlternative,15,21);
  const noteY = wide ? 620 : 616;
  out += paragraph(rx+20,noteY,rw-40,scene.condition,15,C.red,22,600).svg;
  if (wide) {
    const nx=1488,nw=536;
    out += rect(nx,panelY,nw,310,C.white);
    out += number(nx+26,panelY+30,"3",C.amber);
    out += text(nx+48,panelY+35,scene.id==="s01-planning"?"COMPARE THE ALTERNATIVE":"FOLLOW THE RELATIONSHIPS",14,C.ink,700);
    out += rows(nx+20,panelY+76,nw-40,scene.alternate,18,30);
    out += rect(nx,490,nw,bottom-490,C.gold,"none");
    out += text(nx+20,523,"WHAT THIS REPRESENTS",13,C.amber,700);
    out += paragraph(nx+20,561,nw-40,scene.why,20,C.ink,29).svg;
    out += text(nx+20,bottom-57,"FAMILIAR SKILL",12,C.amber,700);
    out += paragraph(nx+20,bottom-31,nw-40,scene.skill,17,C.ink,25,600).svg;
  } else {
    out += rect(rx,696,rw,bottom-696,C.gold,"none");
    out += text(rx+20,727,"WHAT THIS REPRESENTS",13,C.amber,700);
    out += paragraph(rx+20,758,rw-40,scene.why,16,C.ink,24).svg;
    out += paragraph(rx+20,bottom-30,rw-40,scene.skill,14,C.amber,20,700).svg;
  }
  const fy=height-76;
  out += rect(24,fy,width-48,52,C.dark,"none",10);
  out += text(42,fy+22,scene.question,17,C.white,700);
  out += text(42,fy+42,scene.footer,13,"#c2d9dc");
  out += rect(width-316,fy+7,276,38,C.teal,"none",7);
  out += text(width-178,fy+32,scene.action,15,C.white,700,'text-anchor="middle"');
  return out;
}

function mobile(scene) {
  let out = rect(0,0,390,844,C.paper,"none",0);
  out += rect(0,0,390,60,C.dark,"none",0);
  out += text(16,25,"CONTEXT LANDSCAPE",17,C.white,700);
  out += text(16,47,scene.title,13,"#c2d9dc");
  out += text(16,88,"ROUND "+scene.round+" / 8",12,C.muted,700);
  out += text(374,88,scene.phase,12,C.teal,700,'text-anchor="end"');
  out += rect(16,100,358,40,C.white);
  out += text(28,126,"Attention 3",14,C.ink,700);
  out += text(147,126,scene.id==="s04-resolution"?"Progress 3/12":"Progress 2/12",13,C.ink);
  out += text(282,126,"Drift 1/4",13,C.red,700);
  out += rect(16,151,358,52,C.white);
  out += text(28,175,scene.selected,17,C.ink,700);
  out += text(28,194,scene.id==="s02-triage"?"A1 overdue · B1 active · 2 mechs at risk":scene.id==="s03-interference"?"2 mechs affected · B1 support stays active":scene.id==="s04-resolution"?"Past result; current board is Round 5":"Move + Range shift · 2 / 2 UAP",12,C.muted);
  out += board(scene,25,218,340);
  out += text(25,580,"⬡ Mech   ◇ Artifact   ▣ Battery   ! Hazard",11,C.muted);
  out += rect(16,596,358,146,C.dark,"none",12);
  out += text(30,621,scene.actionShort,15,"#c2d9dc",700);
  out += text(30,656,scene.metric,28,C.white,700);
  out += text(30,681,scene.delta,14,"#bee5dd",600);
  out += text(30,706,scene.detail,12,"#c2d9dc");
  out += text(30,730,scene.cost,12,"#c2d9dc",700);
  out += rect(16,752,358,32,C.gold,"none",7);
  out += text(28,773,"What this represents  /  Details + conditions",12,C.amber,700);
  out += rect(16,795,358,36,C.teal,"none",8);
  out += text(195,819,scene.action,14,C.white,700,'text-anchor="middle"');
  return out;
}

export function renderScene(scene,width,height) {
  const desc = `Authored static design fixture. ${scene.question} ${scene.metric}; ${scene.delta}. ${scene.condition} ${scene.map}. Not a playable match.`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
<title id="title">${esc(scene.title)} — ${width}×${height}</title>
<desc id="desc">${esc(desc)}</desc>
<g font-family="Segoe UI, Arial, sans-serif">
${width===390?mobile(scene):desktop(scene,width,height)}
</g></svg>
`;
}

export function gallery() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Context Landscape — board design gallery</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#112d37;color:#ecf1ee;font:16px/1.55 "Segoe UI",Arial,sans-serif}header,main,footer{max-width:1500px;margin:auto;padding:24px}h1{font-size:clamp(25px,3vw,40px);line-height:1.2;margin:8px 0 16px}.eyebrow{color:#a7cec5;font-weight:700;font-size:13px;letter-spacing:.12em}a{color:#a5e6d5}nav{display:flex;gap:18px;flex-wrap:wrap}p{max-width:85ch}.controls{display:flex;gap:24px;flex-wrap:wrap;padding:18px 0}label{display:grid;gap:6px;font-size:14px}select{font:inherit;padding:10px;color:#19333e;border-radius:6px;border:0;max-width:100%}.note{background:#203f48;border-left:4px solid #a5e6d5;padding:16px 20px;border-radius:5px}.stage{padding:16px;background:#d4dace;border-radius:12px;overflow:auto}img{display:block;margin:auto;max-width:100%;height:auto}.native img{max-width:none}.links{margin:12px 0}button{font:inherit;background:#d9eae3;color:#17343e;padding:10px 14px;border:0;border-radius:6px;cursor:pointer}button:focus-visible,select:focus-visible,a:focus-visible{outline:3px solid #ffd46c;outline-offset:4px}footer{color:#b9ccd0;font-size:14px}#caption{min-height:3em}@media(max-width:600px){header,main,footer{padding:16px}.stage{padding:4px}.controls{gap:12px}.controls label{width:100%}nav{gap:12px}h1{font-size:28px}}
</style></head><body>
<header><span class="eyebrow">CONTEXT LANDSCAPE / DESIGN STUDY</span><h1>Make the balancing act visible.</h1>
<p>Original wireframes for the v4.4 rules. Artifacts, batteries and mechs share the decision surface. Range changes cost one action per step and preserve calibration. Smoke affects mechs; batteries keep working. These are authored scenarios with checked numerical examples.</p>
<nav aria-label="Design documents"><a href="ontology-and-impact.md">Ontology + impact map</a><a href="reference-patterns.md">Reference study</a><a href="board-brief.md">Board brief + playtest</a><a href="validation.md">Validation record</a></nav></header>
<main><div class="note">The selectors below compare illustrations. Controls drawn inside each SVG are examples and do not submit game actions. Use the actual-size view to inspect typography and geometry.</div>
<div class="controls"><label>Decision scene<select id="scene">${SCENES.map(s=>`<option value="${s.id}">${s.title}</option>`).join("")}</select></label>
<label>Viewport<select id="size"><option value="1440x1000">Desktop · 1440 × 1000</option><option value="2048x900">Wide desktop · 2048 × 900</option><option value="390x844">Phone · 390 × 844</option></select></label>
<label>Image display<button id="scale" aria-pressed="false">Show actual size</button></label></div>
<p id="caption" aria-live="polite"></p><div class="links"><a id="direct" href="wireframes/s01-planning-1440x1000.svg">Open standalone SVG</a></div>
<div class="stage" id="stage"><img id="drawing" src="wireframes/s01-planning-1440x1000.svg" alt="Plan output and range, desktop wireframe"></div>
</main><footer>Base source c714a1903da52c181820bc0f4004411c4d78055c + range-cost and mech-only Smoke amendments through v4.4, 2026-09-06. The redesigned board remains an illustration. Human comprehension targets are pending observation.</footer>
<script>
const scenes=${JSON.stringify(SCENES.map(({id,title,question,condition,map})=>({id,title,question,condition,map})))};
const scene=document.getElementById("scene"),size=document.getElementById("size"),drawing=document.getElementById("drawing"),direct=document.getElementById("direct"),caption=document.getElementById("caption");
function refresh(){const item=scenes.find(s=>s.id===scene.value);const src="wireframes/"+item.id+"-"+size.value+".svg";drawing.src=src;drawing.alt=item.title+". "+item.question+" "+item.condition;direct.href=src;caption.textContent=item.question+" "+item.condition+" / "+item.map;}
scene.addEventListener("change",refresh);size.addEventListener("change",refresh);
document.getElementById("scale").addEventListener("click",event=>{const active=document.getElementById("stage").classList.toggle("native");event.currentTarget.setAttribute("aria-pressed",String(active));event.currentTarget.textContent=active?"Fit to window":"Show actual size";});
refresh();
</script></body></html>`;
}

export async function renderAll() {
  await mkdir(join(ROOT,"wireframes"),{recursive:true});
  for(const scene of SCENES) for(const [w,h] of SIZES) {
    await writeFile(join(ROOT,"wireframes",`${scene.id}-${w}x${h}.svg`),renderScene(scene,w,h),"utf8");
  }
  await writeFile(join(ROOT,"index.html"),gallery(),"utf8");
  console.log("Rendered 12 original SVG wireframes and the local gallery.");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await renderAll();
