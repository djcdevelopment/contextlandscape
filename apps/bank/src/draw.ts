import type { BriefingId, TierId } from "./schemas.js";

/** FNV-1a 32-bit, matching the constants the engine already uses for its replay hashes. */
export function fnv1a(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function fnv1aHex(text: string): string {
  return `fnv1a:${fnv1a(text).toString(16).padStart(8, "0")}`;
}

export type DrawKey = {
  seed: number;
  matchId: string;
  slot: number;
  mechId: string;
  problemId: string;
  tierId: TierId;
  briefingId: BriefingId;
};

/**
 * Selects which pre-computed attempt a mech gets. This is the whole reason the bank exists: live
 * inference would be nondeterministic and destroy replay, whereas a seeded draw over recorded real
 * attempts is reproducible and free at match time.
 *
 * `briefingId` is part of the key on purpose — re-briefing a mech moves it to a different pool, so
 * the in-game "spend attention to improve future attempts" mechanic falls straight out of the
 * addressing scheme rather than needing rules of its own.
 */
export function drawAttemptIndex(key: DrawKey, available: number): number {
  if (available <= 0) throw new Error(`no_attempts_available:${key.problemId}:${key.tierId}:${key.briefingId}`);
  const token = `${key.seed}:${key.matchId}:${key.slot}:${key.mechId}:${key.problemId}:${key.tierId}:${key.briefingId}`;
  return fnv1a(token) % available;
}
