import { LEAGUE_ID, SUPABASE_KEY, SUPABASE_URL } from "./config.js";

const SLEEPER_BASE = "https://api.sleeper.app/v1";
const SLEEPER_GRAPHQL = "https://api.sleeper.app/graphql";
const SNAPSHOT_ID = "primary";
export const SLEEPER_REFRESH_COOLDOWN_MS = 15 * 60 * 1000;
let sharedSnapshot = null;
let sharedSnapshotRefreshedAt = 0;

function snapshotSeason(leagueId) {
  return sharedSnapshot?.seasons?.find((season) => String(season.leagueId) === String(leagueId));
}

function snapshotWeek(collection, week) {
  return collection?.[String(week)] || [];
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function setCache(key, data, ttlMs) {
  const payload = {
    expiresAt: Date.now() + ttlMs,
    data,
  };
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // Large player payloads can exceed browser storage quotas; live data still works.
  }
}

function getCache(key) {
  let raw;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;
  const payload = safeJsonParse(raw, null);
  if (!payload || !payload.expiresAt || payload.expiresAt < Date.now()) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore storage cleanup failures in restricted browser contexts.
    }
    return null;
  }
  return payload.data;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`API error ${response.status} from ${url}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchGraphql(query) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(SLEEPER_GRAPHQL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Sleeper GraphQL error ${response.status}`);
    const payload = await response.json();
    if (payload.errors?.length) throw new Error(payload.errors[0]?.message || "Sleeper GraphQL request failed");
    return payload.data || {};
  } finally {
    clearTimeout(timeout);
  }
}

export function getLeagueId() {
  return /^\d+$/.test(LEAGUE_ID) ? LEAGUE_ID : "";
}

export async function initializeSharedData() {
  try {
    const params = new URLSearchParams({
      select: "payload,refreshed_at",
      id: `eq.${SNAPSHOT_ID}`,
      limit: "1",
    });
    const response = await fetch(`${SUPABASE_URL}/rest/v1/ffleague_snapshots?${params}`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const [row] = await response.json();
    if (!row?.payload?.seasons?.length) return null;
    sharedSnapshot = row.payload;
    sharedSnapshotRefreshedAt = Date.parse(row.refreshed_at || "") || Number(row.payload.generatedAt || 0);
    return sharedSnapshot;
  } catch {
    return null;
  }
}

export function getSharedDataStatus() {
  const ageMs = sharedSnapshotRefreshedAt
    ? Math.max(0, Date.now() - sharedSnapshotRefreshedAt)
    : Infinity;
  return {
    usingSharedData: Boolean(sharedSnapshot),
    refreshedAt: sharedSnapshotRefreshedAt,
    canRefresh: ageMs >= SLEEPER_REFRESH_COOLDOWN_MS,
    retryAt: Number.isFinite(ageMs)
      ? sharedSnapshotRefreshedAt + SLEEPER_REFRESH_COOLDOWN_MS
      : 0,
  };
}

export async function refreshSharedData() {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/refresh-ffleague`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ leagueId: LEAGUE_ID }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `Refresh failed (${response.status})`);
    error.retryAt = payload.retryAt ? Date.parse(payload.retryAt) : 0;
    throw error;
  }
  await initializeSharedData();
  return payload;
}

export async function getNflState() {
  if (sharedSnapshot?.nflState) return sharedSnapshot.nflState;
  const cacheKey = "ffl_cache_nfl_state";
  const cached = getCache(cacheKey);
  if (cached) return cached;
  const data = await fetchJson(`${SLEEPER_BASE}/state/nfl`);
  setCache(cacheKey, data, 2 * 60 * 1000);
  return data;
}

export async function getLeagueCore(leagueId) {
  const season = snapshotSeason(leagueId);
  if (season) return { league: season.league, users: season.users, rosters: season.rosters };
  const cacheKey = `ffl_cache_core_${leagueId}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const [league, users, rosters] = await Promise.all([
    fetchJson(`${SLEEPER_BASE}/league/${leagueId}`),
    fetchJson(`${SLEEPER_BASE}/league/${leagueId}/users`),
    fetchJson(`${SLEEPER_BASE}/league/${leagueId}/rosters`),
  ]);

  const data = { league, users, rosters };
  setCache(cacheKey, data, 5 * 60 * 1000);
  return data;
}

export async function getMatchups(leagueId, week) {
  const season = snapshotSeason(leagueId);
  if (season) return snapshotWeek(season.matchups, week);
  const cacheKey = `ffl_cache_matchups_${leagueId}_${week}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const data = await fetchJson(`${SLEEPER_BASE}/league/${leagueId}/matchups/${week}`);
  setCache(cacheKey, data, 30 * 1000);
  return data;
}

export async function getTransactions(leagueId, week) {
  const season = snapshotSeason(leagueId);
  if (season) return snapshotWeek(season.transactions, week);
  const cacheKey = `ffl_cache_transactions_${leagueId}_${week}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;
  const data = await fetchJson(`${SLEEPER_BASE}/league/${leagueId}/transactions/${week}`);
  setCache(cacheKey, data, 90 * 1000);
  return data;
}

export async function getTradeBlockEntries(leagueId) {
  if (sharedSnapshot && String(sharedSnapshot.rootLeagueId) === String(leagueId)) {
    return sharedSnapshot.tradeBlockEntries || [];
  }
  const cacheKey = `ffl_cache_trade_block_v1_${leagueId}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const data = await fetchGraphql(`
    query league_players {
      league_players(league_id: "${leagueId}") {
        player_id
        settings
      }
    }
  `);
  const entries = (data.league_players || [])
    .filter((row) => /^\d+$/.test(String(row.player_id || "")) && row.settings?.otb)
    .map((row) => ({
      playerId: String(row.player_id),
      rosterId: String(row.settings.otb),
      addedAt: Number(row.settings.otb_added_at || 0),
    }));
  setCache(cacheKey, entries, 60 * 1000);
  return entries;
}

export async function getDraftPicks(leagueId) {
  const season = snapshotSeason(leagueId);
  if (season) return season.draftPicks || [];
  const cacheKey = `ffl_cache_draftpicks_v3_${leagueId}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const drafts = await fetchJson(`${SLEEPER_BASE}/league/${leagueId}/drafts`);
  const picksPerDraft = await Promise.all(
    drafts.map(async (draft) => {
      const [draftDetail, picks] = await Promise.all([
        fetchJson(`${SLEEPER_BASE}/draft/${draft.draft_id}`).catch(() => draft),
        fetchJson(`${SLEEPER_BASE}/draft/${draft.draft_id}/picks`).catch(() => []),
      ]);
      const slotMap = draftDetail.slot_to_roster_id || {};
      return picks.map((pick) => ({
        ...pick,
        draftSeason: String(draft.season || ""),
        originalRosterId: String(slotMap[String(pick.draft_slot)] || ""),
      }));
    })
  );
  const picks = picksPerDraft.flat();
  setCache(cacheKey, picks, 60 * 60 * 1000);
  return picks;
}

export async function getPlayers() {
  if (sharedSnapshot?.players) return sharedSnapshot.players;
  const cacheKey = "ffl_cache_players_nfl";
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const players = await fetchJson(`${SLEEPER_BASE}/players/nfl`);
  setCache(cacheKey, players, 24 * 60 * 60 * 1000);
  return players;
}

export async function getPlayerProjections(season, week, playerIds = []) {
  if (String(sharedSnapshot?.nflState?.season) === String(season)
    && Number(sharedSnapshot?.nflState?.week) === Number(week)) {
    return sharedSnapshot.projections || {};
  }
  const cacheKey = `ffl_cache_projections_${season}_${week}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const positions = ["QB", "RB", "WR", "TE", "K", "DEF"]
    .map((position) => `position[]=${position}`)
    .join("&");
  const url = `https://api.sleeper.com/projections/nfl/${season}/${week}?season_type=regular&${positions}&order_by=pts_ppr`;
  const rows = await fetchJson(url);
  const rosterPlayerIds = new Set(playerIds.map(String));
  const projections = {};

  for (const row of Array.isArray(rows) ? rows : []) {
    const playerId = String(row?.player_id || "");
    if (!playerId || !rosterPlayerIds.has(playerId) || row?.category !== "proj") continue;
    projections[playerId] = {
      playerId,
      opponent: row.opponent || "",
      status: row.status || row.player?.injury_status || "",
      position: row.player?.position || "",
      stats: row.stats || {},
    };
  }

  setCache(cacheKey, projections, 30 * 60 * 1000);
  return projections;
}

export async function getBrackets(leagueId) {
  const season = snapshotSeason(leagueId);
  if (season) return season.brackets || { winners: [], losers: [] };
  const cacheKey = `ffl_cache_brackets_${leagueId}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const [winners, losers] = await Promise.all([
    fetchJson(`${SLEEPER_BASE}/league/${leagueId}/winners_bracket`).catch(() => []),
    fetchJson(`${SLEEPER_BASE}/league/${leagueId}/losers_bracket`).catch(() => []),
  ]);
  const data = { winners, losers };
  setCache(cacheKey, data, 20 * 60 * 1000);
  return data;
}

export async function getLeagueHistory(leagueId, maxSeasons = 6) {
  if (sharedSnapshot && String(sharedSnapshot.rootLeagueId) === String(leagueId)) {
    return sharedSnapshot.seasons.slice(0, maxSeasons).map((season) => ({
      leagueId: season.leagueId,
      league: season.league,
      users: season.users,
      rosters: season.rosters,
    }));
  }
  const history = [];
  let current = String(leagueId || "");
  for (let i = 0; i < maxSeasons; i += 1) {
    let core;
    try {
      core = await getLeagueCore(current);
    } catch (error) {
      if (i === 0) throw error;
      break;
    }

    history.push({ leagueId: current, ...core });

    const next = String(core.league?.previous_league_id || "");
    if (!/^\d+$/.test(next) || /^0+$/.test(next)) break;
    if (history.some((row) => row.leagueId === next)) break;
    current = next;
  }
  return history;
}

function fallbackPlayerValue(player) {
  const pos = player?.position;
  const age = Number(player?.age || 27);
  const ageBonus = Math.max(0, 10 - Math.abs(26 - age));
  const posBase = {
    QB: 780,
    RB: 720,
    WR: 740,
    TE: 600,
    K: 120,
    DEF: 180,
  }[pos] || 220;
  const injuryStatus = String(player?.injury_status || "").toLowerCase();
  const injuryPenalty = injuryStatus && !["active", "healthy"].includes(injuryStatus) ? 90 : 0;
  return Math.max(80, Math.round(posBase + ageBonus * 10 - injuryPenalty));
}

export async function getPlayerValues(playersById) {
  const values = {};
  const ids = Object.keys(playersById || {});
  if (!ids.length) return values;

  try {
    const params = new URLSearchParams({
      isDynasty: "true",
      numQbs: "2",
      numTeams: "12",
      ppr: "1",
    });
    const resp = await fetch(`https://api.fantasycalc.com/values/current?${params}`);
    if (resp.ok) {
      const data = await resp.json();
      const rows = Array.isArray(data) ? data : [];
      for (const row of rows) {
        if (row?.player?.sleeperId) {
          values[String(row.player.sleeperId)] = Number(row.value || 0);
        }
      }
    }
  } catch {
    // Ignore remote value source errors and fall back to local model.
  }

  for (const id of ids) {
    if (typeof values[id] !== "number" || values[id] <= 0) {
      values[id] = fallbackPlayerValue(playersById[id]);
    }
  }

  return values;
}

export function getPlayerHeadshot(playerId, player) {
  const position = String(player?.position || "").toUpperCase();
  if (position === "DEF" || position === "DST" || /^[A-Z]{2,3}$/.test(String(playerId))) {
    const sleeperTeam = String(player?.team || playerId).toLowerCase();
    const espnTeam = { was: "wsh" }[sleeperTeam] || sleeperTeam;
    return `https://a.espncdn.com/i/teamlogos/nfl/500/${espnTeam}.png`;
  }
  const espnId = String(player?.espn_id || "");
  if (/^\d+$/.test(espnId)) {
    return `https://a.espncdn.com/i/headshots/nfl/players/full/${espnId}.png`;
  }
  return `https://sleepercdn.com/content/nfl/players/${playerId}.jpg`;
}

export function getManagerAvatar(avatarId) {
  const id = String(avatarId || "");
  return id ? `https://sleepercdn.com/avatars/thumbs/${id}` : "";
}
