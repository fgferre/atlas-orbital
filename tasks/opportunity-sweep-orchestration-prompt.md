# Atlas Orbital — Opportunity Sweep: Orchestration Prompt (hardened v2)

_Authored 2026-06-16. A draft was adversarially red-teamed by a 5-lens critic panel and synthesized into this version. Designed to be turned into a multi-agent Workflow script by a coordinator agent. See changelog at the end for what the red-team hardened._

---

```text
ORCHESTRATION PROMPT — "Atlas Orbital: Next-Level Opportunity Sweep" (hardened v2)
FOR: a coordinator agent driving a multi-agent Workflow harness (parallel() fan-out, pipeline()
per-item stages, barrier joins, loop-until-dry, structured agent outputs). The coordinator AUTHORS a
Workflow script from this spec and runs all caps/gates/reduces as deterministic COORDINATOR CODE; it
does NOT do the reading itself — agents do.

=== COORDINATOR ROLE & GOAL ===
Orchestrate a swarm to discover HIGH-IMPACT opportunities (new features + UX/UI/QA leaps) that move
Atlas Orbital to a premium, next-level teaching standard. Agents do all file-reading and return
structured data; the coordinator routes, validates, scores, and synthesizes. Every cap and gate below
is machine-checkable coordinator code, not an agent judgment, unless explicitly marked "(agent)".

=== PRODUCT NORTH STAR (the rubric every agent scores against) ===
Browser-based didactic solar-system + real-starfield explorer (React 19, R3F, Zustand, Tailwind).
Desktop AND mobile browsers; bilingual (en + pt-BR). Visual target ~ Gaia Sky, but this is a
TEACHING/EXPLORATION tool, not a AAA game. "Premium" = clarity, wonder, trust — not max shader count.

Four value axes (an opportunity must raise at least one):
- USEFUL — enables a learning/exploration task that was impossible or painful before.
- UNDERSTANDABLE — removes a named learner misconception or makes a phenomenon legible.
- BEAUTIFUL — makes a phenomenon CLEARER or evokes WONDER that motivates learning (legible color,
  readable labels, a scale comparison that lands, a transition that reveals structure). NOT spectacle,
  post-processing density, or Gaia-parity-for-parity. A beautiful feature must answer: what does a
  learner UNDERSTAND or FEEL afterward that they did not before? Beauty with no learning/wonder payload
  scores 0 on this axis.
- TRUSTWORTHY — see HONEST DATA vs HONEST SCALE below.

HONEST DATA & PHYSICS: positions, magnitudes, distances, spectral types, and orbital elements come from
real catalogs (HYG) and analytical ephemerides (VSOP87D, ELP/MPP02-trunc, Kepler) — never invented or
randomized. SCALE IS DELIBERATELY NON-LINEAR for visibility (star pseudo-size has NO physical meaning;
planet/sun radii are exaggerated). This is correct pedagogy and is NOT "faking." The honesty test:
can a learner TRUST every number/label the app states as a real measured fact? An opportunity violates
honesty ONLY if it (a) invents/fabricates a data value, (b) presents an exaggeration as true scale
without disclosure, or (c) removes a disclosure the app already makes. A feature that EXPOSES the
exaggeration (true-scale toggle, "radii not to scale" note, source/accuracy citation) SCORES POSITIVE
on honesty.

WONDER (admissible, teaching kind) is admissible ONLY if it is (a) triggered by a real datum the user
can interrogate (a real star's real color/distance), not a synthesized effect, AND (b) survives the
screenshot test — a reviewer can point at a current-build screenshot and name what is missing.
Spectacle wonder (looks amazing, teaches nothing, hides no real data) scores 0.

=== OUT OF IDENTITY (do-not-propose; auto-refute on sight — injected into EVERY discovery agent) ===
- Multiplayer / social feeds. Accounts / login / gamification (badges, XP, streaks). Real-money / store.
- AAA render features whose ONLY justification is visual impressiveness (volumetric galaxy fog, lens
  flares for their own sake) with no teaching payload.
- Anything requiring data we have no real source for (invented orbits, fabricated exoplanet stats).
- Native-app, VR, or AR ports (we are a browser tool). Re-skinning working subsystems for fashion.
A discovery agent that emits an OUT-OF-IDENTITY candidate has its candidate dropped at the PHASE 1
fan-in; the coordinator logs it to FINAL.doNotBuild[] (title + one-line why) so the owner sees the
deliberate NOs, not just the YESes.

=== GROUNDING CONTRACT (injected into EVERY agent) ===
1. READ before proposing; every factual claim cites file:line, validated against the PHASE 0 digest.
2. Never invent APIs/components/shaders/data. Greenfield is NEUTRAL, not positive — a clean prior-art
   result means the work is REAL, not that it is WORTH doing; it must still clear the cost veto and the
   learner-value test independently. Novelty NEVER offsets cost.
3. Before proposing, run a prior-art search; if it already exists or is partially built, the work is
   "finish/expose", not "build". Bare "greenfield" is FORBIDDEN — see priorArtSearched in CANDIDATE.
4. Reuse existing systems; never stack a parallel one. Known systems are enumerated in the PHASE 0
   REALITY DIGEST (below) — cite a digest entry's file:line or supply your own file:line proof.
5. No effect-stacking: in src/components/canvas/scene/PostProcessingPipeline.tsx effects compose in a
   fixed sequence. A proposal must NOT (a) duplicate an existing pass, (b) break sequence order, or
   (c) add >1 new pass in one opportunity. A new distinct effect is allowed; an extra bloom pass for a
   specific body is stacking → frame it as finish/expose, not a new feature.
RATIONALE (cite to coordinator): tasks/lessons.md M5 — broad-scope audits produce CONFIDENT FABRICATED
file:line that pass review. The PHASE 1 validation gate (below) is the topological enforcement of this
contract; injecting it as prose alone is insufficient.

=== PHASE 0 REALITY DIGEST (pre-seeded ground truth; merged with RECON output; injected into EVERY agent) ===
Treat this as authoritative. Any candidate citing a system NOT here must supply its own file:line.
Counts below are verified at spec-authoring time; RECON refreshes them.
- orbital salience/fade: src/components/canvas/planet/useOrbitalSalience.ts — declutter/priority system.
- qualityProfile tiers: src/lib/qualityProfile.ts (ResolvedQualityProfile: antialias, dprMax,
  shadowMapSize, environmentResolution, bloomEnabled, …).
- deferredTextureCache: src/lib/deferredTextureCache.ts + src/hooks/useDeferredTexture.ts.
- texture variants: src/lib/textureVariants.ts — ~97 texture files on disk; WebP siblings exist for
  ONLY 3 basenames (4k_oberon, 8k_mercury, 8k_moon) at WEBP_AVAILABLE_BASENAMES (~3% coverage). ROI of
  "WebP everything" is bandwidth/parse, NOT render; refuter ii cites diminishing ROI on bulk conversion.
- anisotropic filtering: Three.js default Texture.anisotropy=1 (off); Atlas does not override. Status:
  intentionally not exposed (filter cost vs didactic value); proposals are finish/expose, not "missing".
- i18next: src/i18n/index.ts initialized globally; ONLY consumer is HygStarPanel.tsx. All other UI is
  hardcoded English. Status: partial setup, localization deferred. "Localize all UI" = ~40+ files +
  pt-BR strings — size accordingly; do not score as free.
- ErrorBoundary: src/components/utils/ErrorBoundary.tsx, mounted ONLY in Planet.tsx (per-body granule,
  isolates planet-load failures). Do NOT propose promoting it to the App shell — that would silently
  hide Scene/Overlay init errors. App-shell error handling is a DIFFERENT opportunity if proposed.
- simulationClock: src/lib/simulationClock.ts (singleton, read-only at frame time; supports
  fast-forward/backward + speed) — mature time control exists; there is NO event/search layer over it.
- Timeline UI: src/components/ui/Timeline.tsx (epoch selection). TutorialOverlay:
  src/components/ui/TutorialOverlay.tsx (10+ steps, no curriculum/objective tree). SearchBar:
  src/components/ui/SearchBar.tsx (body-name autocomplete only; no multi-dim filter/serendipity).
- info panels: src/components/ui/HygStarPanel.tsx (panel template); Wikipedia client under
  src/lib/wikipedia/ (read-only external-info pattern; the canonical external-API precedent).
- primitives: src/components/ui/primitives/ contains ONLY Slider.tsx + Accordion.tsx.
- surfaceMode: src/lib/camera/surfaceMode.ts + SurfaceModeFirstPerson.tsx (first-person on-surface mode).
- camera/framing: src/lib/camera/ (motion system); CameraController.tsx supports mouse + scroll; no
  gesture/gamepad/VR code. effectiveViewport.ts holds framing state.
- accessibility: src/components/ui/A11yPanel.tsx (UI scale, reduced motion, colorblind; High-Contrast +
  Colorblind deferred to Wave 4; NO audio/voice).
- shading honesty guardrail: Fresnel is used ONLY in Sun rendering
  (src/components/canvas/shaders/proceduralSunShaders.ts). Planet atmospheres use Rayleigh + Henyey-
  Greenstein Mie scattering (src/components/canvas/shaders/atmosphereMath.ts). Do NOT conflate or
  "unify" them — different purposes; a "unify scattering models" proposal is a duplication trap.
- accuracy validation: src/lib/orbital/regression.test.ts validates positions against JPL Horizons
  (tolerance suite). Learners currently see NO source citation / accuracy bound — a real transparency gap.
- persistence: store persists to localStorage (src/store.persistMigration.ts); there is NO URL-state
  serialization layer (no shareable links).

=== TOPOLOGY ===
PHASE 0 — RECON (parallel Explore agents, ~4 by subsystem area): emit the live REALITY DIGEST —
  real file paths, public APIs, what already exists, and a FILE MANIFEST (every src path + line counts)
  the coordinator uses to validate citations. Merge with the pre-seeded digest above. BARRIER: all
  discovery agents receive the merged digest. RECON also emits the CONTROLLED AREA VOCABULARY (the list
  of subsystem ids) that becomes the only legal value for CANDIDATE.area.

PHASE 1 — DISCOVERY FAN-OUT (parallel, one agent per LENS, each BLIND to the others for diverse
  coverage). Each lens returns 4–8 candidates (CANDIDATE schema). Lenses:
   (a) New Features  (b) UX & Interaction  (c) UI & Design  (d) QA & Verification
   (e) Mobile/Touch & Alternative Input (gesture parity, touch hit-targets, landscape; note-only:
       gamepad/VR are out-of-identity unless they carry a teaching payload)
   (f) Accessibility (incl. a brief audio/TTS-narration sub-probe; do NOT expand into full voice-control)
   (g) Performance & perceived speed  (h) First-run / Onboarding
   (i) Data-trust, Scientific Transparency & Accuracy Communication (source citations, "validated vs
       JPL Horizons" notes, model-in-use toggle, true-scale disclosure, "stars frozen at epoch X" notes)
   (j) Guided Activity & Learning Pathways (self-paced narrative with checkpoints/objectives over the
       store + tutorial scaffold; multi-student/classroom admin is DEFERRED-architectural, route to lens l)
   (k) Shareability & Embeddability (URL-encode focusId/selectedId/speed/datetime/framing → reproducible
       link; PNG+metadata snapshot; LMS iframe embed; og:image preview)
   (l) Competitive (what Gaia Sky / Stellarium / Solar System Scope do that we lack — filtered through
       OUT-OF-IDENTITY; render-parity with no teaching payload is auto-refuted)
   (m) Astronomical Events & Phenomena Discovery (conjunction/opposition/retrograde finders, eclipse
       visibility, alignment explorer — grounded in simulationClock + Timeline + orbital/engine)
   (n) Content Discovery & Serendipity (multi-dim filter by type/magnitude/eccentricity/discovery-year,
       "surprise me", side-by-side comparison, bookmarks as a store extension)
  PHASE 1 FAN-IN GATE (coordinator code, before dedup):
   1. Validate every CANDIDATE.area ∈ CONTROLLED AREA VOCABULARY; repair-or-drop unknown areas.
   2. Validate every non-greenfield evidence{file,line}: file exists AND line ∈ range per the FILE
      MANIFEST. Failures → "repair-or-drop" bucket. (Enforces the GROUNDING CONTRACT; rationale lessons
      M5.) Bare priorArtSearched.relationship=NONE without searchedFor[] terms is also a drop.
   3. Drop OUT-OF-IDENTITY candidates → FINAL.doNotBuild[].

PHASE 2 — DEDUP & CLUSTER (BARRIER; coordinator code). True fan-in join — needs all lens output.
  Cluster by (area, normalized-intent): lowercase+canonicalize intent, then group by area + keyword/
  embedding overlap. Merge rule: same (area, intent) AND same cited file(s) → duplicate, merge as
  alternatives under one canonical title; same (area, intent) but orthogonal approaches (e.g. "swipe to
  rotate" vs "pinch to zoom") → keep separate. Emit a CLUSTER record {opportunityId, mergedFrom[], area,
  intent, candidateApproaches[]} so double-counting is auditable. ASSIGN the stable opportunityId HERE
  (not in stage 1) and thread it through blueprint → panel → final.
  PRE-SCORE CUTOFF (coordinator code, between PHASE 2 and 3): rank the canonical set by preScore =
  impact / effortWeight (from CANDIDATE; effortWeight S=1,M=2,L=4,XL=8). Admit only the TOP K=15 into the
  expensive pipeline; park the rest in FINAL.parked[] with no per-item agent spend.

PHASE 3 — WORTH-IT PIPELINE (pipeline per admitted opportunity; barrier-less WITHIN an item; concurrency
  cap P=6 items in flight). NO stage re-reads a file already cited upstream — it consumes the upstream
  record.
   stage 1 (agent) = author BLUEPRINT grounded in the digest (consumes CANDIDATE.evidence[], does not
     re-derive it).
   stage 2 = adversarial verify PANEL, 3 refuters in parallel, each prompted to REFUTE, each keyed to
     oppId, each defaulting to refuted ON UNCERTAINTY **for the veto refuters only** (see below):
       (i) EXISTS — already-exists/reuse refuter. Re-runs priorArtSearched against the digest. VETO.
       (ii) COST — mobile + perf + maintenance refuter. ADVISORY + UNILATERAL COST GATE (see kill rule).
       (iii) BRAND/HONEST — on-brand + data-honesty refuter. VETO.
     Plus a mandatory sub-question folded into refuter ii: LEARNER VALUE — "would a first-time 14-year-old
     learner notice or benefit; if the only beneficiary is a graphics/test connoisseur, this is a cost
     refute." A proposal whose primary justification is render fidelity, shader sophistication, or test-
     infra elegance MUST cite a SPECIFIC learner misconception it removes or a SPECIFIC wonder moment a
     screenshot proves the build lacks; no learner-value citation ⇒ auto cost-refute.
   KILL RULE (coordinator-side reduce, grouped by oppId; assert exactly 3 verdicts with 3 distinct
   refuterRole values before deciding — else FAIL LOUD and re-run the panel; a missing/timed-out verdict
   NEVER silently reads as "not refuted"):
     • EXISTS (i) and BRAND/HONEST (iii) are VETOES — a single confident refute from either KILLS the
       opportunity (protects the two identity-load-bearing properties: reuse and honesty). Uncertainty
       defaults to refuted on these two axes.
     • COST (ii) is a UNILATERAL COST GATE, not a vote: if effort is XL, OR perf/mobile/maintenance cost
       is judged to exceed perceivable learner value, OR the learner-value sub-question fails, the
       opportunity is REJECTED or AUTO-DOWNSCOPED to its named lazy-80% alternative — regardless of how
       wondrous (i)/(iii) find it. On COST, uncertainty attaches a risk flag + cheaper lazyAlternative,
       it does NOT auto-kill (avoids trivial-win bias that starves signature bets).
     • XL effort is auto-rejected unless it decomposes into an ≤M first slice delivering ≥70% of the
       learner value; the XL form is recorded as LATER (Deferred), NEVER Signature.
   INVERSION RULE (anti-gold-plating): a proposal's visual/technical impressiveness is evidence AGAINST
   it until learner value is independently demonstrated. The more impressive/shader-heavy, the higher the
   burden of proof on learner value. Novelty (a clean EXISTS check) contributes ZERO to keep.
  PHASE 3 FAN-IN CHECKPOINT: collect all survivors into ONE immutable survivor collection before PHASE 4
  reads it. Survivors from any round are IMMUTABLE and never re-paneled.

PHASE 4 — DUAL CRITIC + LOOP-UNTIL-DRY (operates over the immutable survivor collection):
  Two critics run per round:
   • COMPLETENESS critic (agent): fed the canonical-set KEYS only (area+intent), names specific
     UNCOVERED (area+intent) cells — output schema REQUIRES the named missing cell so dedup verifies
     novelty mechanically. ("Which of the lenses lack ≥1 surviving candidate?" is a useful seed.)
   • OVER-SCOPE critic (agent): re-examines every survivor; flags merge / downscope-to-lazy / cut. The
     completeness critic may NOT add an XL candidate without the over-scope critic stress-testing it
     against its lazy alternative in the same round.
  LOOP MECHANICS (coordinator code): new candidates → SAME PHASE 1 fan-in gate → SAME PHASE 2 dedup
  against the existing canonical set → admit TOP-K net-new → run THEIR pipeline → fan-in-merge into the
  survivor collection.
  DRY PREDICATE (deterministic): a round is "dry" when (net-new canonical candidates whose key is NOT
  already in the set) < 2 AND the over-scope critic returns no new downscope/cut. STOP when 2 consecutive
  rounds are dry. HARD CAPS (any one triggers immediate jump to PHASE 5): MAX 3 loop iterations total;
  cumulative discovery-agent count > BUDGET_MAX; wall-clock > T_MAX.

PHASE 4.5 — DEPENDENCY MAP (BARRIER; coordinator code): build the dependsOn/enables DAG over survivors
  from BLUEPRINT edges. Flag cycles and orphan high-ROI items blocked by low-ROI prerequisites.

PHASE 5 — SYNTHESIS & JUDGE PANEL:
  • Compute roiScore for every survivor AND for every survivor's lazy-80% alternative as a SEPARATE
    ranked row. A full version may enter NOW/NEXT ONLY if its roiScore beats its own lazy alternative by
    ≥1.5×; if the lazy alternative delivers ≥70% impact at ≤25% effort, the full version is auto-LATER and
    the lazy row is what ships.
  • Judge panel: N=3 parallel independent scorers, each writing {judgeId, candidateId, score, rationale,
    learnerQuestion, realDataHook} keyed by candidateId, over the 2–4 competing "signature" candidates.
    Assert N scores per candidate before aggregating. AGGREGATION (deterministic): mean score; NORMALIZE
    each judge's scores across candidates before the mean; ties break toward smaller effort, then higher
    trustworthiness (anti-gold-plating tie-break). REJECT any signature bet whose rationale names no
    learner question AND no real-data hook — wonder-as-spectacle is disqualifying, not a tiebreaker.
    Pick 1–3 signature bets with rationale + why they beat alternatives.
  • Build the ROADMAP on a single HORIZON axis (carry effort/signature as orthogonal tags):
     NOW   = high-ROI, no unmet deps, S/M effort.
     NEXT  = signature bets + their prerequisites, topologically sequenced per the DAG.
     LATER = deferred; EACH carries an explicit reactivation trigger (depends on X / needs data source Y /
             awaits user-smoke Z). Tag items [signature]/[quickwin]/[prereq] orthogonally.

=== AGENT OUTPUT SCHEMAS (coordinator passes JSON Schema; types are load-bearing) ===
RECON: { area, realFiles[], publicApis: [{ symbol, file, line, signature, kind }], alreadyExists[],
         fileManifest: [{ file, lineCount }], areaVocabulary[] }
CANDIDATE: { area (∈ areaVocabulary), lens, title, type: NEW_FEATURE|FINISH_EXPOSE|UX|UI|QA|FIX,
  evidence: [{ file, line, claim }],
  priorArtSearched: { searchedFor[], nearestExisting: "file:line"|"none found",
                      relationship: NONE|PARTIAL_EXISTS|FULLY_EXISTS },   // type=NEW_FEATURE requires
                                                                          // relationship=NONE + searchedFor[];
                                                                          // PARTIAL_EXISTS forces FINISH_EXPOSE
  userValue, sketchIdea,
  impact: 1-10 (LEARNER-VALUE ONLY, not visual wow — see anchors),
  effort: S|M|L|XL (see anchors),
  mobileViability: NATIVE|ADAPTABLE|DESKTOP_ONLY,
  i18nCost: NONE|STRINGS_ONLY|LAYOUT_REFLOW,
  lazyAlternative: { title, impact, effort } }
BLUEPRINT (stage 1): { opportunityId, title, conceptualBlueprint, codeSketch, perfTradeoffs,
  filesToTouch[], evidence[] (carried from CANDIDATE), dependsOn[], enables[], sharesSurface[],
  groundingVerified }
REFUTER VERDICT (stage 2): { oppId, refuterRole: EXISTS|COST|BRAND, refuted: bool, reason,
  learnerValueCited: bool, lazyAlternative }
SCORED (post-panel): { opportunityId, impact, effort, effortWeight, confidence, roiScore, scoreRationale,
  worthItVerdict, mobileViability, i18nCost }
FINAL: { ranked: [{ opportunityId, title, type, effort, roiScore, learnerValue, confidence, evidence[],
  lazyAlternative, mobileViability, i18nCost, worthItVerdict }],
  roadmap: { now[], next[], later[ {item, reactivationTrigger} ] },
  sequencedPlan[] (topo order; annotate where roiScore and dep order disagree), criticalPath,
  signatureBets: [{ opportunityId, learnerQuestion, realDataHook, whyBeatsAlternatives }],
  parked[], doNotBuild: [{ title, why }] }

=== SCORING (anchored; identical across all lenses so numbers are comparable) ===
impact = LEARNER VALUE ONLY:
  9-10 = removes a documented misconception OR enables a task currently impossible (e.g. pt-BR language
         selector — real gap per i18n digest entry; conjunction finder; source-citation panel).
  4-6  = meaningful polish a learner notices.
  1-3  = connoisseur-only nicety invisible to a learner (raymarched atmospheric entry, pixel-perfect
         test harness, force-directed label engine all score ≤3 here even if visually a "9").
effort:  S = <1 day, single file, no new dep.  M = 1-3 days, a few files.  L = ~a week, new subsystem.
  XL = multi-week + new infra/dep + perf risk (XL is a downscope-or-defer FLAG, not just a size).
effortWeight: S=1, M=2, L=4, XL=8.
confidence: grounding strength (evidence[] count + prior-art clarity).
roiScore = (learnerValue × confidence) / effortWeight, where learnerValue = MAX across the four identity
  axes for this opportunity. ANY XL with impact<7 is capped OUT of NOW/NEXT (Signature) tiers. Ties break
  toward smaller effort, then higher trustworthiness.

=== AGENT BUDGET (coordinator sizes concurrency + arms the kill-switch) ===
Worst-case agents = recon(4) + lenses(14) + K_pipeline×(1+3) + loops×(lens_subset + K_net×(1+3)) +
  judges(3). With K=15, loops≤3, P=6 concurrency: PHASE 3 spends ≤ K×(1+3) = 60 agents/round. Set
  BUDGET_MAX and T_MAX explicitly before running. Surface the RUNNING agent count to the coordinator as a
  live stop condition; exceeding BUDGET_MAX or T_MAX aborts the loop and jumps to PHASE 5. This is the
  single kill-switch against resource-exhaustion deadlock; all other caps reinforce it.

=== COORDINATOR ERROR HANDLING ===
- Agent returns <50% expected candidates (e.g. 2 of 8): log warning, proceed with partial results.
- Evidence field unparseable / 100% vague: mark those candidates low-confidence; downweight at PHASE 5.
- Panel returns ≠3 keyed verdicts or a duplicate refuterRole for an oppId: FAIL LOUD, re-run that panel
  on that oppId only (never decide on a partial tally).
- Judge panel returns <N scores for a candidate: re-run that candidate's panel before aggregating.

=== FINAL DELIVERABLE ===
Returned to the coordinator (executive synthesis): the ranked-by-roiScore table (type + effort +
mobileViability + i18nCost tagged), the NOW/NEXT/LATER roadmap with reactivation triggers, the
sequencedPlan + criticalPath, 1–3 signature bets (each with its learner question + real-data hook + why
it beats alternatives), and the doNotBuild[] + parked[] lists. Full per-opportunity blueprints saved to a
report file. Every survivor row carries evidence(file:line), roiScore (auditable inputs), and a named
lazy-80% alternative that competed against it in ranking.
```

---

## Changelog (red-team → synthesis)

- PHASE 3 kill rule rebuilt (lens 'gold-plating' HIGH + 'north-star' HIGH): replaced flat '<2 of 3 refute' with EXISTS+BRAND/HONEST as confident-refute VETOES and COST as a unilateral gate; novel on-brand XL features can no longer survive on a single cost refute.
- Added XL auto-reject-unless-decomposes-to-M-slice and 'XL never Signature' (gold-plating HIGH).
- Added INVERSION RULE: impressiveness is evidence AGAINST until learner value is demonstrated; render/shader/test-infra proposals must cite a specific misconception or screenshot-provable wonder gap (gold-plating HIGH).
- Folded a mandatory LEARNER-VALUE sub-question into refuter ii so the kill panel has a learner advocate (gold-plating MEDIUM) without adding a 4th agent.
- Made the lazy-80% alternative a SCORED competitor (separate ranked row; full version needs ≥1.5× its lazy alt, auto-LATER if lazy gives ≥70% at ≤25%) (gold-plating MEDIUM).
- Added OVER-SCOPE pruning critic alongside the completeness critic; loop ends only when BOTH are dry (gold-plating MEDIUM).
- Decoupled novelty from desirability: greenfield is NEUTRAL, EXISTS-clean contributes ZERO to keep (gold-plating MEDIUM + grounding).
- PHASE 4 dry condition made a deterministic coordinator predicate (net-new<2 via re-dedup) + hard caps: MAX 3 loops, BUDGET_MAX, T_MAX (topology HIGH + LOW).
- Threaded a stable opportunityId assigned at PHASE 2 through BLUEPRINT/REFUTER/SCORED/FINAL; panel reduce is oppId-keyed and asserts exactly 3 distinct refuterRoles or fails loud (topology HIGH race-safety).
- Added PRE-SCORE TOP-K=15 admission cutoff + concurrency cap P=6 between PHASE 2 and 3 to bound agent explosion; parked rest in FINAL.parked[] (topology HIGH).
- Constrained CANDIDATE.area to a controlled vocabulary emitted by RECON; PHASE 1 fan-in validates/repairs area + file:line against a FILE MANIFEST before dedup (topology HIGH + MEDIUM, lessons M5).
- Typed RECON.publicApis as {symbol,file,line,signature,kind}; expanded CANDIDATE.evidence to evidence[] carried into BLUEPRINT (no re-reads); defined SCORED + FINAL.ranked[] element shapes with roiScore (topology HIGH schema-sufficiency).
- Added explicit AGENT BUDGET section with worst-case formula + live running-count kill-switch (topology MEDIUM).
- Added PHASE 3 fan-in checkpoint + immutable survivor collection so the loop has a clean read/write boundary; survivors never re-paneled (topology MEDIUM).
- Added PHASE 1 deterministic citation-validation gate as topological enforcement of the grounding contract, citing lessons M5 (topology MEDIUM).
- Made judge panel N=3 parallel independent scorers with score normalization + deterministic mean aggregation + assert-N-before-aggregate (topology LOW).
- Split HONEST into HONEST DATA vs HONEST SCALE; exposing scale exaggeration scores POSITIVE; honesty refuter can no longer kill the whole app for pseudo-size (north-star HIGH, ties to feedback_pseudo_size memory).
- Added OUT-OF-IDENTITY do-not-propose block injected into every agent + FINAL.doNotBuild[] (north-star HIGH).
- Added dependency graph: dependsOn/enables/sharesSurface on BLUEPRINT, PHASE 4.5 DEPENDENCY MAP, sequencedPlan + criticalPath in FINAL (north-star HIGH).
- Anchored impact (learner-value only) and effort (S/M/L/XL with day/file/dep anchors) and DEFINED roiScore formula = (learnerValue×confidence)/effortWeight with XL<7 capped out of top tiers (gold-plating HIGH + north-star MEDIUM).
- Operationalized WONDER (real-datum + screenshot test) and BEAUTIFUL (teaching payload or scores 0); judge rejects spectacle-only signature bets (gold-plating HIGH + north-star MEDIUM).
- Added mobileViability + i18nCost as cross-cutting CANDIDATE fields enforced on all lenses; DESKTOP_ONLY without touch-equiv and strings without pt-BR plan are refute triggers (north-star MEDIUM).
- Forbade bare 'greenfield': priorArtSearched required; NEW_FEATURE needs relationship=NONE+searchedFor[], PARTIAL_EXISTS forces FINISH_EXPOSE (north-star MEDIUM + hallucination MEDIUM).
- Re-anchored roadmap tiers on a single HORIZON axis (NOW/NEXT/LATER) with reactivation triggers on every LATER item; effort/signature carried as tags (north-star LOW).
- Pre-seeded REALITY DIGEST with verified entries (texture ~97/3-WebP, i18n HygStarPanel-only, ErrorBoundary granule-not-shell, anisotropy intentionally-off, Fresnel-Sun-only vs Rayleigh+Mie atmosphere, no URL-state layer) (hallucination HIGH×2 + MEDIUM×5).
- Defined effect-stacking concretely against PostProcessingPipeline.tsx (grounding rule 5) (hallucination MEDIUM).
- Added coordinator error-handling clauses for malformed/partial agent output (hallucination MEDIUM).
- Expanded lens list to 14 by adding (i) Scientific Transparency, (j) Guided Activity, (k) Shareability/Embeddability, (m) Astronomical Events, (n) Content Discovery, and sharpening (e) Mobile/Alt-Input — folding audio/voice, live-data, VR/gamepad, and physics-fidelity findings into existing lenses instead of exploding the count (lens-coverage HIGH×4 + MEDIUM, scoped per budget caps).

## Deliberately rejected (kept the prompt sharp)

- Lens (q) 'Audio & Voice Accessibility' as a standalone lens (MEDIUM) — a full voice-control/Alexa lens on a browser teaching tool is itself lens-gold-plating and risks OUT-OF-IDENTITY native-assistant scope. Folded a narrow audio/TTS-narration sub-probe into the Accessibility lens (f) instead.
- Lens (o) 'Live Data & Discovery Feed' as a standalone lens (MEDIUM) — ISS/NEO/solar-flare feeds risk the honesty axis (freshness/availability) and pull toward content-treadmill scope; the highest-value piece (real-time positions over the existing simulationClock) is reachable via lens (m) Astronomical Events and lens (l) Competitive, both filtered by OUT-OF-IDENTITY. Avoided adding a lens whose best ideas duplicate existing lenses.
- Lens (r) 'Physics Fidelity & Teaching Clarity' as a standalone lens (LOW) — light-travel-time/relativistic/parallax modeling is near-textbook gold-plating for a 14-year-old's solar-system explorer; the genuinely useful part (disclosing simplified models, 'stars frozen at epoch X') is exactly the Scientific Transparency lens (i), where it now lives. A dedicated fidelity lens would generate impressive-but-≤3-impact candidates the gate then has to kill.
- VR/gamepad/hand-tracking sharpening of lens (e) (MEDIUM) — kept as an explicit note-only line; VR/AR/native ports are OUT-OF-IDENTITY for a browser tool, so promoting them to first-class search targets would manufacture candidates destined for doNotBuild[]. Gesture parity + touch hit-targets + landscape (the on-brand part) are retained in the lens.
- '>4 hours elapsed' as the loop emergency brake (LOW) — replaced with an abstract T_MAX rather than hardcoding hours, since wall-clock budget is a coordinator/harness sizing decision, not a spec constant; baking '4h' in would be a false-precision number the coordinator can't honor portably.
- Weighting refuter i HIGH / ii+iii MEDIUM as a generic majority-weight scheme (hallucination MEDIUM) — superseded by the stronger veto/cost-gate restructure from the gold-plating and north-star lenses, which is more precise than weighted-voting and avoids the ambiguity of summing fractional weights. Kept the spirit (asymmetric refuter authority) via the veto model.
