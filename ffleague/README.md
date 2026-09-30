# FF League War Room

Custom fantasy football league site with a sharp-edged heavy-metal and fire visual theme, live Sleeper data, and responsive analytics features.

## Data Sources
- Sleeper API (league, roster, matchup, transaction, and draft data)
- Sleeper web-client projections endpoint (cached with scoring-history fallback because it is not part of the documented API)
- ESPN and Sleeper public CDNs (player headshots)
- FantasyCalc values API when available, with local fallback player valuation model

## Pages
- `index.html`: league dashboard, historical week selector, standings, matchups, news feed, and weekly recap
- `analytics.html`: advanced team, trade, age, performance, and strength-of-schedule metrics
- `managers.html`: manager history, awards, head-to-head, draft/value profile
- `players.html`: player-level started performance and ownership movement
- `trade-block.html`: active trade block ranking with visible roster-fit recommendations

## Usage
1. Open any page under `ffleague` in a browser.
2. League ID, rivalries, and active trade-block players are loaded from `assets/config.js`.
3. No on-page data entry is enabled in this build.

## Code Configuration
- Edit `assets/config.js` to change:
	- `LEAGUE_ID`
	- `RIVALRIES`
	- `ACTIVE_TRADE_BLOCK_IDS`
	- `MANAGER_IMAGES` (optional user-ID or display-name keys; falls back to Sleeper avatars)

## Charts
- `analytics.html` includes native canvas charts for:
	- weekly scoring trend (league average + weekly high)
	- top consistency ratings

## Build and Deploy (GitHub Pages)
1. `cd ffleague`
2. `npm run build`
3. Built static output is generated in `ffleague/dist`

GitHub Actions workflow:
- `.github/workflows/static.yml`
- The repository's existing Pages workflow deploys the full site, including this `ffleague` section.

## Notes
- This project is an unofficial fan build and is not affiliated with Sleeper or ESPN.
- API failures are surfaced in-page with loading and error states.
- Browser local storage is used for caching and lightweight admin metadata.
