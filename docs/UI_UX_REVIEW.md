# UI/UX review and implementation

Reviewed September 6, 2026. Local UI: http://127.0.0.1:5173/landscape/.

The interface now uses one typography and color system across Battle Command, Fleet Hangar, the four evidence views, Commander Projection, and Research Scenarios. The work also fixes the confirmed draft, invitation, error recovery, keyboard dialog, routing, and viewport defects. This pass changes presentation and client interaction; the only server change is the destination URL for legacy scenario invitations.

## Visual system

Inter is bundled locally, including its license. The interface uses tabular numerals and weights 400, 600, and 700. Supporting text is regular weight; bold identifies a heading, decision, or value. Functional italics are removed. Monospace remains useful for coordinates, source IDs, and raw data, rather than carrying every heading.

| Role at standard scale | Treatment |
| --- | --- |
| Screen title | 28 px / 700; the illustrated briefing uses 32–48 px, and the compact battle header uses 20 px |
| Section headings and major resource totals | 20 px / 700 |
| Selected actions, calibration, important percentages | 16–18 px / 600 |
| Main instructions and hover explanations | 16 px / 400–600 |
| Supporting descriptions and secondary controls | 14 px / 400–600 |
| IDs, chart metadata, short section labels | 12 px / 400–600 |

The existing 90%, 100%, 115%, and 130% settings now persist across every runtime view. Navigation remains available on mobile and before sign-in. Touch scale controls retain a 40 px minimum target.

| Color | Job | Contrast on `#0B141D` |
| --- | --- | --- |
| `#DBE8EE` | Primary copy and absolute values | 14.83:1 |
| `#A6B8C4` | Supporting copy | 9.08:1 |
| `#8DA3B1` | Short metadata and inactive phase labels | 7.07:1 |
| `#66E4D4` | Selection, current phase, primary action | 12.03:1 |
| `#EFC96C` | Staged actions, pending resources, caution | 11.70:1 |
| `#FF786F` | Errors, serious risk, projected defeat | 7.22:1 |

These are computed token/background ratios, not a blanket accessibility certification. Actual hover and selected backgrounds were also checked in Chromium. Ordinary text should meet 4.5:1 under [WCAG contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

Absolute calibration is neutral. A change in calibration remains an explicit percentage-point delta in ability help. Drift at zero is neutral; 3/4 is caution; an actual or projected defeat is coral and has a written explanation. Fleet cosmetic palettes and quantitative research palettes keep their separate meanings. Availability lamps are quiet; reserved action counts remain gold.

## Confirmed problems fixed

| Priority | Before | Implemented behavior |
| --- | --- | --- |
| P1 | Challenge/Accept could lock an older saved fleet while a different draft was visible. | Saved/unsaved state is explicit. Both invitation actions require saving the current draft. Switching fleets, New, sign-out, and navigation protect unsaved changes. Browser unload protection covers refresh/close. |
| P1 | Authentication failure could remain on "Opening hangar..." indefinitely. | A readable error and read-only retry replace the spinner. Fleet drafts survive failed saves and refreshes. Retry never replays a mutation. |
| P1 | Expanded artifact details pushed the phase controls below the desktop viewport. | The battle workspace and inspector have bounded scrolling; the phase dock stays outside that scroll area. A misplaced screen-reader announcement is contained as well. |
| P1 | Delete dialogs let focus escape, and Escape did not close them. | Shared dialogs make the background inert, trap Tab/Shift+Tab, close with Escape, and restore the trigger. The art picker also recovers keyboard focus after a failed catalog request. |
| P1 | Old scenario invitation links opened the friend Hangar. | Existing `challenge_...` links dispatch to Research Scenarios; new legacy links include `view=legacy`. Friend `duel_...` invitations still open the Hangar. |
| P2 | Reopening an open invitation lost the Copy link action. | The link is derived from the invitation itself, with copied feedback and a selectable fallback when clipboard access fails. |
| P2 | Accepted fleet identities extended beyond the mobile viewport. | Both fleet identities stack inside the invitation card. |
| P2 | Hover/selected text and upcoming phases had weak contrast. | Those states use the shared supporting-copy colors; active evidence tabs use dark text on teal. |
| P2 | Research read failures had no recovery, and the mobile atlas contained excessive blank space. | Retry controls cover the atlas, its catalog, and the evidence landscapes. The overview scales to its aspect ratio on mobile; detailed fields scroll within their panels. |
| P2 | Interactive map markers lived inside an image-only accessibility role. | Interactive SVGs expose a group; Commander Field has a single tab stop for its selected cell and arrow navigation between cells. |

The dialog behavior follows the [WAI modal-dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/). Normal page content reflows vertically; spatial charts and wide exact-value tables keep their own scrolling regions, consistent with the distinctions in [W3C reflow guidance](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).

## Screen review

| Screen and states reviewed | Result |
| --- | --- |
| Briefing: fleet choice, start, navigation | Smaller title, clearer objective and fleet tradeoffs, readable descriptions, shared navigation including the Hangar. |
| Battle: Kinetic, staged/canceled actions, held units, frozen units, submitted friend orders | Primary decisions and staged counts separate visually. Existing UAP, Range, Condense, Step-Up, and Scan explanations remain tied to their underlined terms. The redundant selected-unit header stays removed. |
| Battle: Artillery, Capacity, Command, Resolution recap, terminal result | Phase controls remain reachable. New operation is secondary during play. Terminal results compare both players' Progress, Drift, and Attention. Event names read as words instead of dotted identifiers. |
| Artifacts: pending, hazardous, verified Battery, end-of-command risk | Density, effective calibration, age, traffic, and Battery state accompany confidence. The inspector explains the difference between reported confidence and revealed truth. Verify, Accept, Reject, Seize, and Perfect Focus explain costs, scoring, and Battery consequences. Hazard names identify the source artifact and show projected Drift and affected mech count. |
| Output allocation | Volume and Density have visible labels and term-level help. The equation explains reactor use and artifact calibration. After Emit, a receipt uses actual artifact birth metrics and links directly to inspection. Mechs awaiting output and pending artifacts have separate counts. Costs and limits come from the public rules and legal-action projection. |
| Hangar: signed out, empty, saved, dirty, open invitation, accepted invitation, art picker, deletion, failed reads/saves | One visual system, readable button links, explicit draft state, recoverable reads, usable clipboard fallback, mobile fleet reveal, and keyboard-safe dialogs. The image gallery remains visual and keeps every candidate tier. |
| Evidence Atlas | Readable map categories, an HTML elevation legend, consistent navigation, optional source metadata, and a more compact mobile overview. Normalization and missing-value markers are preserved. |
| Commander Field | Readable axes and legend outside the SVG, keyboard selection, explicit units, and win rate presented as a percentage. Exact values and source IDs remain available. |
| Artillery Relief | Package/supply labels, mechanism-rate units, readable uncertainty intervals, and source details remain distinct from the chart's visual encoding. |
| Desperation Theatre: aggregate and exemplar controls | Readable controls, coordinates, sample/denominator explanations, and a contained spatial board. Published values and trace limitations remain intact. |
| Commander Projection: strategic and operational | Shared chrome, readable Attention totals and controls, keyboard navigator retained, and a compact prototype/data-source disclosure. |
| Research Scenarios: selected unit/terrain, lab catalog, pre-review, reconstruction, final review, complete/export | Selection starts with a readable summary; raw JSON is optional. Forms, progress, action descriptions, and navigation share the visual system. Blinding, reconstruction, treatment reveal, and export workflows are preserved. |

## Before and after

These are browser captures, not mockups. Battle and account states use isolated fixtures; art and published research come from the local application. The earlier captures may use a different fixture selection or viewport, so compare hierarchy and behavior rather than individual outcome values.

| View | Before | After |
| --- | --- | --- |
| Briefing | [Before](ui-review/before/briefing.png) | [After](ui-review/after/briefing.png) |
| Kinetic | [Before](ui-review/before/kinetic.png) | [After](ui-review/after/kinetic.png) |
| Expanded Command inspector | [Before](ui-review/before/command.png) | [After](ui-review/after/command.png) |
| Fleet Hangar | [Before](ui-review/before/hangar-ready.png) | [After](ui-review/after/hangar-ready.png) |
| Accepted fleets on mobile | [Before](ui-review/before/hangar-accepted-mobile.png) | [After](ui-review/after/hangar-accepted-mobile.png) |
| Art picker | [Before](ui-review/before/hangar-art-picker.png) | [After](ui-review/after/hangar-art-picker.png) |
| Evidence Atlas | [Before](ui-review/before/atlas.png) | [After](ui-review/after/atlas.png) |
| Mobile atlas | [Before](ui-review/before/atlas-mobile.png) | [After](ui-review/after/atlas-mobile.png) |
| Commander Field | [Before](ui-review/before/commander-field.png) | [After](ui-review/after/commander-field.png) |
| Artillery Relief | [Before](ui-review/before/artillery-relief.png) | [After](ui-review/after/artillery-relief.png) |
| Desperation Theatre | [Before](ui-review/before/desperation.png) | [After](ui-review/after/desperation.png) |
| Operational projection | [Before](ui-review/before/commander-operational.png) | [After](ui-review/after/commander-operational.png) |
| Research Scenario | [Before](ui-review/before/legacy-scenario.png) | [After](ui-review/after/legacy-scenario.png) |
| Blinded pre-review | [Before](ui-review/before/legacy-awaiting_pre_review.png) | [After](ui-review/after/legacy-awaiting_pre_review.png) |

Additional captures cover [Battery support](ui-review/after/battery.png), [risk confirmation](ui-review/after/end-risk.png), [Condense help](ui-review/after/condense-help.png), [Capacity](ui-review/after/capacity.png), [terminal comparison](ui-review/after/terminal.png), [reconstruction review](ui-review/after/legacy-reconstruction_available.png), [final review](ui-review/after/legacy-awaiting_final_review.png), and [treatment reveal](ui-review/after/legacy-complete.png), and [a Desperation exemplar](ui-review/after/desperation-exemplar.png).

## Validation

- Web TypeScript check and production build pass; Inter is included in the built assets.
- Web component/navigation tests: **17 passed**.
- Server TypeScript check and tests: **31 passed**.
- Playwright: **38 passed**, with **10 intentional skips** for desktop-only matrix cases on tablet/mobile projects. Coverage includes the Battery/EMP/counterfire/reload/detonation journey, two isolated friend players, ordered-action cancellation, Resolution recap, dirty-draft protections, clipboard recovery, failed reads/saves, dialogs, and mobile layout.
- The browser capture audit covers **29 screen states × 5 viewport sizes × 4 interface scales = 580 layout states**. It checks horizontal page overflow everywhere and desktop battle height/dock placement. The viewport sizes are 2048×986, 1440×1000, 1366×768, 390×844, and 720×500. [Recorded geometry](ui-review/layout-audit.json).
- Browser axe checks cover eleven representative screens, including the Desperation exemplar mode, and include CSS color contrast; no violations were found in those checks. [Recorded results](ui-review/accessibility-audit.json).
- Additional interaction probes verified recovery after a 503 response in all four research views and arrow-key selection in Commander Field.
- The 720×500 case checks the CSS reflow produced by 200% zoom of a 1440×1000 viewport. This is a headless layout equivalent, not a claim that native Chrome zoom controls or Windows display scaling were exercised.

Run the read-only capture audit against the local development server:

```powershell
node --import tsx docs/ui-review/capture.mjs
```

It intercepts every API write; it does not create real matches, submit reviews, or alter saved fleets. `UI_REVIEW_SCENES` accepts comma-separated scene names for a targeted refresh. The script retains other scenes' recorded results when running a subset.

## Remaining design opportunities

These are follow-up experiments, separate from the confirmed defects fixed above.

1. **Let persistent context tell the story.** Try a compact backlog strip that emphasizes "safe to leave," "needs attention this round," and "Battery supporting two mechs." Keep the exact age, traffic, and percentage values one interaction away. Test whether a new player can explain the tradeoff without the work metaphor being explained first.
2. **Preview the marginal choice.** Extend the existing range/ability tables into a small before/after artifact forecast: reachable cells, density cap, effective-calibration delta, and remaining actions. Keep probabilities visibly distinct from guarantees.
3. **Reduce dense-chart effort.** Test an optional sortable table or search-driven selector alongside the 6,400-cell field. The current keyboard and exact-value paths work, but a new player still needs domain vocabulary to compare doctrines.
4. **Curate presentation separately from access.** Some battlefield candidates are utility strips or abstract assets. Keep the complete catalog available, with a future curated starting collection if playtests favor it.

This review used Chromium and controlled states. It does not certify every browser, native screen reader, operating-system zoom setting, OAuth provider outage, or possible game-state combination. Public deployment was not changed.
