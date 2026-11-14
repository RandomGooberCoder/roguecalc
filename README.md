# Ratwood stat calculator

A static, dependency-free website for GitHub Pages. Choose a race, job subclass, and statpack to compare unbuffed stats, Vigilant Guardsman stats, and Warden stats. Includes a contribution breakdown, job filtering, shareable build URLs, and links to the exact upstream source commit.

## Publish on GitHub Pages

1. Create a GitHub repository with `main` as its default branch.
2. Extract this project and upload its **contents** to the repository root. `index.html`, `data/`, `scripts/`, `tests/`, and `.github/` should be at the root; do not upload only the ZIP or wrap everything in another folder. Make sure the hidden `.github` directory is included.
3. Open **Settings > Pages**. Under **Build and deployment**, choose **GitHub Actions** as the source.
4. Open **Actions > Refresh data and deploy Pages > Run workflow**, select `main`, and run it. Future pushes to `main` deploy automatically.
5. When the workflow finishes, Settings > Pages and the workflow's deployment show your published URL.

The workflow reads `Rotwood-Vale/Ratwood-2.0`, branch `main`, extracts fresh stats, checks the calculator, and publishes only the static website. It also runs daily at 06:23 UTC, subject to GitHub's scheduler delays. No personal access token, npm packages, server, or external JavaScript libraries are needed. GitHub may disable scheduled workflows in inactive public repositories after 60 days; running the workflow manually still refreshes and deploys the data.

If your default branch has another name, update the push branch in `.github/workflows/pages.yml`. Scheduled workflows run from the default branch. The included data snapshot also supports a conventional branch-based Pages deployment, but that option will not automatically refresh upstream data.

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
git -C ../ratwood-source sparse-checkout set code/modules/mob/living/carbon/human/species_types code/modules/jobs/job_types/roguetown modular_azurepeak/statpacks code/datums/status_effects/rogue
python scripts/build_data.py ../ratwood-source
```

Commit the new `data/stats.json` if using branch-based Pages hosting. The Actions deployment builds a fresh snapshot into the deployment artifact; it does not commit it back to your repository. Visitors receive the deployed snapshot without making hundreds of requests to GitHub's API.

## Calculation and scope

Each stat starts at **10**, then adds `race_bonus`, `subclass_stats`, and `stat_array`. The fifth stat is `STAT_WILLPOWER`, displayed as **Endurance / Willpower** to correspond with the spreadsheet. **Humen** is the upstream name for Human.

Buff values are extracted from `code/datums/status_effects/rogue/roguebuff.dm`:

- Vigilant Guardsman (`guardbuffone`): +2 Perception, +1 Constitution, +1 Willpower, +1 Speed.
- Warden (`wardenbuff`): +3 Perception, +1 Speed.

The columns represent separate scenarios. This site does not decide whether a character qualifies for a buff or is standing in an eligible area.

The importer reads declarative type definitions and follows type path or explicit `parent_type` inheritance within the supplied directories. A child's declared list replaces its inherited list, matching DM assignment. Named races and subclasses without a resolvable stats list are omitted because some use bespoke runtime modifications. Named zero-bonus statpacks such as Austere and Virtuous are retained. Virtue choices are not calculated. The site is a list-based planner, not a full simulation of BYOND: age, traits, equipment, special outfit logic, role restrictions, and any runtime stat changes are outside its scope. It lists source definitions without enforcing player availability.

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
