# Reference patterns for the board

The purpose of this study is to extract ways of making decisions understandable. The proposed applications below are design inferences for Context Landscape. They are not claims that copying a layout will reproduce another game's depth.

Reviewed 2026-09-06. Start with the [ontology and impact map](ontology-and-impact.md); the [board brief](board-brief.md) applies these patterns to v4.4, including its action-only range cost and mech-only Smoke.

## Foundations

### P01 — Design from the experience back to the rules

The MDA framework connects mechanics, the behavior that emerges during play, and the player's experience. It explicitly encourages looking from both the designer's and player's perspectives. [Hunicke, LeBlanc and Zubek, *MDA*, pp. 1–3](https://users.cs.northwestern.edu/~hunicke/MDA.pdf)

**Application:** start with “I overproduced, protected the wrong work, and lost my room to react.” Trace that experience through W02/W04, D01, attention costs and T07/T08. A better Progress meter cannot create a viable Progress strategy if the mechanics do not support it. The map documents that boundary as G08.

**Limit:** this framework organizes reasoning; it does not select a winning layout or establish fun without observing players.

### P02 — Support intention and visible consequences

Doug Church describes players making their own plans from understandable options, and being able to perceive the world's response to their actions. He also discusses how statistical outcomes can make the connection harder to read. [Church, *Formal Abstract Design Tools*, “Mario 64 Game Play” and “Using Multiple Tools”](https://www.gamedeveloper.com/design/formal-abstract-design-tools)

**Application:** every selected action answers “what changes, where, when, at what cost, and what remains uncertain?” Use one preview grammar across K05 range changes, D03 verification, D04 battery commitment and A02 Smoke. Resolution should reconnect the outcome with the decision.

**Limit:** a preview can explain causal rules without promising hidden soundness or an opponent's simultaneous order.

## Comparative study

“Observed” describes the source. “Transfer” and “boundary” are our proposed adaptation. Citations include the exact rule or visual region inspected so later reviewers can reproduce the comparison.

| Pattern / reference | Observed organization | Transfer to this board | Boundary |
| --- | --- | --- | --- |
| P03 — Risk 2210 base: independent resource tracks | Setup separates the main board, Moon and Score Chart; energy is a visible resource with uses beyond army placement. The manual describes energy management as equally important to troop management. [Official manual, pp. 3–5](https://risk2210.net/resources/Risk_2210_AD_Manual.pdf#page=4) | Give attention, open work and batteries stable places alongside the mech roster. The player should see the support economy without selecting every mech. | Geography/territory ownership is not our scoring model. An artifact's stored eligibility cannot be replaced with “it is in today's front.” |
| P04 — Tech Commander: recurring and timed modifiers | The original Tech season is documented in the Frontline scan; the archived card list labels cost/timing and includes a persistent command-card cost reduction. [Original report, PDF p. 2](https://risk2210.net/resources/Risk2210AD_Frontline_Rules.pdf#page=2); [card archive](https://risk2210.net/expansions/tech-commander) | Show the cause of a discount: “Verify 1 − Battery B1 1 = 0.” Persistent benefits deserve visible state and recipient links. | The archived card layouts are community reproductions. Do not import their artwork, exact rules or a new passive ability. |
| P05 — Mars: geography exposes exceptions | The original module adds neutral territory and two moons; its rules specify a particular connection between moons and map-based exceptions. [Official Frontline scan, PDF p. 1](https://risk2210.net/resources/Risk2210AD_Frontline_Rules.pdf#page=1) | Draw legal reach and exceptional connections directly: Support Scan links must differ from local Verify adjacency. | Our map remains a 10×10 Chebyshev grid. No new terrain, continents or planetary subboards are implied. |
| P06 — Factions: a personal reference surface | Original faction rules introduce playmats and different starting commanders, energy and cards. [Official Frontline scan, PDF pp. 3–4](https://risk2210.net/resources/Risk2210AD_Frontline_Rules.pdf#page=3) | Keep each mech's capabilities in a compact consistent “mat”: UAP, reactor, range, calibration and its special action. Explain exceptions at the point of choice. | Chassis differences already exist; new factions or starting powers are outside this brief. The fan site's faction bundle mixes official and homebrew cards. |
| P07 — Giant Amoebas: pressure has an explicit trigger | The module introduces a separate invasion deck and counters, with a draw before resource collection and specific effects on territory benefits. [Official Frontline scan, PDF pp. 5–6](https://risk2210.net/resources/Risk2210AD_Frontline_Rules.pdf#page=5) | Represent an automatic hazard as an identified object, trigger and consequence: “A1, due at Resolution, +2 Drift, freezes LN/HV.” | Our aging/traffic hazard is deterministic given unchanged state. Do not present it as a random event draw. |
| P08 — Capitals/Homefront: infrastructure supports units | This fan expansion gives capitals their own pieces and connects commanders and defensive benefits to them. [Creators' rules and attribution](https://risk2210.net/expansions/capitals) | A battery should read as an infrastructure piece whose value includes what it supports. Selecting it highlights beneficiaries and what disappears if it is committed. | A battery is an artifact state, not a new invulnerable capital or an extra victory condition. |
| P09 — Galaxy Commander: network-aware abilities | This fan design ties interplanetary commands to stations and multi-map access, with explicit card costs and timing. [Creator-attributed rules](https://risk2210.net/expansions/galaxy-commander) | A useful modifier connects a source and recipients. Visual links can teach range, remote inspection and dependencies better than an isolated buff icon. | Do not add interplanetary movement or persistent dependency rules that the engine lacks. |
| P10 — Spirit Island: consistent power anatomy | The official rulebook places cost, speed, range, target and effects in recurring positions. Its annotated power diagram explains that range begins from Presence, with explicit exceptions. [Publisher's rules link](https://shop.greaterthangames.com/products/spirit-island); [official PDF, p. 16](https://www.dropbox.com/scl/fi/5wzghwnbsi39msyy6vvox/Spirit-Island-CORE-Rulebook.pdf?dl=0&rlkey=86i7aofqbzhulezjr7z0ssyff&st=iqv6wpml) | Reuse one action card grammar. Distinguish reach origin, footprint, target type, timing and numeric effect; the same information order works on touch and desktop. | Our artillery targets any board center; it must not inherit a mech-origin range merely because other actions have one. |
| P11 — Into the Breach: preview-driven board clarity | Davis describes telegraphed attacks, deterministic player-turn planning, protection of infrastructure and UI constraints on iconography and weapon design. [Designer presentation, slides 13, 23–36](https://media.gdcvault.com/gdc2019/presentations/Into%20the%20Breach%20Postmortem%20Final.pdf) | Keep the board large, point at affected pieces, and show next consequences before commitment. Artifacts and batteries can carry stakes comparable to mechs. | Our hidden truth and simultaneous submissions survive. Transfer the clarity of consequence, not the premise that every next outcome is known. |
| P12 — Redundant information encoding | Game Accessibility Guidelines recommend communicating essential information through more than a fixed color. [Guideline and examples](https://gameaccessibilityguidelines.com/ensure-no-essential-information-is-conveyed-by-a-fixed-colour-alone/) | Pair color with silhouette, label and border: mech hexagon, artifact diamond, battery square; verified check, hazard warning and labeled Smoke footprint. Use the same nouns in accessible names. | The rendered wireframes establish a direction; contrast, touch and assistive-technology acceptance still require testing of the eventual UI. |

The current publisher confirms that the four official Frontline modules are Mars, Tech Commander, Factions and Invasion of the Giant Amoebas. This study uses their original rules/archive material and distinguishes the two fan designs above. [Renegade's Frontline announcement](https://renegadegamestudios.com/blog/the-risk-2210-ad-frontline-expansion-is-available-now/)

## The visual grammar to carry forward

These are design decisions for this project, inferred from the comparisons above.

| A player needs to know… | Board grammar | Mapped examples |
| --- | --- | --- |
| What can I act on? | Distinct selectable pieces, one selection shared by map and ledger, complete cell stack chooser | E02/E03/E04; G05; P08/P12 |
| What can I do now? | Phase-specific legal actions, readable reasons when unavailable, current actor | D03/D06/D07; T05; P02/P10 |
| What will this change? | Before → after, exact units, affected objects, timing, cost provenance | K05, A02, D04; P02/P04/P11 |
| What might still change it? | A short condition: plan conflict, hidden truth, same-salvo screen, future positioning | T02/T03, G01/G02; P02/P11 |
| What needs my attention? | Named deadline and consequence rather than an unexplained red badge | T07/T08; P07/P12 |
| What is doing useful work for me? | Field outline, beneficiary links, now/later split, source label on discount | E04, T06; P04/P08/P09 |
| What did I learn? | A brief causal recap with the option to connect that decision to W01–W08 | P01/P02 |

## What we intentionally keep for the player to decide

The player chooses priorities, takes risks, and evaluates opportunities. The interface exposes quantities, timing and relationships so those decisions can be deliberate. It does not select an optimal target or convert hidden truth into a false promise.

Three productive tensions remain visible:

1. **Output versus supervision:** the emitter can create more artifacts than the commander can inspect comfortably.
2. **Immediate progress versus reusable support:** a verified battery can remain useful while pending, and closing it can be valuable too.
3. **Preparation versus response:** UAP spent improving a signal is UAP unavailable for repositioning or support; new pressure may require changing the plan.

Those tensions explain why a production queue, a logistics network and a push-your-luck game are useful additional associations. They are hypotheses about comprehension, tested in the brief's five tasks, not new systems to add.

## Evidence coverage and omissions

The original Frontline PDF is an image scan. Pages 1–6 were rendered locally and inspected; its Tech material contains the season report, so the card archive supplies the modifier example. Spirit Island's publisher-linked 32-page PDF was inspected at its power anatomy on page 16. The cited source documents remain external; this package ships original wireframes, not copied game boards or card art.

This covers the named official modules and two targeted fan extensions, not every expansion listed on community sites. “2042” remains deferred following the user's choice. We have not claimed hands-on playtest evidence for these references, nor proved that a gamer recognizing the analogy has acquired professional skills.

The next design question is concrete: **can a new player explain why stabilizing or preserving a particular artifact helps them react next turn?** The board brief turns that question into inspectable scenes and a scored walkthrough.
