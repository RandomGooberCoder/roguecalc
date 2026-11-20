# Ratwood stat calculator

A static, dependency-free website for GitHub Pages. Choose a race, job subclass, and statpack to compare unbuffed stats, Vigilant Guardsman stats, and Warden stats. Includes a contribution breakdown, job filtering, shareable build URLs, and links to the exact upstream source commit.

## Publish on GitHub Pages

1. Create a GitHub repository with `main` as its default branch.
2. Extract this project and upload its **contents** to the repository root. `index.html`, `data/`, `scripts/`, `tests/`, and `.github/` should be at the root; do not upload only the ZIP or wrap everything in another folder. Make sure the hidden `.github` directory is included.
3. Open **Settings > Pages**. Under **Build and deployment**, choose **GitHub Actions** as the source.
4. Open **Actions > Refresh data and deploy Pages > Run workflow**, select `main`, and run it. Future pushes to `main` deploy automatically.
5. When the workflow finishes, Settings > Pages and the workflow's deployment show your published URL.

The workflow reads `Rotwood-Vale/Ratwood-2.0`, branch `main`, extracts fresh stats, checks the calculator, and publishes only the static website. It checks upstream main every 15 minutes (at minutes 07, 22, 37, and 52), subject to GitHub scheduler delays. Scheduled runs skip extraction and deployment when the upstream commit matches the last successfully deployed snapshot. Pushes, manual runs, and repository_dispatch events always rebuild. No personal access token, npm packages, server, or external JavaScript libraries are needed. GitHub may disable scheduled workflows in inactive public repositories after 60 days; running the workflow manually still refreshes and deploys the data.

If your default branch has another name, update the push branch in `.github/workflows/pages.yml`. Scheduled workflows run from the default branch. The included data snapshot also supports a conventional branch-based Pages deployment, but that option will not automatically refresh upstream data.

## Automatic upstream refresh

Replace `.github/workflows/pages.yml` with the included updated version, commit it to `main`, keep Pages set to **GitHub Actions**, then run **Refresh data and deploy Pages** once manually.

The final recording job needs **contents: write**, declared in the workflow. Your repository or organization must permit this and allow the Actions bot to push `data/stats.json` to `main`. No personal access token is needed for polling. This assumes the calculator default branch is `main`; if different, update the trigger, the recording checkout ref, and its push destination.

This is polling, not an immediate upstream push subscription. It detects any change to the upstream main commit, including changes outside the stat directories. GitHub schedules are best effort and may be delayed; inactive public repositories can have schedules disabled after 60 days.

For event-driven updates, the workflow also accepts `repository_dispatch` with event type `upstream-update`. An upstream maintainer or an external integration must send that event to the calculator repository using a GitHub App or token authorized for that repository. Adding the receiver alone does not subscribe to upstream pushes. No upstream changes or credentials are required for the default polling mode.

## Run locally

From the project folder:

```sh
python -m http.server 8000
```

Open `http://localhost:8000`. Use an HTTP server because browsers restrict modules and JSON loading when opening `index.html` directly as a local file.

## Refresh the included data manually

Requires Python 3.10+ and Git. The site itself has no build requirement.

```sh
git clone --depth 1 --filter=blob:none --sparse https://github.com/Rotwood-Vale/Ratwood-2.0.git ../ratwood-source
git -C ../ratwood-source sparse-checkout set code/modules/mob/living/carbon/human/species_types code/modules/jobs/job_types/roguetown modular_azurepeak/statpacks code/datums/status_effects/rogue code/modules/mob/living/stats.dm
python scripts/build_data.py ../ratwood-source
```

Commit the new `data/stats.json` if using branch-based Pages hosting. The Actions deployment builds a fresh snapshot and, only after Pages deployment succeeds, commits data/stats.json back to main. This records the deployed upstream commit so unchanged scheduled runs can skip work. The built-in GITHUB_TOKEN push does not trigger another push workflow. A failed build or deployment leaves the old snapshot marker, so the next check retries. If main changed during the run, recording is skipped and a later run retries. Branch protection or organization policy that blocks bot pushes must be adjusted or the recording job will fail and scheduled checks will keep rebuilding. Visitors receive the deployed snapshot without making hundreds of requests to GitHub's API.

## Calculation and scope

Each stat starts at **10**, then adds `race_bonus`, `subclass_stats`, and `stat_array`. The fifth stat is `STAT_WILLPOWER`, displayed as **Endurance / Willpower** to correspond with the spreadsheet. **Humen** is the upstream name for Human.

Buff values are extracted from `code/datums/status_effects/rogue/roguebuff.dm`:

- Vigilant Guardsman (`guardbuffone`): +2 Perception, +1 Constitution, +1 Willpower, +1 Speed.
- Warden (`wardenbuff`): +3 Perception, +1 Speed.

The columns represent separate scenarios. This site does not decide whether a character qualifies for a buff or is standing in an eligible area.

The importer reads declarative type definitions and follows type path or explicit `parent_type` inheritance within the supplied directories. A child's declared list replaces its inherited list, matching DM assignment. Named races and subclasses without a resolvable stats list are omitted because some use bespoke runtime modifications. Named zero-bonus statpacks such as Austere and Virtuous are retained. Virtue choices are not calculated. The site is a list-based planner, not a full simulation of BYOND: traits, equipment, special outfit logic, role restrictions, and any runtime stat changes are outside its scope. It lists source definitions without enforcing player availability.

Fated's `list(-2, 2)` values represent an inclusive randomized range for each stat. The site displays each minimum and maximum rather than inventing a roll.

Default build checked against the supplied screenshot:

| Attribute | Base | Vigilant | Warden |
| --- | ---: | ---: | ---: |
| Strength | 10 | 10 | 10 |
| Perception | 12 | 14 | 15 |
| Intelligence | 13 | 13 | 13 |
| Constitution | 13 | 14 | 13 |
| Endurance / Willpower | 13 | 14 | 13 |
| Speed | 10 | 11 | 11 |
| Fortune | 10 | 10 | 10 |

## Checks

Python 3.10+ and Node.js 20+:

```sh
python -m unittest discover -s tests -p 'test_*.py'
node --test tests/calc.test.mjs
```

Tests cover the screenshot example, independent buffs, negative modifiers, random ranges, DM key aliases, inheritance, unsupported expressions, and data integrity. The importer intentionally stops on unsupported expressions so an upstream format change cannot silently publish incorrect values.

## Files

- `index.html`, `style.css`, `app.js`, `calc.mjs`, `icon.svg`: website.
- `data/stats.json`: bundled source snapshot with exact commit links.
- `scripts/build_data.py`: Python importer, standard library only.
- `.github/workflows/pages.yml`: refresh, check, and publish workflow.
- `tests/`: extraction and calculator checks.

Unofficial fan tool. Upstream names, descriptions, and numerical data originate from the linked Ratwood repository; its licensing and attribution terms continue to apply to upstream material. This project is not endorsed by its maintainers.

## Species choices and age

Species `custom_selection` stat options are imported from source and shown only for applicable races (currently Aasimar). Choose one +1 stat, or leave it unselected. The bonus clears when switching to a race without that option.

The age dropdown uses the game's life stages, not invented numerical age thresholds. Modifiers are extracted from the age switch in `code/modules/mob/living/stats.dm` on every refresh:

- Adult: no modifier.
- Middle-Aged: Speed -1, Willpower +1, Fortune +1.
- Old: Strength -1, Speed -2, Perception -1, Constitution -2, Intelligence +3, Fortune +1.

Age branches are alternatives, not cumulative. Job-specific age-related skills and bespoke outfit logic remain outside the stat-list calculator. Age and species choice are included in shared URLs and the expandable breakdown. The default compact dashboard is designed for one-screen laptop use; the expanded breakdown and smaller screens may scroll.

## Multiple game builds

Use the **Build** selector in the header to switch between Ratwood and Azure Peak. Each has its own races, job subclasses, statpacks, choices, age rules, buffs, commit, and source links. Switching resets character selections to that build's defaults. Shared URLs include `build=ratwood` or `build=azure`; old links default to Ratwood.

Azure Peak currently stores statpacks in `code/modules/statpacks`; the importer automatically detects this alternative to `modular_azurepeak/statpacks`. Its Old age INT modifier is imported independently, not copied from Ratwood. Runtime patron/virtue effects remain outside this list-based planner.

The Actions workflow checks both upstream main branches every 15 minutes. When either changes, it rebuilds and tests both snapshots and deploys them together, then records both snapshots after successful deployment. Include all updated project files, especially `scripts/check_upstreams.py`, `data/azure.json`, the new tests, and `.github/workflows/pages.yml`, when updating an existing repository.

Manual Azure data refresh:

```sh
python scripts/build_data.py ../azure-source --repository https://github.com/Azure-Peak/Azure-Peak --output data/azure.json
node --test tests/*.test.mjs
```

## Combat / DPS tab

The Combat tab adds build-specific melee weapon/intent selection, one/two-handed grips, raw damage per hit and raw DPS, class-derived weapon and athletics skills with manual overrides, stamina and energy pools, recovery per eligible tick, and parry against an editable virtual enemy. Select Base, Vigilant or Warden stats. Random statpack results enumerate relevant integer stat combinations and display metric ranges. Combat controls are local to the current session and are not included in shared character links.

The imported weapon catalog intentionally offers only supported zero-charge, zero-windup standard melee intents. DPS assumes normal stance, pristine weapon, healthy arms, standing, all attacks landing, no armor or special effects. It is a raw damage-rate estimate, not a full combat simulator or sustained DPS. Weapon skill comes from `subclass_skills`; conditional outfit weapon training is not automatically applied. Override it to match the actual character. Enemy skill and armor settings are explicit editable scenario inputs. Parry is the conditional roll chance for an eligible player-like armed attack, not overall avoidance.

STR damage uses the source soft cap and each build's post-cap multiplier; the intent damage delta is added after STR/minimum-STR scaling. Azure intent damage bounds apply. WDEF includes the wielding bonus. Swift weapon parry effects depend on speed differences, target zone, favorable PER/INT differences, and light/no armor. The old martial bonus is Ratwood-only. Other status effects, special grips, weapon binding, quality, enchantments, virtues, armor mitigation, dodge and cooldown availability remain outside this estimate.

Fatigue recovery is shown per **eligible update**, not continuous regeneration: recovery itself resets `last_fatigued`, and the source requires more than two seconds before another recovery update. WIL affects capacity but does not increase the base recovery amount at a fixed energy percentage. Attack counts assume a fresh fatigue bar, no regeneration or incoming attacks, and no cost-modifying traits.

Refresh combat data after the normal importer:

```sh
python scripts/build_combat.py ../ratwood-source data/stats.json
python scripts/build_combat.py ../azure-source data/azure.json
node --test tests/*.test.mjs
```

The deployment workflow now runs both combat importers and publishes `combat.mjs` and `combat-ui.js`. Upload all updated files, including scripts/tests/workflow. Formula source links are in the expandable mechanics section. Source constants, weapons, intent fields and class skill lists refresh automatically; major procedural formula rewrites still require updating the corresponding JavaScript implementation.

## Parallel armor / opponent estimates

Combat now shows Clean damage/resources beside Against virtual opponent. Choose the enemy's single chest armor piece, current integrity percentage, weapon, grip, age, final stats, skill, and armor training. Both directions of parry are explicit: your parry against enemy swings and enemy parry against your swings. Enemy parry reduces your expected health DPS and armor wear rate; the separate contact percentage accounts for other misses/dodges as an editable scenario input.

Armor ratings, maximum integrity, failure threshold, weapon integrity multiplier, intent penetration and intent integrity factor are extracted independently from each build. HP penetration and integrity damage follow their separate source branches, including Ratwood's different penetrating-hit wear behavior. The armor-break counter targets the source failure threshold, not zero durability. Expected time starts with an attack at t=0 and includes unsuccessful swings via expected landing probability.

This is a single covered chest piece, not a full equipment-layer simulator. Weapons remain pristine at fixed damage, cadence is uninterrupted, armor is not repaired, and fatigue pauses, cooldown-blocked parry attempts, tempo, status effects and special traits are excluded. These are explicit scenario limits, not a claim of assumption-free actual combat. Other hit/contact chance is user-set, not auto-derived accuracy. Enemy stat inputs are final stats; enemy age controls the explicit age parry bonus only. No armor or already-broken armor uses the unarmored scenario. A Never break time means the selected modeled attacks do not deplete the piece or cannot land.

## Body-part accuracy and stamina pressure

Select among 19 major and precise body parts. The comparison table implements the source's two-roll melee aiming resolution, including PER, skill, intent blade class, intent accuracy modifier, short-weapon bonus and aimed/swift stance adjustments. It separates the exact selected part, parent-bodypart fallback and chest fallback. Accuracy failure is not a true miss. The normal standing-versus-standing reach check prevents short/normal weapons from selecting feet. Fortune below ten supplies the independent critical-miss check.

Opponent DPS integrates the actual aim distribution and the selected item's imported coverage. The armed damage pipeline checks armor using the resolved parent bodypart; for example, a hand resolves through its arm. The selected armor remains one piece, not a full outfit or layer stack. An unprotected head is not silently assigned chest plate. Normal parry cooldown reduces the effective defense frequency at faster swing cadences; the conditional roll remains visible separately.

Weapon balance and stance are separate controls. Swift-balanced weapons use the existing speed/PER/INT parry mechanic; heavy-balanced weapons add fatigue per positive STR difference to a successful parry. Normal/aimed/swift/strong stances apply their source cadence, accuracy, damage and fatigue changes. Enemy weapon, grip, attack intent, stance, WIL, athletics, reserve energy, fortune and starting fatigue are configurable; choose attack-and-parry or defense-only behavior.

The 180-second expected-fatigue race compares both combatants until first expected exhaustion. It includes swing costs, expected successful-parry costs, normal 1.2s parry cooldown, heavy STR-gap costs, eligible recovery updates and reserve energy expenditure. This is a deterministic expected-fatigue estimate, not stochastic victory odds or a full duel simulator: HP death, injury, special traits, tempo, weapon wear and post-exhaustion behavior are excluded. For random statpacks the race uses lower-middle integer stats, explicitly labeled; target accuracy and DPS retain ranges. Clean DPS stays alongside opponent-adjusted results. Armor break timing remains a fixed-sharpness uninterrupted estimate separate from the fatigue race.

Publish `targeting.mjs` along with all other project files. The Pages workflow has been updated to include it, and both upstream importers now extract accuracy and balance constants, weapon length and armor coverage. Source links are available in the combat mechanics section.

## Side-by-side virtual matchup

Both fighters use the RMB **Defend** intent (no active Guard/Clash). **Block / parry** uses the strongest held defense score and skips the regular parry delay. One-handed builds can equip an offhand shield; bucklers use the main-hand weapon skill in the supported loadouts. **Dodge** uses speed and skill with the incoming weapon for the roll, and compares the two main weapons’ skills to determine the stamina cost. Dodge Expert is optional and works only with suitable equipment. Untrained armor prevents dodging in this model.

Weapons, grips, attack intents, selected targets, shields, and armor pieces/condition are configurable on both sides. Your stats come from the character builder; enemy stats are final inputs. Opening HP DPS and estimated break times use the starting defense and armor, while the separate expected-fatigue race tracks both fighters’ spending and dodge recovery. In the race, a heavy attacker’s positive STR gap increases successful block cost; swift balance affects defense odds, and heavy weapons are easier for faster opponents to dodge. Successful dodges can also charge the attacker the attack intent’s miss cost.

The race uses average-event approximations and fixed armor protection; it stops at modeled exhaustion or 180 seconds. No HP-death check, terrain simulation, Guard/Clash, gear break transitions, weapon/shield wear, or tempo. Dodge requires room to move and the scenario assumes the fighters re-engage. Opening armor wear follows source coverage for the catalogued equipment; estimates omit overflow and post-break layers. Sources for both source snapshots are linked in the UI.
