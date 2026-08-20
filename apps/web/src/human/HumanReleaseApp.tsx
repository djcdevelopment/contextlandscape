import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  ATTENTION_V4_CHASSIS_WEIGHTS,
  ART_CENSUS_REPORT_HASH,
  type AccountView,
  type ArtCatalogEntry,
  type ArtCatalogPage,
  type ArtKind,
  type AuthSessionView,
  type FleetDraftInput,
  type FleetView,
  type FriendChallengeView
} from "@landscape/contracts";
import { appHref } from "../navigation.js";
import "./human-release.css";

class ApiError extends Error { constructor(readonly status: number, readonly code: string) { super(code); } }
async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", ...init });
  const body = response.status === 204 ? {} : await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new ApiError(response.status, body.error ?? `${response.status}`);
  return body as T;
}

const blankIdentity: FleetDraftInput["identity"] = { commanderAssetId: null, battlefieldAssetId: null, paletteId: "signal-teal", emblemId: "aperture" };
const starter: FleetDraftInput = {
  name: "First Signal",
  units: ["scout", "line", "heavy"].map((chassis) => ({ slotId: crypto.randomUUID(), chassis: chassis as "scout" | "line" | "heavy", artAssetId: null })),
  identity: blankIdentity
};

const ART_FILTERS: Record<ArtKind, ReadonlyArray<{ label: string; query: string }>> = {
  unit: [
    { label: "All", query: "" },
    { label: "Scout frames", query: "mech-scout" },
    { label: "Line frames", query: "mech-line" },
    { label: "Heavy frames", query: "mech-siege" },
    { label: "Ability scenes", query: "ability-card" }
  ],
  commander: [
    { label: "All", query: "" },
    { label: "Scout commanders", query: "commander-scout-mobile-focus" },
    { label: "Siege commanders", query: "commander-adaptive-siege-anchor" }
  ],
  battlefield: [
    { label: "All", query: "" },
    { label: "Furnace arenas", query: "battlefield-context-furnace" },
    { label: "Fortress arenas", query: "battlefield-documentation-fortress" }
  ],
  event: [
    { label: "All", query: "" },
    { label: "Macro flare", query: "ability-macro-flare" },
    { label: "Artillery", query: "artillery" }
  ]
};

type PaletteId = FleetDraftInput["identity"]["paletteId"];
type EmblemId = FleetDraftInput["identity"]["emblemId"];

const PALETTES: ReadonlyArray<{ id: PaletteId; label: string; color: string }> = [
  { id: "signal-teal", label: "Signal teal", color: "#67e0d1" },
  { id: "warning-amber", label: "Warning amber", color: "#efca70" },
  { id: "oxide-red", label: "Oxide red", color: "#ed7c6e" },
  { id: "furnace-violet", label: "Furnace violet", color: "#ba94ec" },
  { id: "night-blue", label: "Night blue", color: "#84b5e9" }
];

const EMBLEMS: ReadonlyArray<{ id: EmblemId; label: string }> = [
  { id: "aperture", label: "Aperture" },
  { id: "chevron", label: "Chevron" },
  { id: "orbit", label: "Orbit" },
  { id: "signal", label: "Signal" },
  { id: "anvil", label: "Anvil" }
];

function EmblemMark({ id }: { id: EmblemId }) {
  return <svg className="emblem-mark" data-emblem={id} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {id === "aperture" && <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 4v5M19 8l-4 2M19 16l-4-2M12 20v-5M5 16l4-2M5 8l4 2" /></>}
    {id === "chevron" && <><path d="m4 14 8-7 8 7" /><path d="m7 19 5-5 5 5" /></>}
    {id === "orbit" && <><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(-25 12 12)" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="8" r="1" fill="currentColor" stroke="none" /></>}
    {id === "signal" && <><path d="M12 19v-7M9 19h6M8.5 13a5 5 0 0 1 7 0M5.5 10a9 9 0 0 1 13 0" /><circle cx="12" cy="8" r="1.2" fill="currentColor" stroke="none" /></>}
    {id === "anvil" && <path d="M4 6h16v4l-5 3v5H9v-5l-5-3V6Zm5 12h6" />}
  </svg>;
}

function paletteLabel(id: PaletteId) { return PALETTES.find((palette) => palette.id === id)?.label ?? id; }
function emblemLabel(id: EmblemId) { return EMBLEMS.find((emblem) => emblem.id === id)?.label ?? id; }

function PalettePicker({ selected, onSelect }: { selected: PaletteId; onSelect: (palette: PaletteId) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const current = PALETTES.find((palette) => palette.id === selected) ?? PALETTES[0];

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeWithEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); setOpen(false); triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [open]);

  return <fieldset className="identity-choice palette-choice"><legend>Palette</legend><div ref={rootRef} className="palette-picker-shell">
    <button ref={triggerRef} type="button" className="palette-trigger" aria-expanded={open} aria-controls="fleet-palette-options" aria-label={`Fleet palette, ${current.label}`} onClick={() => setOpen((value) => !value)}><span className="palette-swatch" style={{ backgroundColor: current.color }} /><span>{current.label}</span><b aria-hidden="true">⌄</b></button>
    {open && <div id="fleet-palette-options" className="palette-popover" role="group" aria-label="Fleet palette">{PALETTES.map((palette) => <button key={palette.id} type="button" title={palette.label} aria-label={palette.label} aria-pressed={selected === palette.id} onClick={() => { onSelect(palette.id); setOpen(false); triggerRef.current?.focus(); }}><span className="palette-swatch" style={{ backgroundColor: palette.color }} /></button>)}</div>}
  </div></fieldset>;
}

function accountAvatar(account: AccountView) {
  return account.avatarUrl ? <img src={account.avatarUrl} alt="" /> : <span>{account.displayName.slice(0, 2).toUpperCase()}</span>;
}

function FleetReveal({ label, fleet, assets }: { label: string; fleet: FleetView; assets: Record<string, ArtCatalogEntry> }) {
  const portrait = fleet.identity.commanderAssetId ? assets[fleet.identity.commanderAssetId] : undefined;
  return <article>{portrait && <img src={portrait.thumbnailSrc} alt="" />}<EmblemMark id={fleet.identity.emblemId} /><div><small>{label}</small><strong>{fleet.name}</strong><span>{fleet.compositionModule?.replaceAll("-", " ")} · W{fleet.weight}</span></div></article>;
}

function ArtPicker({ kind, selected, onSelect, onClose }: { kind: ArtKind; selected: string | null; onSelect: (asset: ArtCatalogEntry) => void; onClose: () => void }) {
  const [page, setPage] = useState<ArtCatalogPage | null>(null);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const load = async (offset = 0, filterQuery = filter) => {
    setBusy(true);
    try {
      const next = await json<ArtCatalogPage>(`/api/art/catalog?kind=${kind}&q=${encodeURIComponent(filterQuery)}&offset=${offset}&limit=40`);
      setPage(next);
    } finally { setBusy(false); }
  };
  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setFilter(""); setPage(null); void load(0, "");
    return () => { document.body.style.overflow = previousBodyOverflow; returnFocus.current?.focus(); };
  }, [kind]);
  useLayoutEffect(() => { if (resultsRef.current) resultsRef.current.scrollTop = 0; }, [page]);
  const manageDialogKeys = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
    if (event.key !== "Tab") return;
    const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled):not([aria-disabled="true"]),input:not(:disabled),select:not(:disabled),a[href]') ?? [])];
    if (!controls.length) return;
    const first = controls[0]; const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  const pageNumber = page ? Math.floor(page.offset / page.limit) + 1 : 1;
  const pageCount = Math.max(1, Math.ceil((page?.total ?? 0) / (page?.limit ?? 40)));
  const firstItem = page && page.total > 0 ? page.offset + 1 : 0;
  const lastItem = page ? page.offset + page.items.length : 0;
  return <div className="hangar-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className="art-picker" role="dialog" aria-modal="true" aria-labelledby="art-picker-title" onKeyDown={manageDialogKeys}>
      <header><div><span>BASE CATALOG · {page?.total ?? 0} {kind.toUpperCase()} IMAGES</span><h2 id="art-picker-title">Choose {kind} art</h2></div><button autoFocus onClick={onClose}>Close</button></header>
      <div className="art-filters" role="group" aria-label={`${kind} art categories`}>{ART_FILTERS[kind].map((option) => <button key={option.label} type="button" aria-pressed={filter === option.query} aria-disabled={busy} onClick={() => { if (busy) return; setFilter(option.query); void load(0, option.query); }}>{option.label}</button>)}</div>
      <div ref={resultsRef} className="art-grid" role="region" aria-label={`${kind} art results`} aria-busy={busy} tabIndex={0}>{page?.items.map((asset, index) => <button key={asset.assetId} type="button" aria-label={`Choose ${kind} art option ${(page?.offset ?? 0) + index + 1}`} aria-pressed={selected === asset.assetId} className={selected === asset.assetId ? "selected" : ""} onClick={() => { onSelect(asset); onClose(); }}>
        <img src={asset.cardSrc} alt="" loading="lazy" />
      </button>)}{page && page.items.length === 0 && <p className="art-empty">No art is available in this category.</p>}</div>
      {page && <nav className="art-pagination" aria-label="Art catalog pages"><button type="button" aria-label="Previous page" aria-disabled={busy || page.offset === 0} onClick={() => { if (!busy && page.offset > 0) void load(Math.max(0, page.offset - page.limit), filter); }}>← Previous</button><span role="status" aria-live="polite">Page {pageNumber} of {pageCount} · {firstItem}–{lastItem} of {page.total}</span><button type="button" aria-label="Next page" aria-disabled={busy || page.nextOffset === null} onClick={() => { if (!busy && page.nextOffset !== null) void load(page.nextOffset, filter); }}>Next →</button></nav>}
    </section>
  </div>;
}

export function HumanReleaseApp() {
  const challengeId = new URLSearchParams(window.location.search).get("challenge");
  const [session, setSession] = useState<AuthSessionView | null>(null);
  const [fleets, setFleets] = useState<FleetView[]>([]);
  const [selectedFleetId, setSelectedFleetId] = useState<string | null>(null);
  const [draft, setDraft] = useState<FleetDraftInput>(starter);
  const [assets, setAssets] = useState<Record<string, ArtCatalogEntry>>({});
  const [picker, setPicker] = useState<{ kind: ArtKind; slotId?: string } | null>(null);
  const [challenge, setChallenge] = useState<FriendChallengeView | null>(null);
  const [operations, setOperations] = useState<FriendChallengeView[]>([]);
  const [createdLink, setCreatedLink] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [accountMenu, setAccountMenu] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deleteFleetOpen, setDeleteFleetOpen] = useState(false);

  const csrfHeaders: Record<string, string> = { "content-type": "application/json", ...(session?.csrfToken ? { "x-csrf-token": session.csrfToken } : {}) };
  const weight = draft.units.reduce((sum, unit) => sum + ATTENTION_V4_CHASSIS_WEIGHTS[unit.chassis], 0);
  const legal = weight === 6 && draft.units.length >= 3 && draft.units.filter((unit) => unit.chassis === "heavy").length <= 1 && draft.units.filter((unit) => unit.chassis === "scout").length <= 4;

  const rememberAssets = async (fleetList: FleetView[]) => {
    const ids = new Set<string>();
    for (const fleet of fleetList) {
      for (const unit of fleet.units) if (unit.artAssetId) ids.add(unit.artAssetId);
      if (fleet.identity.commanderAssetId) ids.add(fleet.identity.commanderAssetId);
      if (fleet.identity.battlefieldAssetId) ids.add(fleet.identity.battlefieldAssetId);
    }
    const loaded = await Promise.all([...ids].map((id) => json<ArtCatalogEntry>(`/api/art/catalog/${encodeURIComponent(id)}`).catch(() => null)));
    setAssets((current) => ({ ...current, ...Object.fromEntries(loaded.filter(Boolean).map((asset) => [asset!.assetId, asset!])) }));
  };

  const reloadFleets = async () => {
    const list = await json<FleetView[]>("/api/hangar/fleets"); setFleets(list); await rememberAssets(list); return list;
  };

  const reloadOperations = async () => {
    const list = await json<FriendChallengeView[]>("/api/battle-command/challenges"); setOperations(list); return list;
  };

  const showChallenge = async (next: FriendChallengeView) => {
    setChallenge(next);
    const revealed = [next.ownFleet, next.opponentFleet].filter((fleet): fleet is NonNullable<typeof fleet> => Boolean(fleet));
    if (revealed.length) await rememberAssets(revealed);
    return next;
  };

  useEffect(() => {
    void json<AuthSessionView>("/api/auth/session").then(async (next) => {
      setSession(next);
      if (!next.authenticated) return;
      await Promise.all([reloadFleets(), reloadOperations()]);
      if (challengeId) await showChallenge(await json<FriendChallengeView>(`/api/battle-command/challenges/${challengeId}`));
    }).catch((caught) => setError(caught instanceof Error ? caught.message : String(caught)));
  }, [challengeId]);

  const edit = (fleet: FleetView) => {
    setSelectedFleetId(fleet.fleetId); setDraft({ name: fleet.name, units: fleet.units, identity: fleet.identity });
  };

  const save = async () => {
    setBusy(true); setError("");
    try {
      const fleet = await json<FleetView>(selectedFleetId ? `/api/hangar/fleets/${selectedFleetId}` : "/api/hangar/fleets", { method: selectedFleetId ? "PATCH" : "POST", headers: csrfHeaders, body: JSON.stringify(draft) });
      const list = await reloadFleets(); edit(list.find((item) => item.fleetId === fleet.fleetId) ?? fleet);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); } finally { setBusy(false); }
  };

  const createChallenge = async () => {
    if (!selectedFleetId) return;
    setBusy(true); setError("");
    try {
      const next = await json<FriendChallengeView>("/api/battle-command/challenges", { method: "POST", headers: csrfHeaders, body: JSON.stringify({ fleetId: selectedFleetId }) });
      const link = new URL(next.joinPath, window.location.origin).toString(); setCreatedLink(link); setChallenge(next); await reloadOperations();
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); } finally { setBusy(false); }
  };

  const acceptChallenge = async () => {
    if (!challengeId || !selectedFleetId) return;
    setBusy(true); setError("");
    try { await showChallenge(await json<FriendChallengeView>(`/api/battle-command/challenges/${challengeId}/accept`, { method: "POST", headers: csrfHeaders, body: JSON.stringify({ fleetId: selectedFleetId }) })); await reloadOperations(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); } finally { setBusy(false); }
  };

  const signOut = async () => {
    setBusy(true); setError("");
    try {
      await json("/api/auth/logout", { method: "POST", headers: csrfHeaders, body: "{}" });
      setFleets([]); setSession({ schemaVersion: 1, authenticated: false, account: null, csrfToken: null });
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); } finally { setBusy(false); setAccountMenu(false); }
  };

  const deleteAccount = async () => {
    setBusy(true); setError("");
    try {
      await json("/api/account", { method: "DELETE", headers: csrfHeaders, body: "{}" });
      setFleets([]); setSession({ schemaVersion: 1, authenticated: false, account: null, csrfToken: null });
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); } finally { setBusy(false); setDeleteAccountOpen(false); setAccountMenu(false); }
  };

  const deleteFleet = async () => {
    if (!selectedFleetId) return;
    setBusy(true); setError("");
    try {
      await json(`/api/hangar/fleets/${selectedFleetId}`, { method: "DELETE", headers: csrfHeaders, body: "{}" });
      await reloadFleets(); setSelectedFleetId(null); setDraft({ ...starter, units: starter.units.map((unit) => ({ ...unit, slotId: crypto.randomUUID() })) });
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); } finally { setBusy(false); setDeleteFleetOpen(false); }
  };

  const choose = (asset: ArtCatalogEntry) => {
    setAssets((current) => ({ ...current, [asset.assetId]: asset }));
    if (picker?.kind === "unit" && picker.slotId) setDraft((current) => ({ ...current, units: current.units.map((unit) => unit.slotId === picker.slotId ? { ...unit, artAssetId: asset.assetId } : unit) }));
    else if (picker?.kind === "commander") setDraft((current) => ({ ...current, identity: { ...current.identity, commanderAssetId: asset.assetId } }));
    else if (picker?.kind === "battlefield") setDraft((current) => ({ ...current, identity: { ...current.identity, battlefieldAssetId: asset.assetId } }));
  };

  if (!session) return <main className="hangar-shell"><p>Opening hangar…</p></main>;
  if (!session.authenticated) {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    return <main className="hangar-shell hangar-signin"><section><span className="hangar-kicker">CONTEXT LANDSCAPE · HUMAN RELEASE</span><h1>Your fleet should look like yours.</h1><p>Sign in with Discord to build a persistent cloud hangar, choose from the base art catalog, and challenge a friend.</p><a className="hangar-primary" href={`/api/auth/discord/start?returnTo=${encodeURIComponent(returnTo)}`}>Continue with Discord</a><small>Discord supplies identity only. Context Landscape does not retain the provider access token.</small>{error && <p role="alert">{error}</p>}</section></main>;
  }

  const account = session.account!;
  const selectedFleet = fleets.find((fleet) => fleet.fleetId === selectedFleetId);
  const ownsOpenChallenge = challenge?.status === "open" && challenge.creator.accountId === account.accountId;
  return <main className={`hangar-shell palette-${draft.identity.paletteId}`}>
    <header className="hangar-header"><div><span className="hangar-kicker">CONTEXT LANDSCAPE · CLOUD HANGAR</span><h1>Fleet Builder</h1></div><nav><a href={appHref()}>Battle Command</a><a href={appHref("view=atlas")}>Evidence</a><div className="account-menu"><button className="account-chip" aria-haspopup="menu" aria-expanded={accountMenu} onClick={() => setAccountMenu((open) => !open)}>{accountAvatar(account)} {account.displayName}</button>{accountMenu && <div role="menu"><button role="menuitem" disabled={busy} onClick={() => void signOut()}>Sign out</button><button role="menuitem" className="delete-account" disabled={busy} onClick={() => setDeleteAccountOpen(true)}>Delete account</button></div>}</div></nav></header>
    {error && <div className="hangar-error" role="alert">{error}</div>}
    {challenge && <section className="challenge-banner"><div><span>{challenge.status === "accepted" ? "FLEETS LOCKED · IDENTITIES REVEALED" : challenge.status === "open" ? ownsOpenChallenge ? "FRIEND CHALLENGE CREATED" : "INCOMING FRIEND CHALLENGE" : `INVITATION ${challenge.status.toUpperCase()}`}</span><strong>{challenge.creator.displayName}{challenge.opponent ? ` vs ${challenge.opponent.displayName}` : challenge.status === "open" ? " is waiting" : " invitation closed"}</strong><small>{challenge.status === "accepted" ? "This operation is live, persistent, and has no turn clock." : challenge.status === "open" ? ownsOpenChallenge ? "Your locked fleet remains private until a friend locks theirs." : "Choose a ready fleet. Their composition and art remain hidden until you lock yours." : "This invitation can no longer be accepted. Start a new operation from a ready fleet."}</small>{challenge.status === "accepted" && challenge.ownFleet && challenge.opponentFleet && <div className="challenge-fleet-reveal"><FleetReveal label="Your fleet" fleet={challenge.ownFleet} assets={assets} /><FleetReveal label="Opponent" fleet={challenge.opponentFleet} assets={assets} /></div>}</div>{challenge.status === "open" && !ownsOpenChallenge ? <button className="hangar-primary" disabled={!selectedFleet || selectedFleet.status !== "ready" || busy} onClick={() => void acceptChallenge()}>Lock fleet and accept</button> : challenge.matchId ? <a className="hangar-primary" href={appHref(`friendBattle=${encodeURIComponent(challenge.matchId)}`)}>Enter battlefield</a> : null}</section>}
    {createdLink && <section className="share-card"><div><span>PRIVATE INVITATION</span><strong>Fleet locked. Send this link to one friend.</strong><code>{createdLink}</code></div><button onClick={() => void navigator.clipboard.writeText(createdLink)}>Copy link</button></section>}
    <section className="hangar-layout">
      <aside className="fleet-library"><header><div><span>CLOUD FLEETS</span><strong>{fleets.length}</strong></div><button onClick={() => { setSelectedFleetId(null); setDraft({ ...starter, name: `Fleet ${fleets.length + 1}`, units: starter.units.map((unit) => ({ ...unit, slotId: crypto.randomUUID() })) }); }}>New</button></header>
        <div>{fleets.map((fleet) => <button key={fleet.fleetId} className={selectedFleetId === fleet.fleetId ? "active" : ""} onClick={() => edit(fleet)}><strong>{fleet.name}</strong><span>{fleet.status.toUpperCase()} · W{fleet.weight}/6</span><small>{fleet.units.map((unit) => unit.chassis[0].toUpperCase()).join(" · ")}</small></button>)}{!fleets.length && <p>No cloud fleets yet. Your balanced draft is ready to personalize.</p>}</div>
        <section className="operation-library"><span>SAVED OPERATIONS</span>{operations.map((operation) => <a key={operation.challengeId} href={operation.matchId ? appHref(`friendBattle=${encodeURIComponent(operation.matchId)}`) : appHref(`challenge=${encodeURIComponent(operation.challengeId)}`)}><strong>{operation.opponent ? `${operation.creator.displayName} vs ${operation.opponent.displayName}` : "Private friend link"}</strong><small>{operation.status.toUpperCase()} · {operation.matchId ? "resume battle" : operation.status === "open" ? "copy or open invitation" : "closed invitation"}</small></a>)}{!operations.length && <p>No friend operations yet.</p>}</section>
      </aside>
      <section className="fleet-stage">
        <div className="fleet-stage-backdrop" style={draft.identity.battlefieldAssetId ? { backgroundImage: `linear-gradient(rgba(4,10,15,.38),rgba(4,10,15,.94)),url(${assets[draft.identity.battlefieldAssetId]?.battlefieldSrc ?? assets[draft.identity.battlefieldAssetId]?.cardSrc ?? ""})` } : undefined}>
          <div className="commander-card"><button onClick={() => setPicker({ kind: "commander" })}>{draft.identity.commanderAssetId && assets[draft.identity.commanderAssetId] ? <img src={assets[draft.identity.commanderAssetId].cardSrc} alt={assets[draft.identity.commanderAssetId].alt} /> : <span>Choose commander portrait</span>}</button><div><input aria-label="Fleet name" value={draft.name} maxLength={48} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /><div className="commander-identity"><EmblemMark id={draft.identity.emblemId} /><small>{emblemLabel(draft.identity.emblemId)} emblem · {paletteLabel(draft.identity.paletteId)}</small></div></div></div>
          <div className="unit-lineup">{draft.units.map((unit) => <article key={unit.slotId}><button className="unit-art-card" onClick={() => setPicker({ kind: "unit", slotId: unit.slotId })}>{unit.artAssetId && assets[unit.artAssetId] ? <img src={assets[unit.artAssetId].cardSrc} alt={assets[unit.artAssetId].alt} /> : <span>Choose any unit image</span>}<b>{unit.chassis.toUpperCase()} · W{ATTENTION_V4_CHASSIS_WEIGHTS[unit.chassis]}</b></button><select aria-label={`Chassis for unit ${unit.slotId}`} value={unit.chassis} onChange={(event) => setDraft((current) => ({ ...current, units: current.units.map((item) => item.slotId === unit.slotId ? { ...item, chassis: event.target.value as typeof item.chassis } : item) }))}><option value="scout">Scout · 1</option><option value="line">Line · 2</option><option value="heavy">Heavy · 3</option></select><button aria-label="Remove unit" onClick={() => setDraft((current) => ({ ...current, units: current.units.filter((item) => item.slotId !== unit.slotId) }))}>Remove</button></article>)}</div>
          <div className="add-unit"><span>Add chassis</span>{(["scout", "line", "heavy"] as const).map((chassis) => <button key={chassis} disabled={draft.units.length >= 5 || weight + ATTENTION_V4_CHASSIS_WEIGHTS[chassis] > 6 || (chassis === "heavy" && draft.units.some((unit) => unit.chassis === "heavy"))} onClick={() => setDraft((current) => ({ ...current, units: [...current.units, { slotId: crypto.randomUUID(), chassis, artAssetId: null }] }))}>+ {chassis}</button>)}</div>
        </div>
        <footer className="fleet-controls"><div className={`weight-meter ${legal ? "legal" : ""}`}><span>FLEET WEIGHT</span><strong>{weight} / 6</strong><i style={{ width: `${Math.min(100, weight / 6 * 100)}%` }} /></div><PalettePicker selected={draft.identity.paletteId} onSelect={(paletteId) => setDraft((current) => ({ ...current, identity: { ...current.identity, paletteId } }))} /><fieldset className="identity-choice"><legend>Emblem</legend><div className="emblem-options" role="group" aria-label="Fleet emblem">{EMBLEMS.map((emblem) => <button key={emblem.id} type="button" title={emblem.label} aria-label={emblem.label} aria-pressed={draft.identity.emblemId === emblem.id} onClick={() => setDraft((current) => ({ ...current, identity: { ...current.identity, emblemId: emblem.id } }))}><EmblemMark id={emblem.id} /></button>)}</div><small>{emblemLabel(draft.identity.emblemId)} mark</small></fieldset><button onClick={() => setPicker({ kind: "battlefield" })}>Choose battlefield</button><button className="hangar-primary" disabled={busy || !draft.name.trim()} onClick={() => void save()}>{selectedFleetId ? "Save fleet" : "Create fleet"}</button>{selectedFleetId && <button className="delete-account" disabled={busy} onClick={() => setDeleteFleetOpen(true)}>Delete fleet</button>}<button disabled={!selectedFleet || selectedFleet.status !== "ready" || busy} onClick={() => void createChallenge()}>Challenge friend</button></footer>
        {!legal && <p className="fleet-rule-note">A ready fleet must total exactly 6 weight, contain 3–5 units, at most one Heavy, and at most four Scouts. Drafts remain saved safely.</p>}
      </section>
    </section>
    <footer className="catalog-provenance">Base catalog · all Context Landscape candidate tiers · external-franchise references excluded · census {ART_CENSUS_REPORT_HASH.slice(0, 23)}…</footer>
    {picker && <ArtPicker kind={picker.kind} selected={picker.kind === "unit" ? draft.units.find((unit) => unit.slotId === picker.slotId)?.artAssetId ?? null : picker.kind === "commander" ? draft.identity.commanderAssetId : draft.identity.battlefieldAssetId} onSelect={choose} onClose={() => setPicker(null)} />}
    {deleteFleetOpen && <div className="hangar-overlay" role="presentation"><section className="account-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-fleet-title"><span className="hangar-kicker">CLOUD FLEET</span><h2 id="delete-fleet-title">Delete {selectedFleet?.name ?? "this fleet"}?</h2><p>The saved fleet is removed from your Hangar. Already accepted battles retain their locked snapshot.</p><div><button autoFocus onClick={() => setDeleteFleetOpen(false)}>Keep fleet</button><button className="delete-account" disabled={busy} onClick={() => void deleteFleet()}>Delete fleet</button></div></section></div>}
    {deleteAccountOpen && <div className="hangar-overlay" role="presentation"><section className="account-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-account-title"><span className="hangar-kicker">PERMANENT ACTION</span><h2 id="delete-account-title">Delete your cloud hangar?</h2><p>This removes your account, saved fleets, active sessions, and open challenges. Existing battle records retain only their locked fleet snapshot.</p><div><button autoFocus onClick={() => setDeleteAccountOpen(false)}>Keep account</button><button className="delete-account" disabled={busy} onClick={() => void deleteAccount()}>Delete account</button></div></section></div>}
  </main>;
}
