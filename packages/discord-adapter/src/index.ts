import type { Challenge, Reconstruction } from "@mech/contracts";

export type DiscordEmbed = {
  title: string;
  description: string;
  color: number;
  fields: Array<{ name: string; value: string; inline?: boolean }>;
};

/** Pure presentation boundary: Discord can notify players without owning match state. */
export function buildChallengeLaunchMessage(challenge: Challenge, publicBaseUrl: string): {
  content: string;
  embeds: DiscordEmbed[];
} {
  const joinUrl = `${publicBaseUrl.replace(/\/$/, "")}/mech/?challenge=${challenge.challengeId}`;
  return {
    content: `A Mech Commander challenge is ready: ${joinUrl}`,
    embeds: [{
      title: `Challenge · ${challenge.scenarioId}`,
      description: "Accept in the browser to join the canonical event-sourced match.",
      color: 0x49e6b5,
      fields: [
        { name: "Challenge", value: challenge.challengeId, inline: true },
        { name: "Status", value: challenge.status, inline: true },
        { name: "Expires", value: challenge.expiresAt, inline: true }
      ]
    }]
  };
}

export function buildResultEmbed(reconstruction: Reconstruction): DiscordEmbed {
  return {
    title: `Mission ${reconstruction.status}`,
    description: reconstruction.counterfactual.claim,
    color: reconstruction.status === "victory" ? 0x49e6b5 : 0xf36b7a,
    fields: [
      { name: "Actions", value: String(reconstruction.actionCount), inline: true },
      { name: "Rejected", value: String(reconstruction.rejectedCount), inline: true },
      { name: "Energy spent", value: String(reconstruction.commanderEnergySpent), inline: true },
      { name: "Artifacts", value: reconstruction.artifactsBuilt.join(", ") || "none", inline: false }
    ]
  };
}
