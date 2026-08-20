import { z } from "zod";
import {
  ATTENTION_V4_CHASSIS_WEIGHTS,
  ATTENTION_V4_COMPOSITION_MODULES,
  ATTENTION_V4_FLEET_WEIGHT,
  AttentionV4ChassisSchema,
  AttentionV4FleetSchema,
  BattleCommandV3SubmissionSchema,
  BattleCommandV3ViewSchema
} from "./attention-v4.js";

export const HUMAN_RELEASE_SCHEMA_VERSION = 1 as const;
export const ART_CENSUS_REPORT_HASH = "sha256:928a78fd7f9a6adae62eead18553088aa4d360d338506bac0c73d529fd10369f" as const;

const IdSchema = z.string().min(1).max(160);
const DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const HttpPathSchema = z.string().startsWith("/").max(500);

export const AccountViewSchema = z.object({
  schemaVersion: z.literal(HUMAN_RELEASE_SCHEMA_VERSION),
  accountId: IdSchema,
  displayName: z.string().min(1).max(80),
  avatarUrl: z.string().url().nullable(),
  createdAt: z.string().datetime(),
  lastSeenAt: z.string().datetime()
}).strict();
export type AccountView = z.infer<typeof AccountViewSchema>;

export const AuthSessionViewSchema = z.discriminatedUnion("authenticated", [
  z.object({
    schemaVersion: z.literal(HUMAN_RELEASE_SCHEMA_VERSION),
    authenticated: z.literal(true),
    account: AccountViewSchema,
    csrfToken: z.string().min(20)
  }).strict(),
  z.object({
    schemaVersion: z.literal(HUMAN_RELEASE_SCHEMA_VERSION),
    authenticated: z.literal(false),
    account: z.null(),
    csrfToken: z.null()
  }).strict()
]);
export type AuthSessionView = z.infer<typeof AuthSessionViewSchema>;

export const ArtKindSchema = z.enum(["unit", "commander", "battlefield", "event"]);
export const ArtTierSchema = z.enum(["confirmed", "confirmed-derived", "explicit-project-raw", "project-texture-review", "visual-review"]);
export type ArtKind = z.infer<typeof ArtKindSchema>;
export type ArtTier = z.infer<typeof ArtTierSchema>;
export const ArtCatalogEntrySchema = z.object({
  schemaVersion: z.literal(HUMAN_RELEASE_SCHEMA_VERSION),
  assetId: IdSchema,
  familyId: IdSchema,
  contentHash: DigestSchema,
  tier: ArtTierSchema,
  kind: ArtKindSchema,
  title: z.string().min(1).max(180),
  alt: z.string().min(1).max(500),
  subjects: z.array(z.string().min(1).max(120)).max(12),
  aspect: z.enum(["portrait", "square", "landscape"]),
  focalPoint: z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) }).strict(),
  thumbnailSrc: HttpPathSchema,
  cardSrc: HttpPathSchema,
  battlefieldSrc: HttpPathSchema.nullable(),
  experimental: z.boolean()
}).strict();
export type ArtCatalogEntry = z.infer<typeof ArtCatalogEntrySchema>;

export const ArtCatalogPageSchema = z.object({
  schemaVersion: z.literal(HUMAN_RELEASE_SCHEMA_VERSION),
  catalogHash: DigestSchema,
  censusReportHash: z.literal(ART_CENSUS_REPORT_HASH),
  items: z.array(ArtCatalogEntrySchema),
  total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive().max(100),
  nextOffset: z.number().int().nonnegative().nullable()
}).strict();
export type ArtCatalogPage = z.infer<typeof ArtCatalogPageSchema>;

export const FleetUnitIdentitySchema = z.object({
  slotId: IdSchema,
  chassis: AttentionV4ChassisSchema,
  artAssetId: IdSchema.nullable()
}).strict();
export type FleetUnitIdentity = z.infer<typeof FleetUnitIdentitySchema>;

export const FleetIdentitySchema = z.object({
  commanderAssetId: IdSchema.nullable(),
  battlefieldAssetId: IdSchema.nullable(),
  paletteId: z.enum(["signal-teal", "warning-amber", "oxide-red", "furnace-violet", "night-blue"]),
  emblemId: z.enum(["aperture", "chevron", "orbit", "signal", "anvil"])
}).strict();
export type FleetIdentity = z.infer<typeof FleetIdentitySchema>;

export const FleetDraftInputSchema = z.object({
  name: z.string().trim().min(1).max(48),
  units: z.array(FleetUnitIdentitySchema).max(5),
  identity: FleetIdentitySchema
}).strict().superRefine((fleet, context) => {
  if (new Set(fleet.units.map((unit) => unit.slotId)).size !== fleet.units.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["units"], message: "unit slot IDs must be unique" });
  }
});
export type FleetDraftInput = z.infer<typeof FleetDraftInputSchema>;

export function compositionModuleForFleet(fleet: readonly z.infer<typeof AttentionV4ChassisSchema>[]): typeof ATTENTION_V4_COMPOSITION_MODULES[number] | null {
  const counts = {
    scout: fleet.filter((item) => item === "scout").length,
    line: fleet.filter((item) => item === "line").length,
    heavy: fleet.filter((item) => item === "heavy").length
  };
  if (counts.scout === 4 && counts.line === 1 && counts.heavy === 0) return "line-four-scout";
  if (counts.scout === 2 && counts.line === 2 && counts.heavy === 0) return "two-line-two-scout";
  if (counts.scout === 0 && counts.line === 3 && counts.heavy === 0) return "three-line";
  if (counts.scout === 3 && counts.line === 0 && counts.heavy === 1) return "heavy-three-scout";
  if (counts.scout === 1 && counts.line === 1 && counts.heavy === 1) return "heavy-line-scout";
  return null;
}

export const FleetViewSchema = z.object({
  schemaVersion: z.literal(HUMAN_RELEASE_SCHEMA_VERSION),
  fleetId: IdSchema,
  ownerAccountId: IdSchema,
  name: z.string().min(1).max(48),
  status: z.enum(["draft", "ready"]),
  weight: z.number().int().min(0).max(ATTENTION_V4_FLEET_WEIGHT),
  compositionModule: z.enum(ATTENTION_V4_COMPOSITION_MODULES).nullable(),
  units: z.array(FleetUnitIdentitySchema).max(5),
  identity: FleetIdentitySchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
}).strict();
export type FleetView = z.infer<typeof FleetViewSchema>;

export const ReadyFleetSnapshotSchema = FleetViewSchema.extend({
  status: z.literal("ready"),
  weight: z.literal(ATTENTION_V4_FLEET_WEIGHT),
  compositionModule: z.enum(ATTENTION_V4_COMPOSITION_MODULES),
  units: z.array(FleetUnitIdentitySchema).min(3).max(5),
  snapshotHash: DigestSchema
}).strict().superRefine((fleet, context) => {
  const chassis = fleet.units.map((unit) => unit.chassis);
  const parsed = AttentionV4FleetSchema.safeParse(chassis);
  if (!parsed.success) context.addIssue({ code: z.ZodIssueCode.custom, path: ["units"], message: "snapshot fleet is not legal" });
  if (compositionModuleForFleet(chassis) !== fleet.compositionModule) context.addIssue({ code: z.ZodIssueCode.custom, path: ["compositionModule"], message: "composition module does not match units" });
});
export type ReadyFleetSnapshot = z.infer<typeof ReadyFleetSnapshotSchema>;

export function fleetDraftWeight(fleet: FleetDraftInput): number {
  return fleet.units.reduce((sum, unit) => sum + ATTENTION_V4_CHASSIS_WEIGHTS[unit.chassis], 0);
}

export const FriendChallengeViewSchema = z.object({
  schemaVersion: z.literal(HUMAN_RELEASE_SCHEMA_VERSION),
  challengeId: IdSchema,
  creator: AccountViewSchema,
  opponent: AccountViewSchema.nullable(),
  status: z.enum(["open", "accepted", "expired", "cancelled"]),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  matchId: IdSchema.nullable(),
  joinPath: HttpPathSchema,
  ownFleet: ReadyFleetSnapshotSchema.nullable(),
  opponentFleet: ReadyFleetSnapshotSchema.nullable()
}).strict();
export type FriendChallengeView = z.infer<typeof FriendChallengeViewSchema>;

export const CreateFriendChallengeSchema = z.object({ fleetId: IdSchema }).strict();
export const AcceptFriendChallengeSchema = z.object({ fleetId: IdSchema }).strict();

export const BattleExperienceSchema = z.object({
  schemaVersion: z.literal(HUMAN_RELEASE_SCHEMA_VERSION),
  mode: z.enum(["practice-ai", "friend"]),
  status: z.enum(["active", "conceded"]),
  concededBy: z.enum(["alpha", "bravo"]).nullable(),
  winnerSeat: z.enum(["alpha", "bravo"]).nullable(),
  viewerSeat: z.enum(["alpha", "bravo"]),
  waitingFor: z.enum(["self", "opponent"]).nullable(),
  submitted: z.boolean(),
  fleets: z.object({ alpha: ReadyFleetSnapshotSchema.nullable(), bravo: ReadyFleetSnapshotSchema.nullable() }).strict(),
  accountSeats: z.object({ alpha: IdSchema.nullable(), bravo: IdSchema.nullable() }).strict()
}).strict();
export type BattleExperience = z.infer<typeof BattleExperienceSchema>;

export const FriendBattleCommandViewSchema = z.object({
  battle: BattleCommandV3ViewSchema,
  experience: BattleExperienceSchema
}).strict();
export type FriendBattleCommandView = z.infer<typeof FriendBattleCommandViewSchema>;

export const FriendBattleActionRequestSchema = z.object({
  revision: z.number().int().nonnegative(),
  submission: BattleCommandV3SubmissionSchema
}).strict();
export type FriendBattleActionRequest = z.infer<typeof FriendBattleActionRequestSchema>;
