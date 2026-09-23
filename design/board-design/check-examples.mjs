// Executable examples for the design documents. No database or network access.
// Boundary fixtures are composed in memory and schema-validated; they are not
// claims about naturally reachable complete match histories.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAttentionV4Match, resolveAttentionV4Kinetic, resolveAttentionV4Artillery,
  resolveAttentionV4Capacity, resolveAttentionV4Round, applyAttentionV4Command,
  legalAttentionV4Actions, projectAttentionV4Match, projectAttentionV4Hazards,
  defaultAttentionV4Rules,
} from "../../packages/engine/src/attention-v4.ts";
import { AttentionV4MatchStateSchema } from "../../packages/contracts/src/attention-v4.ts";
import { SCENES } from "./render-wireframes.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const repo = join(root,"../..");
const checks = [];
function check(id, description, run) { run(); checks.push({ id, description, status:"passed" }); }
function fresh(seed=42) {
  return createAttentionV4Match({
    matchId:"board-design-example",seed,
    players:[{playerId:"alpha",composition:["scout","line","heavy"]},{playerId:"bravo",composition:["scout","line","heavy"]}],
  });
}
function edit(match, change) {
  const state=structuredClone(match.state); change(state);
  return {state:AttentionV4MatchStateSchema.parse(state),rules:match.rules};
}
function plans(match,override={}) {
  return match.state.units.map(u=>({playerId:u.ownerPlayerId,unitId:u.unitId,actions:override[u.unitId]??[]}));
}
function commandFixture() {
  return edit(fresh(),s=>{
    s.phase="command"; s.round=4; s.command.activePlayerId="alpha";
    for(const unit of s.units) unit.outputDecision="held";
    const positions={scout:{x:2,y:3},line:{x:3,y:2},heavy:{x:5,y:3}};
    for(const unit of s.units) if(unit.ownerPlayerId==="alpha") unit.position=positions[unit.chassis];
  });
}
function artifact(overrides={}) {
  return {
    artifactId:"A1",ownerPlayerId:"alpha",sourceUnitId:"alpha:line-1",sourceChassis:"line",
    position:{x:3,y:3},volumeIndex:0,densityPct:80,sourceCalibration:.6,effectiveCalibration:.48,
    sound:true,reportedConfidence:.62,verified:false,objectiveEligible:true,guarantee:null,guaranteedById:null,
    resolution:"pending",newbornRound:1,age:3,contextLimit:2,localTraffic:0,overTaxReasons:["context-limit"],
    supportScanUnitIds:[],battery:{active:false,activatedRound:null,suppressed:false},...overrides,
  };
}
function battery(overrides={}) {
  return artifact({
    artifactId:"B1",position:{x:4,y:3},densityPct:80,sourceCalibration:.85,effectiveCalibration:.68,
    verified:true,reportedConfidence:.74,newbornRound:2,age:1,overTaxReasons:[],
    battery:{active:true,activatedRound:3,suppressed:false},...overrides,
  });
}
function withWork(items=[artifact(),battery()]) { return edit(commandFixture(),s=>{s.artifacts=items;}); }
const own = match => match.state.players.find(p=>p.playerId==="alpha");
const unit = (match,chassis="line") => match.state.units.find(u=>u.ownerPlayerId==="alpha"&&u.chassis===chassis);
const act = (match,intent) => applyAttentionV4Command(match,{playerId:"alpha",...intent});
const cost = (match,id="A1") => legalAttentionV4Actions(match,"alpha").artifacts.find(a=>a.artifactId===id);
const asAlpha = match => edit(match,s=>{s.command.activePlayerId="alpha";});
function armed(match) {
  return edit(match,s=>{
    s.phase="artillery"; s.command.activePlayerId=null; s.capacityTrack.artilleryUnlocked=true;
    s.capacityTrack.nextRank=4;
    for(const p of s.players) {p.armory.cooldown=0;p.armory.retaliationAvailable=false;}
  });
}
function shot(match,playerId,shell,center) {
  const card=match.state.players.find(p=>p.playerId===playerId).armory.cards.find(c=>c.shell===shell);
  assert.ok(card); return {kind:"fire",playerId,cardId:card.cardId,center};
}

check("EX01","K05 / S01: range costs one UAP per step and preserves calibration; Step-Up competes with Move",()=>{
  const before=fresh();
  const shifted=resolveAttentionV4Kinetic(before,plans(before,{"alpha:line-1":[{kind:"move",destination:{x:0,y:2}},{kind:"range-shift",delta:1}]})).match;
  const prepared=resolveAttentionV4Kinetic(before,plans(before,{"alpha:line-1":[{kind:"range-shift",delta:1},{kind:"step-up"}]})).match;
  assert.equal(unit(before).calibration*80,48); assert.equal(unit(shifted).activeRange,4);
  assert.equal(unit(shifted).calibration*80,48); assert.equal(unit(prepared).calibration*80,68);
  assert.equal(unit(shifted).uap.spent,2); assert.equal(unit(prepared).uap.spent,2);
  assert.deepEqual(unit(prepared).position,unit(before).position);
  assert.equal(SCENES[0].metric,"48% → 48%");
});
check("EX02","K02: all three Condense modes and density/volume caps",()=>{
  for(const [steps,volume,density,calibration] of [[0,3,20,.2],[1,2,60,.65],[2,1,90,.85]]) {
    const before=fresh();
    const after=resolveAttentionV4Kinetic(before,plans(before,{"alpha:scout-1":Array.from({length:steps},()=>({kind:"condense-output"}))})).match;
    const allocation=legalAttentionV4Actions(after,"alpha").allocations.find(a=>a.unitId==="alpha:scout-1");
    assert.equal(unit(after,"scout").calibration,calibration);
    assert.equal(allocation.maximumVolume,volume);assert.equal(allocation.maximumDensityPct,density);
  }
});
check("EX03","D01: reactor arithmetic and emission-time metrics",()=>{
  const before=edit(commandFixture(),s=>{const u=s.units.find(u=>u.unitId==="alpha:line-1");u.calibration=.85;u.outputDecision="pending";});
  const good=act(before,{kind:"emit",unitId:"alpha:line-1",volume:2,densityPct:80}).match;
  assert.equal(good.state.artifacts.length,2);assert.ok(good.state.artifacts.every(a=>a.effectiveCalibration===.68));
  const bad=act(before,{kind:"emit",unitId:"alpha:line-1",volume:3,densityPct:80});
  assert.equal(bad.match.state.artifacts.length,0);assert.equal(bad.events.at(-1).data.reason,"reactor-capacity");
});
check("EX04","E03 / G02: same hidden draws, different calibration signal",()=>{
  const run=calibration=>{
    const before=edit(commandFixture(),s=>{const u=s.units.find(u=>u.unitId==="alpha:line-1");u.calibration=calibration;u.outputDecision="pending";});
    return act(before,{kind:"emit",unitId:"alpha:line-1",volume:2,densityPct:80}).match.state.artifacts;
  };
  const a=run(.6),b=run(.85);
  assert.equal(defaultAttentionV4Rules.soundnessRate,.7);
  assert.deepEqual(a.map(x=>x.sound),b.map(x=>x.sound));
  assert.ok(a.some((x,i)=>x.reportedConfidence!==b[i].reportedConfidence));
});
check("EX05","D03 / S02: Verify rescues the hazard without accepting work or improving truth",()=>{
  const before=withWork();
  assert.equal(projectAttentionV4Hazards(before.state).length,1);
  assert.equal(cost(before).verify.cost.total,0);
  const after=act(before,{kind:"verify",artifactId:"A1"}).match;
  const a=after.state.artifacts.find(a=>a.artifactId==="A1");
  assert.equal(a.verified,true);assert.equal(a.resolution,"pending");assert.equal(a.sound,true);
  assert.equal(a.effectiveCalibration,.48);assert.equal(a.reportedConfidence,.62);
  assert.equal(a.battery.active,false);assert.ok(a.overTaxReasons.length);
  assert.equal(projectAttentionV4Hazards(after.state).length,0);assert.equal(own(after).progress,own(before).progress);
});
check("EX06","D07: Focus is a guarantee, not verification or hazard rescue",()=>{
  const before=edit(withWork([artifact({sound:false})]),s=>{s.capacityTrack.nextRank=2;});
  const after=act(before,{kind:"perfect-focus",artifactId:"A1"}).match;
  assert.equal(after.state.artifacts[0].verified,false);assert.equal(after.state.artifacts[0].sound,false);
  assert.equal(after.state.artifacts[0].guarantee,"perfect-focus");
  assert.equal(projectAttentionV4Hazards(after.state).length,1);
  assert.equal(projectAttentionV4Match(after,"alpha").artifacts[0].revealedSound,null);
  assert.equal(own(after).focusNextReadyRound,before.state.round+3);
});
check("EX07","T06: battery eligibility uses source calibration, not effective D×C",()=>{
  for(const [density,calibration,sound,expected] of [[75,.85,true,false],[80,.75,true,false],[80,.85,false,false],[80,.85,true,true]]) {
    const before=withWork([battery({verified:false,sound,densityPct:density,sourceCalibration:calibration,effectiveCalibration:density/100*calibration,battery:{active:false,activatedRound:null,suppressed:false}})]);
    const after=act(before,{kind:"verify",artifactId:"B1"}).match;
    assert.equal(after.state.artifacts[0].battery.active,expected);
    assert.equal(unit(after).uap.effective,unit(before).uap.effective,"activation does not immediately increase UAP");
  }
});
check("EX08","T06: no self-discount; multiple fields and Overclock floor at zero",()=>{
  const single=withWork([battery()]);
  assert.equal(cost(single,"B1").verify.cost.batteryDiscount,0);
  const stacked=edit(withWork([artifact(),battery(),battery({artifactId:"B2",position:{x:4,y:4}})]),s=>{s.players[0].overclockActive=true;});
  assert.equal(cost(stacked).verify.cost.batteryDiscount,1);
  assert.equal(cost(stacked).verify.cost.total,0);assert.equal(cost(stacked).seize.cost.total,0);
  const future=resolveAttentionV4Round(withWork([battery(),battery({artifactId:"B2",position:{x:4,y:4}})])).match;
  assert.equal(unit(future).uap.batteryBonus,1);assert.equal(unit(future).uap.effective,3);
});
check("EX09","G03: enemy battery discounts artifacts but does not assist friendly mech UAP",()=>{
  const enemyBattery=battery({ownerPlayerId:"bravo",sourceUnitId:"bravo:line-1"});
  const before=withWork([artifact(),enemyBattery]);
  assert.equal(cost(before).verify.cost.total,0);
  const after=resolveAttentionV4Round(withWork([enemyBattery])).match;
  assert.equal(unit(after).uap.batteryBonus,0);
});
check("EX10","T01: frozen UAP overrides a same-owner battery bonus",()=>{
  const before=edit(withWork([battery()]),s=>{s.units.find(u=>u.unitId==="alpha:line-1").uap.nextFreezeSources=["emp"];});
  const after=resolveAttentionV4Round(before).match;
  assert.equal(unit(after).uap.batteryBonus,1);assert.equal(unit(after).uap.frozen,true);assert.equal(unit(after).uap.effective,0);
});
check("EX11","A02 / S03: Smoke changes mechs, preserving batteries and artifact birth metrics",()=>{
  const before=edit(armed(withWork()),s=>{s.units.find(u=>u.unitId==="alpha:line-1").calibration=.85;});
  const oldArtifacts=before.state.artifacts.map(a=>({id:a.artifactId,source:a.sourceCalibration,effective:a.effectiveCalibration,density:a.densityPct}));
  const after=resolveAttentionV4Artillery(before,[shot(before,"alpha","smoke",{x:4,y:3}),{kind:"pass",playerId:"bravo"}]).match;
  assert.equal(unit(after).calibration,.2);assert.equal(unit(after,"heavy").calibration,.2);
  assert.equal(unit(before).calibration*80-unit(after).calibration*80,52);
  assert.deepEqual(after.state.artifacts.map(a=>({id:a.artifactId,source:a.sourceCalibration,effective:a.effectiveCalibration,density:a.densityPct})),oldArtifacts);
  assert.equal(after.state.artifacts.find(a=>a.artifactId==="B1").battery.suppressed,false);
  assert.equal(cost(after).verify.cost.total,0);assert.deepEqual(cost(after).seize.cost,cost(before).seize.cost);
  assert.equal(unit(after).uap.effective,unit(before).uap.effective);
  assert.equal(SCENES[2].metric,"68% → 16%");
});
check("EX12","A02 / T01: Smoke expiry restores mech calibration; battery assistance continues throughout",()=>{
  let before=edit(armed(withWork([battery()])),()=>{});
  let after=resolveAttentionV4Artillery(before,[shot(before,"alpha","smoke",{x:4,y:3}),{kind:"pass",playerId:"bravo"}]).match;
  after=edit(after,s=>{s.phase="command";s.command.activePlayerId="alpha";});
  after=resolveAttentionV4Round(after).match;
  assert.equal(after.state.round,5);assert.equal(unit(after).calibration,.2);assert.equal(unit(after).uap.batteryBonus,1);
  after=edit(after,s=>{s.phase="command";s.command.activePlayerId="alpha";for(const u of s.units)u.outputDecision="held";});
  after=resolveAttentionV4Round(after).match;
  assert.equal(after.state.round,6);assert.equal(unit(after).calibration,.6);assert.equal(unit(after).uap.batteryBonus,1);
  assert.ok(!after.state.zones.some(z=>z.kind==="smoke"));
});
check("EX13","T01/T07: exact aging threshold, stable work and newborn immunity",()=>{
  for(const [age,next,hazard] of [[0,1,false],[1,2,false],[2,3,true]]) {
    const before=withWork([artifact({age,overTaxReasons:[],newbornRound:2})]);
    const after=resolveAttentionV4Round(before).match;
    assert.equal(after.state.artifacts[0].age,next);
    assert.equal(projectAttentionV4Hazards(after.state).length>0,hazard);
  }
  const stable=resolveAttentionV4Round(withWork([artifact({verified:true})])).match;
  assert.equal(stable.state.artifacts[0].age,3);assert.equal(projectAttentionV4Hazards(stable.state).length,0);
  const newborn=withWork([artifact({newbornRound:4,age:0,localTraffic:4,overTaxReasons:["local-traffic"]})]);
  assert.equal(projectAttentionV4Hazards(newborn.state).length,0);
});
check("EX14","K/T07: fourth successful bilateral action overloads local traffic",()=>{
  const start=edit(fresh(),s=>{
    s.round=2;
    const positions=[{x:4,y:4},{x:4,y:5},{x:5,y:4},{x:5,y:5},{x:3,y:4},{x:3,y:5}];
    s.units.forEach((u,i)=>{u.position=positions[i];});
    s.artifacts=[artifact({position:{x:4,y:4},age:1,overTaxReasons:[]})];
  });
  const full={"alpha:line-1":[{kind:"step-up"}],"alpha:heavy-1":[{kind:"command-uplink"}],"bravo:line-1":[{kind:"step-up"}],"bravo:heavy-1":[{kind:"command-uplink"}]};
  const three=resolveAttentionV4Kinetic(start,plans(start,{...full,"bravo:heavy-1":[]})).match;
  const four=resolveAttentionV4Kinetic(start,plans(start,full)).match;
  assert.equal(three.state.artifacts[0].localTraffic,3);assert.equal(projectAttentionV4Hazards(three.state).length,0);
  assert.equal(four.state.artifacts[0].localTraffic,4);assert.equal(projectAttentionV4Hazards(four.state).length,1);
});
check("EX15","C01/T01/G06: pay now, future award, actual state overrides contradictory rejection event",()=>{
  const before=edit(fresh(),s=>{s.phase="capacity";s.players[0].attention=1;for(const u of s.units)u.outputDecision="held";});
  const transition=resolveAttentionV4Capacity(before,[{playerId:"alpha",claim:true},{playerId:"bravo",claim:true}]);
  assert.equal(own(transition.match).attention,0);assert.equal(own(transition.match).capacityBonus,1);
  assert.equal(transition.match.state.capacityTrack.claims[0].playerId,"alpha");
  assert.ok(transition.events.some(e=>e.eventType==="attention.v4.capacity.rejected"&&e.actorId==="alpha"&&e.data.reason==="attention"));
  const later=resolveAttentionV4Round(transition.match).match;
  assert.equal(own(later).attention,4);
  const even=edit(before,s=>{s.round=2;s.players[0].attention=3;});
  const contested=resolveAttentionV4Capacity(even,[{playerId:"alpha",claim:true},{playerId:"bravo",claim:true}]).match;
  assert.equal(contested.state.capacityTrack.claims[0].playerId,"bravo");
});
check("EX16","A05/T03: new same-salvo Chaff can invalidate preview, consuming card/cooldown",()=>{
  const before=armed(withWork());
  const attack=shot(before,"alpha","smoke",{x:4,y:3});
  const defense=shot(before,"bravo","chaff",{x:4,y:3});
  const preview=legalAttentionV4Actions(before,"alpha").artilleryPreviews.find(p=>p.cardId===attack.cardId&&p.center.x===4&&p.center.y===3);
  assert.equal(preview.blockedByScreenIds.length,0);
  const transition=resolveAttentionV4Artillery(before,[attack,defense]);
  assert.ok(transition.events.some(e=>e.eventType==="attention.v4.artillery.shell.blocked"&&e.actorId==="alpha"));
  assert.equal(own(transition.match).armory.cooldown,3);assert.ok(!own(transition.match).armory.cards.some(c=>c.cardId===attack.cardId));
  assert.equal(transition.match.state.artifacts.find(a=>a.artifactId==="B1").battery.suppressed,false);
  assert.equal(unit(transition.match).calibration,unit(before).calibration);
  assert.ok(!transition.match.state.zones.some(z=>z.kind==="smoke"));
});
check("EX17","A04: HE resolves hidden outcomes once, leaves verified work, adds no freeze",()=>{
  const before=edit(armed(withWork([
    artifact({artifactId:"good",sound:true}),
    artifact({artifactId:"bad",sound:false}),
    artifact({artifactId:"stable",verified:true}),
  ])),s=>{s.players[0].drift=3;});
  const after=resolveAttentionV4Artillery(before,[shot(before,"alpha","he",{x:4,y:3}),shot(before,"bravo","he",{x:4,y:3})]).match;
  assert.equal(own(after).progress,1);assert.equal(own(after).drift,4);
  assert.equal(own(after).status,"active","HE does not evaluate terminal state yet");
  assert.deepEqual(after.state.artifacts.map(a=>a.artifactId),["stable"]);
  assert.ok(after.state.units.every(u=>u.uap.nextFreezeSources.length===0));
});
check("EX18","D04/T08/S04: Verify before battery commitment; support ends before Resolution",()=>{
  let before=edit(withWork(),s=>{s.players[0].progress=2;s.players[0].drift=1;});
  const verified=act(before,{kind:"verify",artifactId:"A1"}).match;
  assert.equal(own(verified).attention,3);
  const accepted=act(asAlpha(verified),{kind:"accept",artifactId:"B1"}).match;
  assert.equal(accepted.state.artifacts.find(a=>a.artifactId==="B1").battery.active,false);
  assert.equal(cost(accepted).verify.cost.total,1,"cost projection loses the discount even though A1 is already verified");
  const after=resolveAttentionV4Round(accepted).match;
  assert.equal(own(after).progress,3);assert.equal(own(after).drift,1);assert.equal(after.state.round,5);
  assert.equal(unit(after).uap.effective,2);assert.equal(unit(after,"heavy").uap.effective,1);
  assert.equal(after.state.artifacts.length,1);assert.equal(after.state.artifacts[0].verified,true);
  assert.equal(SCENES[3].metric,"Progress 2 → 3");
});
check("EX19","T09: individual Drift defeat precedes its objective victory",()=>{
  const before=edit(withWork([
    artifact({artifactId:"good",sound:true,resolution:"accepted"}),
    artifact({artifactId:"bad",sound:false,resolution:"accepted"}),
  ]),s=>{s.players[0].progress=11;s.players[0].drift=3;});
  const after=resolveAttentionV4Round(before).match;
  assert.equal(own(after).progress,12);assert.equal(own(after).drift,4);
  assert.equal(after.state.winnerPlayerId,"bravo");assert.equal(after.state.status,"complete");
});
check("EX20","E09: old objective eligibility persists after the front moves",()=>{
  const before=withWork([battery()]);
  const after=resolveAttentionV4Round(before).match;
  assert.equal(after.state.artifacts[0].objectiveEligible,true);
  const front=projectAttentionV4Match(after,"alpha").activeFronts.find(f=>f.playerId==="alpha");
  assert.ok(Math.max(Math.abs(front.center.x-4),Math.abs(front.center.y-3))>front.radius);
});
check("EX21","Projection boundary: hidden truth and private streams stay private",()=>{
  const before=withWork([artifact({sourceCalibration:.85,effectiveCalibration:.68})]);
  const opposite=edit(before,s=>{s.artifacts[0].sound=false;});
  assert.deepEqual(legalAttentionV4Actions(before,"alpha"),legalAttentionV4Actions(opposite,"alpha"));
  const projection=projectAttentionV4Match(before,"alpha");
  assert.equal(projection.artifacts[0].revealedSound,null);
  function visit(value) {
    if(Array.isArray(value)) return value.forEach(visit);
    if(value&&typeof value==="object") for(const [key,item] of Object.entries(value)) {
      assert.ok(!["sound","seed","randomStreamId","roundRecords"].includes(key),"private field "+key);
      visit(item);
    }
  }
  visit(projection);
});

const contracts=await readFile(join(repo,"packages/contracts/src/attention-v4.ts"),"utf8");
const map=await readFile(join(root,"ontology-and-impact.md"),"utf8");
check("EX22","Documentation covers every discriminated player intent in current contracts",()=>{
  for(const [schema,kinds] of [
    ["AttentionV4KineticActionSchema",{move:"K01","condense-output":"K02","step-up":"K03","command-uplink":"K04","range-shift":"K05","support-scan":"K06"}],
    ["AttentionV4ArtilleryIntentSchema",{fire:"A01",pass:"A00"}],
    ["AttentionV4CommandIntentSchema",{emit:"D01",hold:"D02",verify:"D03",accept:"D04",reject:"D05",seize:"D06","perfect-focus":"D07",overclock:"D08","end-command":"D09"}],
  ]) {
    const start=contracts.indexOf("export const "+schema+" =");
    assert.ok(start>=0);
    const section=contracts.slice(start,contracts.indexOf("export type ",start));
    const actual=[...section.matchAll(/kind: z\.literal\("([^"]+)"\)/g)].map(m=>m[1]).sort();
    assert.deepEqual(actual,Object.keys(kinds).sort(),schema+" changed: update the inventory");
    for(const id of Object.values(kinds)) assert.ok(map.includes("| "+id+" "));
  }
  for(const id of ["K00","A02","A03","A04","A05","C00","C01",...Array.from({length:13},(_,i)=>"T"+String(i).padStart(2,"0"))]) assert.ok(map.includes("| "+id+" "),id+" missing");
});

const sources={};
for(const path of ["packages/contracts/src/attention-v4.ts","packages/engine/src/attention-v4.ts","apps/server/src/battle-command-core.ts","apps/web/src/battle/BattleCommandApp.tsx","apps/web/src/battle/PerspectiveBoard.tsx"]) {
  sources[path]="sha256:"+createHash("sha256").update(await readFile(join(repo,path))).digest("hex");
}
const report={
  baseSourceCommit:"c714a1903da52c181820bc0f4004411c4d78055c",
  amendment:"2026-09-06: v4.3 action-only range cost; v4.4 Smoke affects mechs and preserves batteries",
  ruleset:defaultAttentionV4Rules.rulesetVersion,
  rulesetHash:defaultAttentionV4Rules.rulesetHash,fixtureScope:"composed in-memory boundary examples; no persistent matches",
  sources,checks,
};
if(process.argv.includes("--write")) await writeFile(join(root,"example-results.json"),JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({ruleset:report.ruleset,passed:checks.length,checks:checks.map(c=>c.id)},null,2));
