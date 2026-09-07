// Run from the repository root: node --import tsx docs/ui-review/capture.mjs
// Every write request is intercepted. GETs load local art and published research.
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import axe from 'axe-core';
import { battleViewFixture } from '../../apps/web/src/battle/fixture-v4.ts';
import { createMatchState, projectForPlayer, buildReconstruction } from '@landscape/engine';

const base = process.env.UI_REVIEW_BASE ?? 'http://127.0.0.1:5173';
const folder = fileURLToPath(new URL('./after/', import.meta.url));
await mkdir(folder, { recursive: true });
const timestamp = '2026-09-06T12:00:00.000Z';
const account = { schemaVersion: 1, accountId: 'review-pilot', displayName: 'Review Pilot', avatarUrl: null, createdAt: timestamp, lastSeenAt: timestamp };
const art = await Promise.all(['mech-scout', 'mech-line', 'mech-siege'].map(async q => (await (await fetch(`${base}/api/art/catalog?kind=unit&q=${q}&limit=1`)).json()).items[0]));
const fleet = {
  schemaVersion: 1, fleetId: 'review-fleet', ownerAccountId: account.accountId, name: 'Signal Keepers', status: 'ready', weight: 6, compositionModule: 'heavy-line-scout',
  units: ['scout', 'line', 'heavy'].map((chassis, i) => ({ slotId: chassis, chassis, artAssetId: art[i]?.assetId ?? null })),
  identity: { commanderAssetId: null, battlefieldAssetId: null, paletteId: 'signal-teal', emblemId: 'aperture' }, createdAt: timestamp, updatedAt: timestamp
};
const invitation = { schemaVersion: 1, challengeId: 'duel_review', creator: account, opponent: null, status: 'open', createdAt: timestamp, expiresAt: '2026-10-06T12:00:00.000Z', matchId: null, joinPath: '/landscape/?challenge=duel_review', ownFleet: null, opponentFleet: null };
const state = createMatchState('ui-review');
const projection = projectForPlayer(state);
const reconstruction = buildReconstruction(state, []);
const scenes = [
  ...['briefing', 'kinetic', 'artillery', 'capacity', 'command', 'battery', 'end-risk', 'terminal', 'condense-help'].map(name => [name, '']),
  ...['signin', 'empty', 'ready', 'delete', 'art-picker'].map(name => [`hangar-${name}`, '?view=hangar']),
  ...['invitation', 'accepted'].map(name => [`hangar-${name}`, '?challenge=duel_review']),
  ['legacy-scenario', '?view=legacy'], ['legacy-catalog', '?view=legacy&labs=1'],
  ...['awaiting_pre_review', 'reconstruction_available', 'awaiting_final_review', 'complete'].map(stage => [`legacy-${stage}`, '?view=legacy&labSession=review-session']),
  ['commander', '?view=commander'], ['commander-operational', '?view=commander'], ['atlas', '?view=atlas'],
  ['desperation-exemplar', '?view=atlas&landscape=desperation&replay=exemplar'],
  ...['commander', 'artillery', 'desperation'].map(mode => [mode === 'commander' ? 'commander-field' : mode === 'artillery' ? 'artillery-relief' : mode, `?view=atlas&landscape=${mode}`])
];
const viewports = [{ width: 1440, height: 1000 }, { width: 2048, height: 986 }, { width: 1366, height: 768 }, { width: 390, height: 844 }, { width: 720, height: 500 }];
const selectedScenes = process.env.UI_REVIEW_SCENES?.split(',');
const loadPrevious = async name => { try { return JSON.parse(await readFile(new URL(name, import.meta.url), 'utf8')); } catch { return null; } };
const previousLayout = selectedScenes ? await loadPrevious('./layout-audit.json') : null;
const previousAccessibility = selectedScenes ? await loadPrevious('./accessibility-audit.json') : null;
const keep = entry => !selectedScenes?.includes(entry.name);
const measurements = previousLayout?.measurements.filter(keep) ?? [];
const accessibility = previousAccessibility?.filter(keep) ?? [];
const failures = previousLayout?.failures.filter(keep) ?? [];
const browser = await chromium.launch();
try {
  for (const [name, query] of scenes.filter(([name]) => !selectedScenes || selectedScenes.includes(name))) {
    const page = await browser.newPage({ viewport: viewports[0] }); page.setDefaultTimeout(15_000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('context-landscape.uiScale', 'standard'));
    const isBattle = !query;
    const phase = ['command', 'battery', 'end-risk'].includes(name) ? 'command' : name === 'briefing' || name === 'condense-help' ? 'kinetic' : name;
    const battle = isBattle ? battleViewFixture(phase, { hazard: name === 'command' || name === 'end-risk' }) : null;
    if (name === 'battery') { battle.legal.artifacts[0].verify.legal = false; battle.legal.artifacts[0].verify.reason = 'already-verified'; }
    if (name === 'battery') Object.assign(battle.projection.artifacts[0], { densityPct: 90, sourceCalibration: .9, effectiveCalibration: .81, verified: true, revealedSound: true, battery: { active: true, activatedRound: 1, suppressed: false } });
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname; const method = route.request().method();
      if (path === '/api/auth/session') return route.fulfill({ json: { schemaVersion: 1, authenticated: name !== 'hangar-signin', account, csrfToken: 'review-token' } });
      if (path === '/api/hangar/fleets') return route.fulfill({ json: name === 'hangar-empty' ? [] : [fleet] });
      if (path === '/api/battle-command/challenges') return route.fulfill({ json: [invitation] });
      if (path.startsWith('/api/battle-command/challenges/')) return route.fulfill({ json: name === 'hangar-accepted' ? {
        ...invitation, status: 'accepted', opponent: { ...account, accountId: 'rival', displayName: 'Far Signal' }, matchId: 'review-match',
        ownFleet: { ...fleet, snapshotHash: `sha256:${'a'.repeat(64)}` }, opponentFleet: { ...fleet, fleetId: 'rival-fleet', name: 'Far Signal', ownerAccountId: 'rival', identity: { ...fleet.identity, paletteId: 'warning-amber' }, snapshotHash: `sha256:${'b'.repeat(64)}` }
      } : invitation });
      if (path.startsWith('/api/gameplay-lab-sessions/')) {
        if (path.endsWith('reconstruction')) return route.fulfill({ json: reconstruction });
        const stage = name.replace('legacy-', ''); const final = ['awaiting_final_review', 'complete'].includes(stage);
        const trial = { trialId: 'trial-review', variantToken: 'A', matchId: state.matchId, status: final ? 'complete' : stage, startedAt: timestamp, completedAt: timestamp, bookmarks: [] };
        return route.fulfill({ json: { session: {
          labSessionId: 'review-session', labId: 'battery-lab', labVersion: 1, title: 'Context Management Study', status: final ? stage : 'active', currentTrialIndex: 0, trialCount: 2, currentTrial: final ? null : trial, completedTrialTokens: final ? ['A', 'B'] : [], createdAt: timestamp, updatedAt: timestamp,
          revealedVariants: stage === 'complete' ? [{ variantToken: 'A', variantId: 'baseline', labelForReview: 'Baseline' }, { variantToken: 'B', variantId: 'variant', labelForReview: 'Variant' }] : undefined
        }, projection, events: [], reconstruction: stage === 'reconstruction_available' ? reconstruction : undefined, exportPaths: { json: '/api/review/export.json', markdown: '/api/review/export.md' } } });
      }
      if (method !== 'GET') return path === '/api/matches' ? route.fulfill({ json: projection }) : isBattle && path.startsWith('/api/battle-command/matches') ? route.fulfill({ json: battle }) : route.fulfill({ status: 204 });
      return route.continue();
    });
    try {
      await page.goto(`${base}/landscape/${query}`); await page.waitForLoadState('networkidle');
      if (isBattle && name !== 'briefing') {
        await page.getByRole('button', { name: 'Enter battle command' }).click(); await page.getByLabel('Fleet command lane').waitFor();
        if (['command', 'battery'].includes(name)) { await page.locator('.artifact-piece').first().click(); await page.getByLabel('Context inspector details', { exact: true }).waitFor(); }
        if (name === 'end-risk') await page.getByRole('button', { name: 'End Command', exact: true }).click();
        if (name === 'condense-help') await page.getByRole('button', { name: 'Condense output', exact: true }).hover();
      }
      if (name.startsWith('hangar-') && !['hangar-empty', 'hangar-signin'].includes(name)) {
        await page.getByRole('button', { name: /^Signal Keepers/ }).click();
        if (name === 'hangar-delete') await page.getByRole('button', { name: 'Delete fleet', exact: true }).click();
        if (name === 'hangar-art-picker') await page.locator('.unit-art-card').first().click();
      }
      if (name === 'commander-operational') { await page.locator('.navigator-field select').first().selectOption({ index: 1 }); await page.getByRole('button', { name: 'Enter selected battle' }).click(); }
      await page.waitForLoadState('networkidle'); await page.evaluate(() => document.fonts.ready);
      if (name === 'desperation-exemplar') await page.getByRole('button', { name: 'Decision exemplar', exact: true }).click();
      // Inspect representative runtime semantics and CSS contrast. The 6,400-cell field
      // uses the same chrome; its selected values and keyboard path are checked separately.
      if (['kinetic', 'command', 'hangar-signin', 'hangar-ready', 'hangar-delete', 'atlas', 'artillery-relief', 'desperation', 'desperation-exemplar', 'commander', 'legacy-scenario'].includes(name)) {
        await page.addScriptTag({ content: axe.source });
        const result = await page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] }, resultTypes: ['violations'] })).violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => ({ target: n.target, failure: n.failureSummary })) })));
        accessibility.push({ name, violations: result });
        if (result.length) console.log('ACCESSIBILITY', name, JSON.stringify(result));
      }
      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        for (const scale of ['compact', 'standard', 'large', 'xlarge']) {
          await page.evaluate(async scale => { localStorage.setItem('context-landscape.uiScale', scale); window.dispatchEvent(new Event('context-landscape:ui-scale')); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); }, scale);
          const geometry = await page.evaluate(() => ({ width: innerWidth, viewportHeight: innerHeight, scrollWidth: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, dockBottom: document.querySelector('.phase-dock')?.getBoundingClientRect().bottom }));
          measurements.push({ name, scale, ...geometry, errors });
          if (geometry.scrollWidth > viewport.width + 1 || isBattle && name !== 'briefing' && viewport.width > 1180 && (geometry.height > viewport.height + 1 || geometry.dockBottom > viewport.height + 1)) failures.push({ name, scale, ...geometry });
          if (scale === 'standard' && [1440, 390].includes(viewport.width)) {
            if (['command', 'battery'].includes(name) && viewport.width === 1440) {
              await page.locator('.battle-workspace').evaluate(e => { e.scrollTop = e.scrollHeight; });
              await page.locator('.inspector-expansion').evaluate(e => { e.scrollTop = e.scrollHeight; });
            }
            await page.screenshot({ path: `${folder}/${name}${viewport.width === 390 ? '-mobile' : ''}.png`, fullPage: true });
          }
        }
      }
      console.log('Reviewed', name);
    } catch (error) { failures.push({ name, error: error.message }); console.log('FAILED', name, error.message.split('\n')[0]); }
    finally { await page.close(); }
  }
} finally {
  await browser.close();
  await writeFile(new URL('./layout-audit.json', import.meta.url), JSON.stringify({ viewports, measurements, failures }, null, 2));
  await writeFile(new URL('./accessibility-audit.json', import.meta.url), JSON.stringify(accessibility, null, 2));
}
console.log(`${measurements.length} layout states; ${failures.length} failures.`);
if (failures.length || accessibility.some(result => result.violations.length)) process.exitCode = 1;
