import {
  ATTENTION_V2_CAPACITY_MODULES,
  ATTENTION_V2_MOVEMENT_MODULES,
  ATTENTION_V2_TRIAGE_MODULES,
  ATTENTION_V4_COMPOSITION_MODULES,
  ATTENTION_V4_COMMANDER_PROFILE_COUNT
} from "../packages/contracts/dist/index.js";
import {
  compileAttentionV4Commander,
  createAttentionV4CommanderCatalog
} from "../packages/engine/dist/index.js";

const catalog = createAttentionV4CommanderCatalog();
const fail = (message) => { throw new Error(`attention-v4 compiler coverage failed: ${message}`); };
if (catalog.profiles.length !== ATTENTION_V4_COMMANDER_PROFILE_COUNT) fail(`expected ${ATTENTION_V4_COMMANDER_PROFILE_COUNT} profiles, received ${catalog.profiles.length}`);
if (new Set(catalog.profiles.map((profile) => profile.ordinal)).size !== ATTENTION_V4_COMMANDER_PROFILE_COUNT) fail("ordinals are not exhaustive");
if (new Set(catalog.profiles.map((profile) => profile.profileHash)).size !== ATTENTION_V4_COMMANDER_PROFILE_COUNT) fail("profile hashes are not unique");
if (new Set(catalog.compiledHashes).size !== ATTENTION_V4_COMMANDER_PROFILE_COUNT) fail("compiled hashes are not unique");

for (const [label, expected, values] of [
  ["composition", ATTENTION_V4_COMPOSITION_MODULES, catalog.profiles.map((profile) => profile.compositionModule)],
  ["triage", ATTENTION_V2_TRIAGE_MODULES, catalog.profiles.map((profile) => profile.triageModule)],
  ["movement", ATTENTION_V2_MOVEMENT_MODULES, catalog.profiles.map((profile) => profile.movementModule)],
  ["capacity", ATTENTION_V2_CAPACITY_MODULES, catalog.profiles.map((profile) => profile.capacityModule)]
]) {
  const covered = new Set(values);
  for (const module of expected) if (!covered.has(module)) fail(`${label} module ${module} is absent`);
}

for (const profile of catalog.profiles) {
  const compiled = compileAttentionV4Commander(profile);
  if (!compiled.compositionBehavior || !compiled.triageBehavior || !compiled.movementBehavior || !compiled.capacityBehavior) {
    fail(`profile ${profile.ordinal} contains an inert mapping`);
  }
  if (new Set(compiled.shellPriority).size !== 5) fail(`profile ${profile.ordinal} does not order all five shells`);
  if (compiled.programHash !== catalog.compiledHashes[profile.ordinal]) fail(`profile ${profile.ordinal} hash attribution drifted`);
}

process.stdout.write(`attention-v4.2 compiler coverage: ${ATTENTION_V4_COMMANDER_PROFILE_COUNT}/${ATTENTION_V4_COMMANDER_PROFILE_COUNT} profiles, ${catalog.catalogHash}\n`);
