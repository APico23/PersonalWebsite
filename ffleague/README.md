# FF League War Room

Custom fantasy football league site with a sharp-edged heavy-metal and fire visual theme, live Sleeper data, and responsive analytics features.

## Data Sources
- Sleeper API (league, roster, matchup, transaction, and draft data)
- Supabase shared snapshot cache (primary page-load source with direct Sleeper fallback)
- Sleeper GraphQL league-player statuses (live trade block)
- Sleeper web-client projections endpoint (cached with scoring-history fallback because it is not part of the documented API)
- ESPN and Sleeper public CDNs (player headshots)
- FantasyCalc values API when available, with local fallback player valuation model

## Pages
- `index.html`: league dashboard, historical week selector, standings, matchups, news feed, and weekly recap
- `analytics.html`: advanced team, trade, age, performance, and strength-of-schedule metrics
- `managers.html`: manager history, awards, head-to-head, draft/value profile
- `divisions.html`: season-by-season division assignments, winners, career records, and rivalries
- `trade-block.html`: active trade block ranking with visible roster-fit recommendations

## Usage
1. Open any page under `ffleague` in a browser.
2. League ID and rivalries are loaded from `assets/config.js`; league data loads from the shared Supabase snapshot.
3. The dashboard's `Refresh Sleeper Data` button refreshes that shared snapshot after the 15-minute cooldown.
4. No on-page data entry is enabled in this build.

## Shared Sleeper Cache
- All visitors read the same compact snapshot from the `ffleague_snapshots` Supabase table.
- The snapshot stores only fields used by the site: IDs, team names, league settings, rosters, scores, lineups, transactions, draft picks, brackets, player names/statuses, and projections.
- No image files are stored. Sleeper avatar IDs and ESPN player IDs remain lightweight references to CDN images.
- The `refresh-ffleague` Edge Function owns all writes and enforces one refresh every 15 minutes across all visitors.
- If Supabase is temporarily unavailable, the frontend falls back to direct Sleeper requests.

Deploy the shared cache from a Supabase CLI session authorized for the existing portfolio project:

```powershell
supabase link --project-ref fupysqufnvblxyocqxey
supabase db push
supabase functions deploy refresh-ffleague --no-verify-jwt
```

After deployment, use `Refresh Sleeper Data` on the dashboard once to seed the shared snapshot.

## Code Configuration
- Edit `assets/config.js` to change:
	- `LEAGUE_ID`
	- `RIVALRIES`
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
