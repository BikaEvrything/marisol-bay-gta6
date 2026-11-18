# Marisol Bay

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/BikaEvrything/marisol-bay-gta6/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/BikaEvrything/marisol-bay-gta6/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Marisol Bay** is an original, self-contained open-world browser game: sun, cash and getaways on an open coast. Run jobs across a procedurally generated seaside city on foot and behind the wheel, all rendered on a single HTML canvas with no network calls, no external assets and no dependencies. It was built for make.fun's **Make GTA 6** competition (entry `gta6-01`).

## Features

- **A generated coastal city.** A 50×38-tile world built from a random (or fixed) seed: water, beach and a coast road on the west edge, then five districts with their own looks — Palm Shores, Glasspoint, Lavanda Heights, Old Marisol and Dockside.
- **On foot or on wheels.** Walk or sprint, shove, and enter or steal any of the city's vehicles — sedans, vans, sports cars and taxis — with handbrake handling for the getaway.
- **Jobs.** Six story missions, then an endless courier gig once the story wraps. Start each job by reaching its yellow marker.
- **A five-star wanted system.** Jacking cars, shoving pedestrians, ramming or stealing police cruisers raises your stars; they fade when the police lose sight of you. A cruiser looming over your stopped car for long enough means **BUSTED** and a $150 fine.
- **A living street level.** 26 traffic vehicles in lane-following AI, 46 pedestrians, headlights, skid dust, puff particles, floating text and screen shake.
- **Synthesised sound.** Every sound effect is built live with the Web Audio API — no audio files anywhere.
- **Menus and saving.** Title, pause and controls screens work by keyboard or mouse; progress saves to `localStorage` and can be continued later.
- **HUD.** Cash and wanted stars, an objective panel, contextual hints, notifications, and a live minimap showing police, traffic and the objective marker.

## Controls

| Key | Action |
| --- | --- |
| `WASD` / arrow keys | Walk on foot · throttle and steer when driving |
| `Shift` | Sprint on foot |
| `F` or `E` | Enter, steal or leave a vehicle |
| `Space` | Shove on foot · handbrake while driving |
| `H` | Horn |
| `M` | Mute |
| `P` or `Esc` | Pause |

Menus are driven with `W`/`S` or the arrow keys plus `Space`/`Enter`, or by hovering and clicking with the mouse. In menus, `M` toggles sound; the pause menu offers save, controls and quit-to-title.

## Play locally

Requires **Node.js 22.18 or later** and a desktop browser. Node runs these `.ts` files directly: no package installation, account, API key or paid service is needed to play.

```sh
node serve.ts
```

This serves `game/` on <http://localhost:8080> (loopback only; pass `--port N` to change the port). Add `?seed=N` to the URL to replay the same city layout.

## Build the competition output

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts
```

The entrypoint validates `game/`, `screenshots/` (the genuine renderer captures) and `shots.json` against the official make.fun caps, copies everything into `MAKEFUN_OUTPUT_DIR` (default `/output`) in sorted, deterministic order, writes `dossier.json` using the unmodified vendored make.fun kit helper, and prints a `manifest.json` of sha256 hashes so a second run into a second directory can be diffed byte for byte.

## Original IP

Marisol Bay is an independent original work: a fictional setting created for this competition, not a Rockstar Games product and not affiliated with, endorsed by or derived from any Grand Theft Auto title. No GTA or Rockstar names, characters, maps, art, music or assets appear in the game — every line of code, image, sound and street is generated in this repository.

## Provenance

This repository has two distinct, honestly separated phases:

- **The original game build.** The game itself (commit `a2ff5f0`, *Marisol Bay: original open-world coastal caper*) was authored in an authentic OpenCode session using the explicitly selected `opencode/glm-5.3-flash-free` model with make.fun's official live recorder, preserved in sealed recording `01a1eb6e-d114-7227-8e66-5b229d808c64`. Original session records are supplied to make.fun through that recording, not recreated or edited transcripts. The build passed the official local pre-submit check — a local pass is not server acceptance, a score, a ranking, or a promise of eligibility or reward. The live badges above report make.fun's published state when available.
- **This supplementary documentation revision.** The current commit rewrites only `README.md` and `.mailmap`, recorded in this session's own genuine recorded documentation pass with the same explicitly selected model and official live recorder.
- **Why this revision exists.** The prior publication at commit `29fa14f` was rejected solely because those two metadata files were written outside the sealed game recording — a metadata recording-coverage issue, not a judgement of the game. It was not accepted, scored or ranked, and no earlier claim about it is implied. An earlier read-only review of the draft was review only and is not claimed as authorship of anything.

The make.fun entry metadata is owned by **BikaEvrything/marisol-bay-gta6**, as reflected in the badge links above (`README.md` and `.makefun/owner.json` carry the required badges and public wallet ownership proof).

## License

MIT — see [LICENSE](LICENSE).

---

Built for [make.fun](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01), where AI agents build software for coding bounties.
