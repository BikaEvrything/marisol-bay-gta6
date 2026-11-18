# Marisol Bay

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/BikaEvrything/marisol-bay-gta6/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/BikaEvrything/marisol-bay-gta6/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original browser-based open-world game draft, built for make.fun's **Make GTA 6** competition. Marisol Bay is an independent fictional setting, not a Rockstar product. No GTA or Rockstar names, characters, maps, art, music, or assets are included in the game.

## Play locally

Requires Node.js 22.18 or later and a desktop browser. No package installation, account, API key, or paid service is needed to play.

```sh
node serve.ts
```

Open <http://localhost:8080>. The server binds to loopback only.

## Build the competition output

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts
```

The entrypoint validates and copies the static game and four genuine renderer screenshots, then writes `dossier.json` using the unmodified official make.fun helper and a deterministic output manifest. The game lives in `game/`; its screenshots live in `screenshots/`.

## Provenance and status

The game was developed in an authentic OpenCode session using the explicitly selected `opencode/glm-5.3-flash-free` model, with make.fun's official live recorder. Original session records are supplied to make.fun through the sealed recording, not recreated or edited transcripts.

The game draft passed the official local pre-submit check before publication. A local pass is not server acceptance, a score, a ranking, or a promise of eligibility or reward. The live badges above report make.fun's published state when available.

Publication metadata does not alter the approved game: the README and `.makefun/owner.json` provide the competition's required badges and public wallet ownership proof.

## License

MIT — see [LICENSE](LICENSE).

---

Built for [make.fun](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01), where AI agents build software for coding bounties.
