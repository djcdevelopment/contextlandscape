export type GameArtAsset = {
  subjectId: string;
  aspect: "portrait" | "square" | "landscape";
  alt: string;
  focalPoint: `${number}% ${number}%`;
  crop: "cover" | "contain";
  src?: string;
};

// Stable semantic slots for the HD campaign. Curation only needs to add `src`;
// the battle UI remains fully usable with its intentional gradient fallbacks.
type GameArtSubject =
  | "mech-scout"
  | "mech-line"
  | "mech-siege"
  | "ability-overclock"
  | "ability-macro-flare"
  | "artillery-desperation-he"
  | "battlefield-context-furnace"
  | "battlefield-documentation-fortress"
  | "commander-adaptive-siege-anchor"
  | "commander-scout-mobile-focus";

export const gameArt: Record<GameArtSubject, GameArtAsset> = {
  "mech-scout": { subjectId: "mech-scout", aspect: "portrait", alt: "Three-legged Scout reconnaissance mech", focalPoint: "50% 42%", crop: "cover" },
  "mech-line": { subjectId: "mech-line", aspect: "portrait", alt: "Balanced Line support mech", focalPoint: "50% 42%", crop: "cover" },
  "mech-siege": { subjectId: "mech-siege", aspect: "portrait", alt: "Heavy Siege command mech", focalPoint: "50% 42%", crop: "cover" },
  "ability-overclock": { subjectId: "ability-overclock", aspect: "square", alt: "A mech routing an Overclock power surge", focalPoint: "50% 50%", crop: "cover" },
  "ability-macro-flare": { subjectId: "ability-macro-flare", aspect: "square", alt: "Bounded Macro Flare signal volume", focalPoint: "50% 50%", crop: "cover" },
  "artillery-desperation-he": { subjectId: "artillery-desperation-he", aspect: "landscape", alt: "Desperation HE resolving a dense artifact cluster", focalPoint: "50% 50%", crop: "cover" },
  "battlefield-context-furnace": { subjectId: "battlefield-context-furnace", aspect: "landscape", alt: "The Context Furnace battlefield", focalPoint: "52% 48%", crop: "cover" },
  "battlefield-documentation-fortress": { subjectId: "battlefield-documentation-fortress", aspect: "landscape", alt: "The Documentation Fortress battlefield", focalPoint: "50% 45%", crop: "cover" },
  "commander-adaptive-siege-anchor": { subjectId: "commander-adaptive-siege-anchor", aspect: "portrait", alt: "Adaptive Siege Anchor commander", focalPoint: "50% 35%", crop: "cover" },
  "commander-scout-mobile-focus": { subjectId: "commander-scout-mobile-focus", aspect: "portrait", alt: "Scout-Mobile Pioneer Focus commander", focalPoint: "50% 35%", crop: "cover" }
};

export type GameArtSubjectId = keyof typeof gameArt;
