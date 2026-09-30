import {
  getBrackets,
  getDraftPicks,
  getLeagueCore,
  getLeagueHistory,
  getLeagueId,
  getManagerAvatar,
  getMatchups,
  getNflState,
  getPlayerHeadshot,
  getPlayerProjections,
  getPlayers,
  getPlayerValues,
  getTransactions,
} from "./api.js";
import { ACTIVE_TRADE_BLOCK_IDS, MANAGER_IMAGES, RIVALRIES } from "./config.js";
import {
  ageMetrics,
  buildPerformanceMetrics,
  buildRosterProjectionScores,
  buildWeeklyMatchups,
  calculatePlayoffOdds,
  collectTrades,
  computeStandings,
  managerAwards,
  managerTradeProfile,
  managerTradeRankings,
  TRADE_RANKING_DESCRIPTION,
  mapRosters,
  mapUsers,
  playerOwnershipTimeline,
  playerStartedStats,
  playoffPicture,
  teamCompositionMetrics,
  tradeBlockRankings,
  upsetCandidates,
  weeklyAllStars,
  weeklySummary,
} from "./analytics.js";
import { average, dateLabel, escapeHtml, n, pct, playoffWeek, qs, safeArray, text } from "./utils.js";

const page = document.body.dataset.page;
const state = {
  leagueId: getLeagueId(),
  currentWeek: 1,
  selectedWeek: 1,
  league: null,
  users: [],
  rosters: [],
  standings: [],
  rostersById: {},
  usersById: {},
  playersById: {},
  playerValues: {},
  playerProjections: {},
  rosterProjections: {},
  weeklyMatchups: [],
  weeklyTransactions: [],
  recapWeek: 0,
  recapMatchups: [],
  tradeAnalytics: { ranked: [] },
  draftPicks: [],
  history: [],
};

const RIVALRY_QUIPS = [
  "The group chat has been placed on high alert.",
  "Bragging rights are available; dignity is not guaranteed.",
  "The loser may need to mute notifications until Thursday.",
  "No trophy is awarded, but the screenshots last forever.",
  "The standings matter less than the next seven days of trash talk.",
  "League historians have already opened a fresh document.",
  "This matchup comes with unnecessary emotional stakes.",
  "Both managers insist they are calm. Neither manager is calm.",
  "The commissioner has declined to provide a neutral venue.",
  "One lineup wins; the other becomes a reaction image.",
  "The projections are numbers. The grudge is personal.",
  "Expect lineup tinkering right up to the point of regret.",
];

const UPSET_QUIPS = [
  "Rankings were merely a suggestion.",
  "The favorite has requested a recount.",
  "The projections are currently avoiding eye contact.",
  "Somewhere, a win-probability chart quietly caught fire.",
  "The underdog brought receipts and a working lineup.",
  "That sound was the standings rearranging themselves.",
  "The favorite entered confident and left with a character-building experience.",
  "The matchup algorithm would prefer not to discuss it.",
  "A perfectly normal result, according to the winner and nobody else.",
  "The victory lap began before stat corrections cleared.",
  "The group chat learned a valuable lesson about premature confidence.",
  "Vegas was unavailable for comment, but the bench was delighted.",
];

const STAR_QUIPS = [
  "That lineup spot is now legally considered premium real estate.",
  "The opponent checked the box score twice and disliked it both times.",
  "A polite performance was apparently never considered.",
  "The scoreboard needed protective equipment.",
  "The start decision deserves one week without criticism.",
  "That was less a game and more a hostile takeover.",
  "The fantasy app briefly considered adding a mercy rule.",
  "The points arrived in bulk with no return policy.",
  "Someone remembered to set the difficulty to beginner.",
  "The manager will be taking full credit, naturally.",
  "The defense had a plan right up until kickoff.",
  "This is why the lineup card was written in permanent marker.",
  "The weekly ceiling has a new dent in it.",
  "An unreasonable number of points were delivered on schedule.",
];

const BUST_QUIPS = [
  "The lineup slot has requested anonymity.",
  "The box score contains more questions than answers.",
  "A cardboard cutout was reportedly considered at halftime.",
  "The projected points have entered witness protection.",
  "The start button would like to apologize for its role in this.",
  "The bench tried not to stare.",
  "Technically, participation did occur.",
  "The stat line arrived wearing camouflage.",
  "The manager has classified the decision as a learning experience.",
  "The points were apparently lost in transit.",
  "A strong cardio session, according to sources.",
  "The fantasy contribution fit comfortably in a carry-on bag.",
  "The matchup was promised points and received a shrug.",
  "Film review has been postponed indefinitely.",
  "The lineup optimizer has deleted its browser history.",
  "The expected breakout remains expected.",
  "The scoring column barely noticed the visit.",
  "The manager is now accepting unsolicited hindsight.",
];

const TRADE_QUIPS = [
  "Both sides immediately declared victory, as tradition demands.",
  "The league chat has begun conducting an entirely unbiased investigation.",
  "One manager bought upside; the other bought a future argument.",
  "Trade calculators across the region are working overtime.",
  "The handshake is complete. The second-guessing has just begun.",
  "The deal passed medicals but may not survive the group chat.",
  "Two rosters changed and twelve opinions appeared instantly.",
  "The commissioner has confirmed that regret is not vetoable.",
];

const WAIVER_QUIPS = [
  "The free-agent market has been disturbed from its slumber.",
  "A bench spot has received a fresh coat of optimism.",
  "The move has been labeled low-risk by the person who made it.",
  "Another sleeper has been found, pending the actual sleeping part.",
  "The transaction log remains undefeated.",
  "Hope has officially been added to the roster.",
  "The waiver budget trembled, but survived.",
  "Depth-chart archaeology produced another artifact.",
];

const INJURY_JABS = [
  (row) => `${row.manager} has begun refreshing the waiver wire with unusual intensity.`,
  (row) => `${row.manager}'s depth chart is now held together with athletic tape.`,
  () => "The backup plan would like more time to prepare.",
  (row) => `${row.manager} has promoted "wait and see" to a full-time strategy.`,
  () => "The questionable tag has entered the chat and refused to elaborate.",
  (row) => `${row.manager} is calling it day-to-day; the panic is minute-to-minute.`,
  () => "The training table has requested additional seating.",
  (row) => `${row.manager} just discovered that roster depth is not a theoretical concept.`,
  () => "The injury report remains the league's least popular newsletter.",
  (row) => `${row.manager} has opened three waiver tabs and one bargaining stage of grief.`,
  () => "The medical tent has earned an unwanted target share.",
  (row) => `${row.manager} is now evaluating backups with the focus of a late-night infomercial viewer.`,
  () => "The lineup projection made a small, frightened noise.",
  (row) => `${row.manager}'s contingency plan has been upgraded from napkin to spreadsheet.`,
  () => "The availability outlook is cloudy with a chance of lineup tinkering.",
  (row) => `${row.manager} insists everything is fine, which is how everyone knows it is not fine.`,
  () => "The roster has unlocked an additional difficulty setting.",
  (row) => `${row.manager} is one practice report away from making a very creative decision.`,
  () => "The fantasy gods have submitted another support ticket.",
  (row) => `${row.manager}'s bench has been informed that this is not a drill.`,
];

function variantIndex(options, key) {
  let hash = 2166136261;
  for (const char of String(key)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % options.length;
}

function pickVariant(options, key) {
  return options[variantIndex(options, key)];
}

function pickUnusedVariant(options, key, usedIndexes) {
  let index = variantIndex(options, key);
  while (usedIndexes.has(index) && usedIndexes.size < options.length) {
    index = (index + 1) % options.length;
  }
  usedIndexes.add(index);
  return options[index];
}

function markActiveNav() {
  const links = document.querySelectorAll("[data-nav]");
  for (const a of links) {
    if (a.dataset.nav === page) a.classList.add("active");
  }
}

function renderError(message) {
  const slot = qs("#error-slot");
  if (!slot) return;
  slot.innerHTML = `<div class="error-box">${escapeHtml(message)}</div>`;
}

function renderLoading(msg = "Loading") {
  const slot = qs("#loading-slot");
  if (!slot) return;
  slot.innerHTML = `<div class="loading">${msg}</div>`;
}

function clearLoading() {
  const slot = qs("#loading-slot");
  if (slot) slot.innerHTML = "";
}

function managerNameFromRosterId(rosterId) {
  const roster = state.rostersById[String(rosterId)];
  if (!roster) return `Roster ${rosterId}`;
  const user = state.usersById[String(roster.owner_id)] || {};
  return user.display_name || user.username || `Roster ${rosterId}`;
}

function managerIdentityFromRosterId(rosterId, season = state) {
  const roster = season.rostersById?.[String(rosterId)] || {};
  const user = season.usersById?.[String(roster.owner_id)] || {};
  const name = user.display_name || user.username || `Roster ${rosterId}`;
  const customImage = MANAGER_IMAGES[String(user.user_id)] || MANAGER_IMAGES[name];
  return {
    name,
    image: customImage || getManagerAvatar(user.avatar),
  };
}

function parseRivalries() {
  return Array.isArray(RIVALRIES) ? RIVALRIES : [];
}

function parseTradeBlock() {
  return Array.isArray(ACTIVE_TRADE_BLOCK_IDS)
    ? ACTIVE_TRADE_BLOCK_IDS.map((x) => String(x)).filter((x) => /^\d+$/.test(x))
    : [];
}

async function loadBaseData() {
  if (!state.leagueId) throw new Error("League ID is not configured in assets/config.js");

  const nflState = await getNflState();
  const core = await getLeagueCore(state.leagueId);

  state.currentWeek = Number(nflState.week || 1);
  state.selectedWeek = state.currentWeek;
  state.league = core.league;
  state.users = core.users;
  state.rosters = core.rosters;
  state.rostersById = mapRosters(core.rosters);
  state.usersById = mapUsers(core.users);
  state.standings = computeStandings(core.rosters, state.usersById);

  const rosterPlayerIds = core.rosters.flatMap((roster) => safeArray(roster.players).map(String));
  const [playersById, currentWeekMatchups, currentTransactions, playerProjections] = await Promise.all([
    getPlayers(),
    getMatchups(state.leagueId, state.currentWeek),
    getTransactions(state.leagueId, state.currentWeek),
    page === "dashboard"
      ? getPlayerProjections(nflState.season || core.league?.season, state.currentWeek, rosterPlayerIds).catch(() => ({}))
      : Promise.resolve({}),
  ]);

  state.playersById = playersById;
  state.playerProjections = playerProjections;
  state.rosterProjections = buildRosterProjectionScores(
    state.rosters,
    playerProjections,
    state.league,
    playersById
  );
  state.playerValues = await getPlayerValues(playersById);
  state.weeklyMatchups = buildWeeklyMatchups(currentWeekMatchups, state.rostersById, state.usersById);
  state.weeklyTransactions = safeArray(currentTransactions);
}

async function loadHistoryData(maxSeasons = 4) {
  const history = await getLeagueHistory(state.leagueId, maxSeasons);
  const out = [];

  for (const season of history) {
    const usersById = mapUsers(season.users);
    const rostersById = mapRosters(season.rosters);
    const seasonState = {
      leagueId: season.leagueId,
      league: season.league,
      users: season.users,
      rosters: season.rosters,
      usersById,
      rostersById,
      standings: computeStandings(season.rosters, usersById),
      weekly: [],
      transactions: [],
      draftPicks: [],
      brackets: { winners: [], losers: [] },
    };

    const playoffsStart = playoffWeek(season.league);
    const maxWeek = season.leagueId === state.leagueId
      ? state.currentWeek
      : playoffsStart + 2;

    const weekRows = await Promise.all(
      Array.from({ length: maxWeek }, async (_, index) => {
        const week = index + 1;
        const [rawMatchups, tx] = await Promise.all([
          getMatchups(season.leagueId, week).catch(() => []),
          getTransactions(season.leagueId, week).catch(() => []),
        ]);
        return {
          week,
          games: buildWeeklyMatchups(rawMatchups, rostersById, usersById),
          transactions: safeArray(tx),
        };
      })
    );
    seasonState.weekly = weekRows.map(({ week, games }) => ({ week, games }));
    seasonState.transactions = weekRows.map(({ week, transactions }) => ({ week, items: transactions }));

    [seasonState.brackets, seasonState.draftPicks] = await Promise.all([
      getBrackets(season.leagueId),
      getDraftPicks(season.leagueId).catch(() => []),
    ]);
    out.push(seasonState);
  }

  state.history = out;
}

function renderLeagueIdentity() {
  text(qs("#league-name"), state.league?.name || "Fantasy League");
  text(qs("#league-season"), `${state.league?.season || ""} Season`);
  text(qs("#week-label"), `Week ${state.selectedWeek}`);
}

function renderStandings() {
  const tbody = qs("#standings-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  for (const row of state.standings) {
    const identity = managerIdentityFromRosterId(row.rosterId);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.rank}</td>
      <td><span class="manager-cell">${identity.image ? `<img class="manager-avatar" src="${escapeHtml(identity.image)}" alt="" loading="lazy" />` : ""}<span>${escapeHtml(row.manager)}</span></span></td>
      <td>${row.record}</td>
      <td>${n(row.pointsFor, 2)}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderMatchups() {
  const tbody = qs("#matchup-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!state.weeklyMatchups.some((game) => game.teams.length >= 2)) {
    tbody.innerHTML = '<tr><td class="empty-state" colspan="6">No matchup data is available for this week.</td></tr>';
    return;
  }

  for (const game of state.weeklyMatchups) {
    if (game.teams.length < 2) continue;
    const [a, b] = game.teams;
    const tr = document.createElement("tr");
    const scoreClass = state.selectedWeek === state.currentWeek ? "score-live" : "score-final";
    tr.innerHTML = `
      <td>${escapeHtml(a.manager)}</td>
      <td class="${scoreClass}">${n(a.points, 2)}</td>
      <td>vs</td>
      <td class="${scoreClass}">${n(b.points, 2)}</td>
      <td>${escapeHtml(b.manager)}</td>
      <td>${n(Math.abs(a.points - b.points), 2)}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderOverviewKpis(weeklyGamesByWeek = []) {
  const kpi = qs("#overview-kpi");
  if (!kpi) return;
  const playoff = playoffPicture(state.standings, state.league);
  const totalGames = state.standings.reduce((acc, s) => acc + s.wins + s.losses + s.ties, 0) / 2;
  const weekMax = Math.max(1, playoffWeek(state.league) - 1);
  const progress = Math.min(state.currentWeek, weekMax) / weekMax;

  kpi.innerHTML = `
    <div class="kpi"><div class="label">Teams</div><div class="value">${state.standings.length}</div></div>
    <div class="kpi"><div class="label">Games Played</div><div class="value">${Math.round(totalGames)}</div></div>
    <div class="kpi"><div class="label">Season Progress</div><div class="value">${pct(progress)}</div></div>
    <div class="kpi"><div class="label">Playoff Cut</div><div class="value">Top ${playoff.spots}</div></div>
  `;

  const playoffList = qs("#playoff-picture");
  if (!playoffList) return;
  const odds = calculatePlayoffOdds(
    state.standings,
    state.league,
    weeklyGamesByWeek,
    state.rosterProjections
  );
  const projectedTeams = Object.values(state.rosterProjections).filter(
    (projection) => projection.totalSlots && projection.projectedSlots / projection.totalSlots >= 0.6
  ).length;
  playoffList.innerHTML = `
    <div class="odds-heading">
      <h4>Estimated Playoff Odds</h4>
      <span>${projectedTeams ? `Sleeper lineups ${projectedTeams}/${state.standings.length} + 5,000 simulations` : "5,000 scoring-history simulations"}</span>
    </div>
    <div class="odds-list">
      ${odds.map((team) => {
        const identity = managerIdentityFromRosterId(team.rosterId);
        return `<div class="odds-row">
          <span class="manager-cell">${identity.image ? `<img class="manager-avatar" src="${escapeHtml(identity.image)}" alt="" loading="lazy" />` : ""}<span>${escapeHtml(team.manager)}</span></span>
          <span class="odds-track"><span style="width:${Math.max(2, team.odds * 100)}%"></span></span>
          <strong>${pct(team.odds, 1)}</strong>
        </div>`;
      }).join("")}
    </div>
  `;
}

function buildNewsItems() {
  const items = [];

  for (const row of parseRivalries()) {
    const [a, b] = String(row || "").split("|").map((x) => x.trim());
    if (!a || !b) continue;
    const matchup = state.weeklyMatchups.find((game) => {
      const names = game.teams.map((team) => team.manager.toLowerCase());
      return names.includes(a.toLowerCase()) && names.includes(b.toLowerCase());
    });
    if (matchup) {
      const first = matchup.teams.find((team) => team.manager.toLowerCase() === a.toLowerCase());
      const identity = managerIdentityFromRosterId(first?.rosterId);
      items.push({
        type: "Rivalry Alert",
        body: `${a} and ${b} collide in Week ${state.currentWeek}. ${pickVariant(RIVALRY_QUIPS, `${a}-${b}-${state.currentWeek}`)}`,
        image: identity.image,
        alt: `${a} manager avatar`,
      });
    }
  }

  const upsets = upsetCandidates(state.recapMatchups, state.standings).slice(0, 3);
  for (const u of upsets) {
    const underdog = state.standings.find((team) => team.manager === u.underdog);
    const identity = managerIdentityFromRosterId(underdog?.rosterId);
    items.push({
      type: `Week ${state.recapWeek} Upset`,
      body: `${u.underdog} took down ${u.favorite} by ${n(u.margin, 1)} points. ${pickVariant(UPSET_QUIPS, `${u.underdog}-${u.favorite}-${state.recapWeek}`)}`,
      image: identity.image,
      alt: `${u.underdog} manager avatar`,
    });
  }

  const stars = weeklyAllStars(state.recapMatchups.flatMap((g) => g.teams), state.playersById).slice(0, 5);
  for (const s of stars) {
    const player = state.playersById[s.playerId] || {};
    items.push({
      type: `Week ${state.recapWeek} All-Star`,
      body: `${s.pos}: ${s.playerName} detonated for ${n(s.score, 2)} points. ${pickVariant(STAR_QUIPS, `${s.playerId}-${state.recapWeek}`)}`,
      image: getPlayerHeadshot(s.playerId, player),
      alt: `${s.playerName} headshot`,
    });
  }

  const bustRows = [];
  for (const game of state.recapMatchups) {
    for (const team of game.teams) {
      for (const starterId of team.starters) {
        const player = state.playersById[starterId] || {};
        if (!["QB", "RB", "WR", "TE"].includes(String(player.position || "").toUpperCase())) continue;
        bustRows.push({
          playerId: starterId,
          manager: team.manager,
          name: player.full_name || starterId,
          points: Number(team.playersPoints?.[starterId] || 0),
        });
      }
    }
  }
  bustRows.sort((a, b) => a.points - b.points);
  for (const b of bustRows.slice(0, 4)) {
    const player = state.playersById[b.playerId] || {};
    items.push({
      type: `Week ${state.recapWeek} Bust`,
      body: `${b.name} produced ${n(b.points, 2)} points for ${b.manager}. ${pickVariant(BUST_QUIPS, `${b.playerId}-${b.manager}-${state.recapWeek}`)}`,
      image: getPlayerHeadshot(b.playerId, player),
      alt: `${b.name} headshot`,
    });
  }

  const recentTrades = state.weeklyTransactions.filter((t) => t.type === "trade").slice(0, 2);
  for (const t of recentTrades) {
    const managers = safeArray(t.roster_ids).map(managerNameFromRosterId).join(" and ");
    items.push({
      type: "Trade Wire",
      body: `${managers || "Two managers"} completed a trade at ${dateLabel(Number(t.status_updated || 0))}. ${pickVariant(TRADE_QUIPS, t.transaction_id)}`,
    });
  }

  const waivers = state.weeklyTransactions.filter((t) => t.type === "waiver").slice(0, 2);
  for (const w of waivers) {
    const manager = managerNameFromRosterId(w.roster_ids?.[0]);
    items.push({
      type: "Waiver Activity",
      body: `${manager} landed a waiver claim at ${dateLabel(Number(w.status_updated || 0))}. ${pickVariant(WAIVER_QUIPS, w.transaction_id)}`,
    });
  }

  const currentStarters = new Set(state.weeklyMatchups.flatMap((game) => game.teams.flatMap((team) => team.starters)));
  const injuryRows = state.rosters.flatMap((team) => safeArray(team.players).map((playerId) => {
    const player = state.playersById[playerId] || {};
    const status = String(player.injury_status || "").trim();
    return {
      playerId,
      player,
      status,
      manager: managerNameFromRosterId(team.roster_id),
      priority: (currentStarters.has(playerId) ? 100000 : 0) + Number(state.playerValues[playerId] || 0),
    };
  })).filter((row) => row.status && !["active", "healthy"].includes(row.status.toLowerCase()));
  injuryRows.sort((a, b) => b.priority - a.priority);
  const statusWithArticle = (status) => `${/^[aeiou]/i.test(status) ? "an" : "a"} ${status}`;
  const usedInjuryJabs = new Set();
  for (const row of injuryRows.slice(0, 6)) {
    const jab = pickUnusedVariant(
      INJURY_JABS,
      `${row.playerId}-${row.status}-${state.currentWeek}`,
      usedInjuryJabs
    );
    const playerName = row.player.full_name || row.playerId;
    items.push({
      type: "Injury Wire",
      body: `${playerName} picked up ${statusWithArticle(row.status)} tag. ${jab(row)}`,
      image: getPlayerHeadshot(row.playerId, row.player),
      alt: `${row.player.full_name || "Injured player"} headshot`,
    });
  }

  return items.slice(0, 26);
}

function renderNewsFeed() {
  const root = qs("#news-feed");
  if (!root) return;
  const items = buildNewsItems();
  root.innerHTML = "";

  if (!items.length) {
    root.innerHTML = "<div class=\"feed-item\"><p>No major league events yet this week.</p></div>";
    return;
  }

  for (const item of items) {
    const div = document.createElement("div");
    div.className = "feed-item";
    div.innerHTML = `${item.image ? `<img class="feed-image" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.alt || "")}" loading="lazy" />` : ""}<div class="feed-copy"><h4>${escapeHtml(item.type)}</h4><p>${escapeHtml(item.body)}</p></div>`;
    const image = qs(".feed-image", div);
    if (image) image.addEventListener("error", () => image.remove());
    root.appendChild(div);
  }
}

function renderWeeklyRecap() {
  const root = qs("#weekly-recap");
  if (!root) return;

  text(qs("#weekly-recap-title"), state.recapWeek ? `Week ${state.recapWeek} Recap` : "Weekly Recap");
  const summary = weeklySummary(state.recapMatchups);
  if (!summary.topScore) {
    root.innerHTML = "<p class=\"mini-note\">No completed week is available yet.</p>";
    return;
  }

  root.innerHTML = `
    <div class="card">
      <h4>Top Performance</h4>
      <p>${escapeHtml(summary.topScore.winner.manager)} posted ${n(summary.topScore.winner.points, 2)} points.</p>
    </div>
    <div class="card">
      <h4>Worst Performance</h4>
      <p>${escapeHtml(summary.worstScore.manager)} finished with ${n(summary.worstScore.points, 2)} points.</p>
    </div>
    <div class="card">
      <h4>Closest Battle</h4>
      <p>${escapeHtml(summary.closest.winner.manager)} over ${escapeHtml(summary.closest.loser.manager)} by ${n(summary.closest.margin, 2)}.</p>
    </div>
    <div class="card">
      <h4>Biggest Blowout</h4>
      <p>${escapeHtml(summary.blowout.winner.manager)} dominated ${escapeHtml(summary.blowout.loser.manager)} by ${n(summary.blowout.margin, 2)}.</p>
    </div>
    <div class="card">
      <h4>Other Results</h4>
      <ul>${summary.otherGames.map((game) => `<li>${escapeHtml(game.winner.manager)} over ${escapeHtml(game.loser.manager)}, ${n(game.winner.points, 2)}-${n(game.loser.points, 2)}</li>`).join("") || "<li>No other games.</li>"}</ul>
    </div>
  `;
}

function getSeasonPodium(season) {
  const rounds = safeArray(season.brackets?.winners);
  const final = rounds.find((row) => Number(row?.p) === 1);
  const thirdPlace = rounds.find((row) => Number(row?.p) === 3);
  const rosterIds = [final?.w, final?.l, thirdPlace?.w];
  return rosterIds.map((rosterId, index) => {
    if (!rosterId) return { place: index + 1, name: "N/A", image: "" };
    return { place: index + 1, ...managerIdentityFromRosterId(rosterId, season) };
  });
}

function renderLeagueHistory() {
  const root = qs("#league-history");
  if (!root) return;

  const completedSeasons = state.history.filter((season) => season.leagueId !== state.leagueId);
  if (!completedSeasons.length) {
    root.innerHTML = "<p class=\"mini-note\">No linked historical seasons available.</p>";
    return;
  }

  root.innerHTML = completedSeasons
    .map((season) => {
      const top = season.standings[0];
      const podium = getSeasonPodium(season);
      return `
        <div class="card">
          <h4>${escapeHtml(season.league?.season || "Unknown")} Season</h4>
          <div class="podium-list">${podium.map((manager) => `<div class="podium-row"><strong>${manager.place}</strong>${manager.image ? `<img class="manager-avatar" src="${escapeHtml(manager.image)}" alt="" loading="lazy" />` : ""}<span>${escapeHtml(manager.name)}</span></div>`).join("")}</div>
          <p>Regular Season Leader: ${top ? `${escapeHtml(top.manager)} (${top.record})` : "N/A"}</p>
        </div>
      `;
    })
    .join("");
}

function drawLineChart(canvas, labels, seriesList) {
  if (!canvas || !labels.length || !seriesList.length) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const pad = { t: 20, r: 20, b: 34, l: 40 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;

  const values = seriesList.flatMap((s) => s.values);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = max - min || 1;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#303030";

  for (let i = 0; i <= 4; i += 1) {
    const y = pad.t + (plotH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(w - pad.r, y);
    ctx.stroke();
  }

  for (let i = 0; i < labels.length; i += 1) {
    const x = pad.l + (plotW * i) / Math.max(1, labels.length - 1);
    if (i % Math.max(1, Math.ceil(labels.length / 8)) === 0 || i === labels.length - 1) {
      ctx.fillStyle = "#b4b4b4";
      ctx.font = "10px IBM Plex Mono";
      ctx.fillText(labels[i], x - 10, h - 12);
    }
  }

  for (const series of seriesList) {
    ctx.strokeStyle = series.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    series.values.forEach((value, idx) => {
      const x = pad.l + (plotW * idx) / Math.max(1, labels.length - 1);
      const y = pad.t + plotH - ((value - min) / range) * plotH;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
}

function drawBarChart(canvas, labels, values, color = "#ff4d00") {
  if (!canvas || !labels.length || !values.length) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const pad = { t: 16, r: 16, b: 48, l: 34 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;
  const max = Math.max(...values, 1);

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#303030";
  ctx.strokeRect(pad.l, pad.t, plotW, plotH);

  const barW = plotW / values.length;
  values.forEach((value, idx) => {
    const x = pad.l + idx * barW + 4;
    const bh = (value / max) * (plotH - 4);
    const y = pad.t + plotH - bh;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, Math.max(4, barW - 8), bh);

    ctx.fillStyle = "#b4b4b4";
    ctx.font = "9px IBM Plex Mono";
    ctx.fillText(labels[idx].slice(0, 6), x, h - 20);
  });
}

function renderAnalyticsCharts(weeklyGamesByWeek, perfRows, historicalWeeks = []) {
  const trendCanvas = qs("#trend-chart");
  const consistencyCanvas = qs("#consistency-chart");
  if (!trendCanvas || !consistencyCanvas) return;

  const labels = weeklyGamesByWeek.map((w) => `W${w.week}`);
  const leagueAvg = weeklyGamesByWeek.map((w) => {
    const scores = w.games.flatMap((g) => g.teams.map((t) => t.points));
    return average(scores);
  });
  const weeklyCeiling = weeklyGamesByWeek.map((w) => {
    const scores = w.games.flatMap((g) => g.teams.map((t) => t.points));
    return scores.length ? Math.max(...scores) : 0;
  });
  const historicalAverageByWeek = Object.fromEntries(historicalWeeks.map((weekly) => {
    const scores = weekly.games.flatMap((game) => game.teams.map((team) => team.points));
    return [weekly.week, average(scores)];
  }));
  const historicalLeagueAvg = weeklyGamesByWeek.map((weekly) => historicalAverageByWeek[weekly.week] || 0);

  drawLineChart(trendCanvas, labels, [
    { color: "#ffbf00", values: leagueAvg },
    { color: "#ff4d00", values: weeklyCeiling },
    { color: "#e8dfc8", values: historicalLeagueAvg },
  ]);

  const topConsistency = [...perfRows]
    .sort((a, b) => b.consistency - a.consistency)
    .slice(0, 8);
  drawBarChart(
    consistencyCanvas,
    topConsistency.map((r) => r.manager),
    topConsistency.map((r) => r.consistency),
    "#35d07f"
  );
}

function collectAllTimeTradeAnalytics() {
  const uniqueTrades = new Map();
  const allDraftPicks = state.history.flatMap((season) => safeArray(season.draftPicks));

  for (const season of state.history) {
    const transactions = safeArray(season.transactions).flatMap((weekly) => safeArray(weekly.items));
    const seasonTrades = collectTrades(
      transactions,
      season.usersById,
      season.rostersById,
      state.playersById,
      state.playerValues,
      allDraftPicks,
      season.league?.season,
      season.leagueId
    ).ranked;
    for (const trade of seasonTrades) uniqueTrades.set(trade.transactionId, trade);
  }

  const ranked = [...uniqueTrades.values()]
    .sort((a, b) => a.imbalance - b.imbalance)
    .map((trade, index) => ({ ...trade, allTimeRank: index + 1 }));

  return {
    ranked,
    best: ranked[0] || null,
    worst: ranked[ranked.length - 1] || null,
  };
}

function tradePartyIdentity(party) {
  const customImage = MANAGER_IMAGES[String(party.ownerId)] || MANAGER_IMAGES[party.manager];
  return {
    name: party.manager,
    image: customImage || getManagerAvatar(party.avatarId),
  };
}

function renderTradeCards(trades) {
  return safeArray(trades).map((trade) => `
    <article class="trade-log-card">
      <header class="trade-log-header">
        <div><span class="trade-rank">#${trade.allTimeRank}</span><span>${escapeHtml(trade.season)} season · ${escapeHtml(dateLabel(trade.statusUpdated))}</span></div>
        <div class="imbalance-value"><span>Imbalance</span><strong>${n(trade.imbalance, 0)}</strong></div>
      </header>
      <div class="trade-parties">
        ${trade.parties.map((party) => {
          const identity = tradePartyIdentity(party);
          return `<section class="trade-party">
            <div class="trade-manager">
              ${identity.image ? `<img class="manager-avatar trade-manager-avatar" src="${escapeHtml(identity.image)}" alt="" loading="lazy" />` : ""}
              <div><span>Received by</span><strong>${escapeHtml(identity.name)}</strong></div>
              <b>${n(party.inValue, 0)}</b>
            </div>
            <div class="trade-assets">
              ${party.assetsIn.map((asset) => {
                if (asset.type === "pick") {
                  return `<div class="trade-asset pick-asset"><div class="pick-mark"><span class="pick-year">${escapeHtml(asset.season)}</span><span class="pick-round">R${asset.round}</span></div><div><strong>Future draft pick</strong><span>Estimated value ${n(asset.value, 0)}</span></div></div>`;
                }
                const player = state.playersById[asset.playerId] || {};
                const pickLabel = asset.type === "used-pick"
                  ? `<span class="pick-origin"><b class="pick-year">${escapeHtml(asset.season)}</b> <b class="pick-round">R${asset.round}</b> became</span>`
                  : "";
                return `<div class="trade-asset player-asset"><img src="${escapeHtml(getPlayerHeadshot(asset.playerId, player))}" alt="${escapeHtml(asset.name)}" loading="lazy" /><div>${pickLabel}<strong>${escapeHtml(asset.name)}</strong><span>${escapeHtml(asset.position)} · Value ${n(asset.value, 0)}</span></div></div>`;
              }).join("") || '<div class="mini-note">No valued assets recorded.</div>'}
            </div>
          </section>`;
        }).join("")}
      </div>
    </article>`).join("");
}

async function initDashboard() {
  const picker = qs("#week-picker");
  if (picker) {
    picker.innerHTML = Array.from(
      { length: Math.max(1, state.currentWeek) },
      (_, index) => `<option value="${index + 1}">Week ${index + 1}${index + 1 === state.currentWeek ? " - Current" : ""}</option>`
    ).join("");
    picker.value = String(state.currentWeek);
    picker.addEventListener("change", async () => {
      const week = Number(picker.value || state.currentWeek);
      picker.disabled = true;
      renderLoading(`Loading Week ${week}`);
      try {
        const [matchups, transactions] = await Promise.all([
          getMatchups(state.leagueId, week),
          getTransactions(state.leagueId, week),
        ]);
        state.selectedWeek = week;
        state.weeklyMatchups = buildWeeklyMatchups(matchups, state.rostersById, state.usersById);
        state.weeklyTransactions = safeArray(transactions);
        renderLeagueIdentity();
        renderMatchups();
        text(qs("#sync-label"), week === state.currentWeek ? "Live Sleeper data synced" : `Archive loaded / Week ${week}`);
      } catch (error) {
        renderError(`Week ${week} could not be loaded: ${error.message}`);
      } finally {
        picker.disabled = false;
        clearLoading();
      }
    });
  }

  renderOverviewKpis();
  renderStandings();
  renderMatchups();
  qs("#news-feed").innerHTML = '<div class="loading">Building the league wire</div>';
  qs("#weekly-recap").innerHTML = '<div class="loading">Loading latest completed week</div>';
  text(qs("#sync-label"), "Live Sleeper data synced");

  await loadHistoryData(8);
  const currentSeason = state.history.find((season) => season.leagueId === state.leagueId);
  const completedWeeks = safeArray(currentSeason?.weekly).filter(
    (weekly) => weekly.week < state.currentWeek && weeklySummary(weekly.games).topScore
  );
  const latestCompleted = completedWeeks[completedWeeks.length - 1];
  state.recapWeek = Number(latestCompleted?.week || 0);
  state.recapMatchups = safeArray(latestCompleted?.games);
  renderOverviewKpis(completedWeeks);
  renderNewsFeed();
  renderWeeklyRecap();
  renderLeagueHistory();

  setInterval(async () => {
    if (state.selectedWeek !== state.currentWeek) return;
    try {
      const live = await getMatchups(state.leagueId, state.currentWeek);
      state.weeklyMatchups = buildWeeklyMatchups(live, state.rostersById, state.usersById);
      renderMatchups();
    } catch {
      // Ignore periodic polling failures.
    }
  }, 60 * 1000);
}

async function initAnalyticsPage() {
  renderLoading("Crunching advanced metrics");

  await loadHistoryData(50);

  const weeklyGamesByWeek = [];
  const maxWeek = Math.max(state.currentWeek, playoffWeek(state.league) - 1);

  const weekRows = await Promise.all(
    Array.from({ length: maxWeek }, async (_, index) => {
      const week = index + 1;
      const rawGames = await getMatchups(state.leagueId, week).catch(() => []);
      return {
        week,
        games: buildWeeklyMatchups(rawGames, state.rostersById, state.usersById),
      };
    })
  );
  weeklyGamesByWeek.push(...weekRows.map(({ week, games }) => ({ week, games })));

  const completedWeeks = weeklyGamesByWeek.filter((weekly) => (
    weekly.week < state.currentWeek
    && weekly.games.length > 0
    && weekly.games.every((game) => game.teams.length >= 2 && game.teams.some((team) => team.points !== 0))
  ));
  const currentHistory = state.history.find((season) => season.leagueId === state.leagueId);
  state.draftPicks = safeArray(currentHistory?.draftPicks);
  state.tradeAnalytics = collectAllTimeTradeAnalytics();
  const composition = teamCompositionMetrics(state.rosters, state.playersById, state.usersById);
  const ages = ageMetrics(state.rosters, state.playersById, state.usersById);
  const perf = buildPerformanceMetrics(completedWeeks, state.standings, state.currentWeek);

  const allGames = completedWeeks.flatMap((w) => w.games).filter((g) => g.teams.length >= 2);
  const sortedByMarginAsc = [...allGames].sort(
    (a, b) => Math.abs(a.teams[0].points - a.teams[1].points) - Math.abs(b.teams[0].points - b.teams[1].points)
  );
  const sortedByMarginDesc = [...allGames].sort(
    (a, b) => Math.abs(b.teams[0].points - b.teams[1].points) - Math.abs(a.teams[0].points - a.teams[1].points)
  );
  const rankByRoster = Object.fromEntries(state.standings.map((s) => [s.rosterId, s.rank]));
  const playoffStart = playoffWeek(state.league);
  let biggestFumble = null;

  for (const weekly of weeklyGamesByWeek) {
    if (weekly.week < playoffStart) continue;
    for (const game of weekly.games) {
      if (game.teams.length < 2) continue;
      const [a, b] = game.teams;
      const aFavored = (rankByRoster[a.rosterId] || 99) < (rankByRoster[b.rosterId] || 99);
      const favored = aFavored ? a : b;
      const underdog = aFavored ? b : a;
      if (underdog.points <= favored.points) continue;
      const margin = underdog.points - favored.points;
      if (!biggestFumble || margin > biggestFumble.margin) {
        biggestFumble = { week: weekly.week, favored, underdog, margin };
      }
    }
  }

  const overview = qs("#analytics-overview");
  if (overview) {
    overview.innerHTML = `
      <div class="card"><h4>Most NFL Teams Represented</h4><p>${composition.mostRepresented?.manager || "N/A"} with ${composition.mostRepresented?.teamCount || 0} teams.</p></div>
      <div class="card"><h4>Most Even Trade (All Time)</h4><p>${state.tradeAnalytics.best ? `${state.tradeAnalytics.best.parties.map((party) => escapeHtml(party.manager)).join(" / ")} — ${n(state.tradeAnalytics.best.imbalance, 0)} imbalance` : "No trades found."}</p></div>
      <div class="card"><h4>Most Lopsided Trade (All Time)</h4><p>${state.tradeAnalytics.worst ? `${state.tradeAnalytics.worst.parties.map((party) => escapeHtml(party.manager)).join(" / ")} — ${n(state.tradeAnalytics.worst.imbalance, 0)} imbalance` : "No trades found."}</p></div>
      <div class="card"><h4>League Age Snapshot</h4><p>Youngest average roster: ${ages.length ? ages[ages.length - 1].manager : "N/A"}. Oldest: ${ages[0]?.manager || "N/A"}.</p></div>
      <div class="card"><h4>Closest Recorded Matchups</h4><p>${sortedByMarginAsc.slice(0, 5).map((g) => `${g.teams[0].manager} vs ${g.teams[1].manager} (${n(Math.abs(g.teams[0].points - g.teams[1].points), 2)})`).join(" | ") || "No matchups yet."}</p></div>
      <div class="card"><h4>Biggest Blowouts</h4><p>${sortedByMarginDesc.slice(0, 5).map((g) => `${g.teams[0].manager} vs ${g.teams[1].manager} (${n(Math.abs(g.teams[0].points - g.teams[1].points), 2)})`).join(" | ") || "No matchups yet."}</p></div>
      <div class="card"><h4>Biggest Playoff Fumble</h4><p>${biggestFumble ? `Week ${biggestFumble.week}: ${biggestFumble.favored.manager} was upset by ${biggestFumble.underdog.manager} by ${n(biggestFumble.margin, 2)}.` : "No playoff upsets found."}</p></div>
    `;
  }

  const compositionBody = qs("#composition-body");
  if (compositionBody) {
    compositionBody.innerHTML = composition.byTeam
      .map((row) => `<tr><td>${escapeHtml(row.manager)}</td><td>${escapeHtml(row.mostCommon[0])} (${row.mostCommon[1]})</td><td>${escapeHtml(row.leastCommon[0])} (${row.leastCommon[1]})</td><td>${row.teamCount}</td><td>${n(row.diversityIndex, 3)}</td></tr>`)
      .join("");
  }

  const tradeBoard = qs("#trade-board");
  if (tradeBoard) {
    tradeBoard.innerHTML = renderTradeCards(state.tradeAnalytics.ranked);
    text(qs("#trade-summary-count"), `${state.tradeAnalytics.ranked.length} trades`);
  }

  const ageBody = qs("#age-body");
  if (ageBody) {
    ageBody.innerHTML = ages
      .map((row) => `<tr><td>${escapeHtml(row.manager)}</td><td>${n(row.averageAge, 2)}</td><td>${n(row.rooms.QB, 2)}</td><td>${n(row.rooms.RB, 2)}</td><td>${n(row.rooms.WR, 2)}</td><td>${n(row.rooms.TE, 2)}</td><td>${n(row.rooms.DEF, 2)}</td></tr>`)
      .join("");
  }

  const perfBody = qs("#performance-body");
  if (perfBody) {
    perfBody.innerHTML = perf
      .map((row) => `<tr><td>${escapeHtml(row.manager)}</td><td>${n(row.consistency, 1)}</td><td>${n(row.ceiling, 2)}</td><td>${n(row.floor, 2)}</td><td>${n(row.luck, 0)}</td><td>${n(row.completedSchedule, 2)} opp. PPG</td><td>${row.remainingSchedule ? `Avg rank ${n(row.remainingSchedule, 1)}` : "TBD"}</td></tr>`)
      .join("");
  }

  const historical2025 = state.history.find((season) => String(season.league?.season) === "2025");
  const historical2025Weeks = safeArray(historical2025?.weekly).filter((weekly) => (
    weekly.games.length > 0
    && weekly.games.every((game) => game.teams.length >= 2 && game.teams.some((team) => team.points !== 0))
  ));
  renderAnalyticsCharts(completedWeeks, perf, historical2025Weeks);
  clearLoading();
}

function buildManagerSelect() {
  const select = qs("#manager-select");
  if (!select) return;
  select.innerHTML = `<option value="">Select manager</option>`;
  for (const s of state.standings) {
    const option = document.createElement("option");
    option.value = s.ownerId;
    option.textContent = s.manager;
    select.appendChild(option);
  }
}

function managerSeasonLine(ownerId, seasonBundle) {
  const row = seasonBundle.standings.find((x) => x.ownerId === String(ownerId));
  if (!row) return null;
  return `${seasonBundle.league?.season}: ${row.record}, PF ${n(row.pointsFor, 2)}, finish #${row.rank}`;
}

function renderManagerDetails(ownerId) {
  const out = qs("#manager-output");
  if (!out || !ownerId) return;

  const myWeeklyScores = [];
  const allStartSamples = [];
  let allTimeWins = 0;
  let allTimeLosses = 0;
  let allTimeTies = 0;

  for (const season of state.history) {
    const seasonRoster = season.rosters.find((roster) => String(roster.owner_id) === String(ownerId));
    if (!seasonRoster) continue;
    for (const weekly of season.weekly) {
      for (const game of weekly.games) {
        const team = game.teams.find((row) => String(row.rosterId) === String(seasonRoster.roster_id));
        const opponent = game.teams.find((row) => String(row.rosterId) !== String(seasonRoster.roster_id));
        if (!team || !opponent) continue;
        if (team.points === 0 && opponent.points === 0) continue;
        myWeeklyScores.push(team.points);
        if (team.points > opponent.points) allTimeWins += 1;
        else if (team.points < opponent.points) allTimeLosses += 1;
        else allTimeTies += 1;
        for (const starterId of team.starters) {
          allStartSamples.push({
            playerId: starterId,
            points: Number(team.playersPoints?.[starterId] || 0),
          });
        }
      }
    }
  }

  const groupedStarts = {};
  for (const row of allStartSamples) {
    if (!groupedStarts[row.playerId]) groupedStarts[row.playerId] = [];
    groupedStarts[row.playerId].push(row.points);
  }

  const playerAverages = Object.entries(groupedStarts)
    .map(([pid, scores]) => ({
      playerId: pid,
      name: state.playersById[pid]?.full_name || pid,
      avg: average(scores),
      games: scores.length,
    }))
    .filter((player) => player.games >= 5)
    .sort((a, b) => b.avg - a.avg);

  const playoffs = managerAwards(state.history, ownerId);
  const tradeProfile = managerTradeProfile(state.tradeAnalytics.ranked, ownerId);
  const tradeRanking = managerTradeRankings(state.tradeAnalytics.ranked)
    .find((row) => row.ownerId === String(ownerId));
  const managerTrades = state.tradeAnalytics.ranked
    .filter((trade) => trade.parties.some((party) => party.ownerId === String(ownerId)))
    .sort((a, b) => b.statusUpdated - a.statusUpdated);
  const seasonHistoryLines = state.history.map((h) => managerSeasonLine(ownerId, h)).filter(Boolean);
  const seasonalPlacements = state.history
    .map((h) => h.standings.find((x) => x.ownerId === String(ownerId))?.rank)
    .filter((x) => Number.isFinite(Number(x)))
    .map((x) => Number(x));
  const avgPlacement = average(seasonalPlacements);

  const myDraftPicks = state.draftPicks.filter((p) => String(p.picked_by || "") === String(ownerId));
  const gradedPicks = myDraftPicks
    .map((p) => {
      const round = Number(p.round || 1);
      const pickNo = Number(p.pick_no || 1);
      const expected = Math.max(80, 980 - round * 120 - pickNo * 2);
      const actual = Number(state.playerValues[String(p.player_id || "")] || 0);
      const diff = actual - expected;
      return {
        round,
        name: state.playersById[String(p.player_id || "")]?.full_name || p.metadata?.first_name || p.player_id || "Unknown",
        diff,
      };
    })
    .sort((a, b) => b.diff - a.diff);
  const bestDraftPick = gradedPicks[0] || null;
  const worstDraftPick = gradedPicks.length > 1 ? gradedPicks[gradedPicks.length - 1] : null;

  const lineupMisses = [];
  const currentSeason = state.history[0];
  if (currentSeason) {
    const ownerToRoster = {};
    for (const r of currentSeason.rosters) ownerToRoster[String(r.owner_id)] = String(r.roster_id);
    const targetRosterId = ownerToRoster[String(ownerId)];
    for (const week of currentSeason.weekly) {
      for (const game of week.games) {
        const team = game.teams.find((t) => t.rosterId === targetRosterId);
        if (!team) continue;

        const starters = new Set(team.starters.map(String));
        const starterRows = team.starters.map((pid) => ({ pid, points: Number(team.playersPoints?.[pid] || 0) }));
        const benchRows = team.players
          .filter((pid) => !starters.has(String(pid)))
          .map((pid) => ({ pid, points: Number(team.playersPoints?.[pid] || 0) }));
        if (!starterRows.length || !benchRows.length) continue;

        const lowestStarter = starterRows.sort((a, b) => a.points - b.points)[0];
        const bestBench = benchRows.sort((a, b) => b.points - a.points)[0];
        if (bestBench.points > lowestStarter.points) {
          lineupMisses.push({
            week: week.week,
            bench: state.playersById[bestBench.pid]?.full_name || bestBench.pid,
            starter: state.playersById[lowestStarter.pid]?.full_name || lowestStarter.pid,
            missed: bestBench.points - lowestStarter.points,
          });
        }
      }
    }
  }
  lineupMisses.sort((a, b) => b.missed - a.missed);

  const h2hLines = state.standings
    .filter((s) => s.ownerId !== String(ownerId))
    .map((opp) => {
      let wins = 0;
      let losses = 0;
      for (const season of state.history) {
        const ownerToRoster = {};
        for (const r of season.rosters) ownerToRoster[String(r.owner_id)] = String(r.roster_id);
        const myR = ownerToRoster[String(ownerId)];
        const opR = ownerToRoster[String(opp.ownerId)];
        if (!myR || !opR) continue;
        for (const weekly of season.weekly) {
          for (const game of weekly.games) {
            if (game.teams.length < 2) continue;
            const me = game.teams.find((t) => t.rosterId === myR);
            const them = game.teams.find((t) => t.rosterId === opR);
            if (!me || !them) continue;
            if (me.points > them.points) wins += 1;
            if (me.points < them.points) losses += 1;
          }
        }
      }
      return `<li>${opp.manager}: ${wins}-${losses}</li>`;
    })
    .join("");

  out.innerHTML = `
    <div class="grid-2">
      <div class="card">
        <h4>Historical Performance</h4>
        <p>${seasonHistoryLines.join(" | ") || "No history found."}</p>
        <p>All-Time Record: ${allTimeWins}-${allTimeLosses}${allTimeTies ? `-${allTimeTies}` : ""}</p>
        <p>All-time average weekly points: ${n(average(myWeeklyScores), 2)}</p>
        <p>Average End-of-Year Placement: ${n(avgPlacement, 2)}</p>
      </div>
      <div class="card">
        <h4>Awards</h4>
        <p>Championships: ${playoffs.championships}</p>
        <p>Regular Season Titles: ${playoffs.regularSeasonTitles}</p>
        <p>Playoff Appearances: ${playoffs.playoffApps}</p>
        <p>Biggest Blowout Margin: ${n(playoffs.biggestBlowout, 2)}</p>
      </div>
      <div class="card">
        <h4>Most Valuable Starters</h4>
        <ul>${playerAverages.slice(0, 5).map((p) => `<li>${p.name}: ${n(p.avg, 2)} avg (${p.games} starts)</li>`).join("") || "<li>No players with at least 5 starts.</li>"}</ul>
      </div>
      <div class="card">
        <h4>Most Detrimental Starters</h4>
        <ul>${playerAverages.slice(-5).map((p) => `<li>${p.name}: ${n(p.avg, 2)} avg (${p.games} starts)</li>`).join("") || "<li>No players with at least 5 starts.</li>"}</ul>
      </div>
      <div class="card">
        <h4>Best Draft Pick</h4>
        <ul>${bestDraftPick ? `<li>R${bestDraftPick.round} ${bestDraftPick.name}: ${n(bestDraftPick.diff, 0)} value above slot</li>` : "<li>No draft pick data.</li>"}</ul>
      </div>
      <div class="card">
        <h4>Worst Draft Pick</h4>
        <ul>${worstDraftPick ? `<li>R${worstDraftPick.round} ${worstDraftPick.name}: ${n(worstDraftPick.diff, 0)} value vs slot</li>` : "<li>Not enough draft pick data.</li>"}</ul>
      </div>
      <div class="card">
        <h4>All-Time Trading Profile</h4>
        <p>Trade Quality Rank: ${tradeRanking ? `#${tradeRanking.rank} of ${tradeRanking.fieldSize}` : "Not ranked"}</p>
        <p>Total Trades: ${tradeProfile.tradeFrequency}</p>
        <p>Trade Success Rate: ${pct(tradeProfile.tradeSuccessRate, 1)}</p>
        <p>Average Net Current Value: ${n(tradeProfile.avgValueDiff, 1)}</p>
        <p class="mini-note">${TRADE_RANKING_DESCRIPTION}</p>
      </div>
      <div class="card">
        <h4>Head-to-Head Matrix</h4>
        <ul>${h2hLines || "<li>No H2H data.</li>"}</ul>
      </div>
      <div class="card">
        <h4>Worst Lineup Decisions</h4>
        <ul>${lineupMisses.slice(0, 5).map((m) => `<li>W${m.week}: Started ${m.starter} over ${m.bench} (missed ${n(m.missed, 2)})</li>`).join("") || "<li>No major missed decisions found.</li>"}</ul>
      </div>
    </div>
    <section class="manager-trade-history">
      <h3 class="panel-title">All Trades Involving This Manager</h3>
      <p class="metric-explainer">Each card keeps its all-time balance rank from the league trade log. Trades are listed newest first for this manager.</p>
      <details class="trade-drawer" open>
        <summary><span>Trade Log</span><span class="trade-summary-count">${managerTrades.length} trades</span></summary>
        <div class="trade-scroll"><div class="trade-board">${renderTradeCards(managerTrades) || '<p class="mini-note">No recorded trades found for this manager.</p>'}</div></div>
      </details>
    </section>
  `;
}

async function initManagersPage() {
  renderLoading("Loading manager histories");
  await loadHistoryData(50);
  const currentHistory = state.history.find((season) => season.leagueId === state.leagueId);
  state.draftPicks = safeArray(currentHistory?.draftPicks);
  state.tradeAnalytics = collectAllTimeTradeAnalytics();
  buildManagerSelect();

  const select = qs("#manager-select");
  if (select) {
    select.addEventListener("change", () => renderManagerDetails(select.value));
    if (state.standings[0]) {
      select.value = state.standings[0].ownerId;
      renderManagerDetails(select.value);
    }
  }

  clearLoading();
}

function buildPlayerSearch() {
  const input = qs("#player-search");
  const out = qs("#player-results");
  if (!input || !out) return;

  function runSearch() {
    const q = input.value.trim().toLowerCase();
    out.innerHTML = "";
    if (q.length < 2) return;

    const hits = Object.entries(state.playersById)
      .filter(([, p]) => String(p.full_name || "").toLowerCase().includes(q))
      .slice(0, 25);

    for (const [pid, p] of hits) {
      const row = document.createElement("button");
      row.className = "search-result";
      row.textContent = `${p.full_name || pid} (${p.position || ""} - ${p.team || ""})`;
      row.addEventListener("click", () => renderPlayerProfile(pid));
      out.appendChild(row);
    }
  }

  input.addEventListener("input", runSearch);
  runSearch();
}

function renderPlayerProfile(playerId) {
  const out = qs("#player-output");
  if (!out) return;

  const player = state.playersById[playerId] || {};
  const started = playerStartedStats(
    state.history,
    playerId,
    (season, rosterId) => {
      const roster = season.rostersById[String(rosterId)] || {};
      const user = season.usersById[String(roster.owner_id)] || {};
      return user.display_name || user.username || `Roster ${rosterId}`;
    }
  );

  const ownership = playerOwnershipTimeline(state.history, playerId);
  const sourceName = /^\d+$/.test(String(player.espn_id || "")) ? "ESPN" : "Sleeper";

  out.innerHTML = `
    <div class="grid-2">
      <div class="card">
        <h4>${escapeHtml(player.full_name || playerId)}</h4>
        <p>${escapeHtml(player.position || "")} | ${escapeHtml(player.team || "")}</p>
        <img class="player-headshot" data-player-headshot src="${getPlayerHeadshot(playerId, player)}" alt="${escapeHtml(player.full_name || "Player")} headshot" width="180" height="130" loading="lazy" />
        <p class="mini-note">Headshot source: ${sourceName} public CDN.</p>
      </div>
      <div class="card">
        <h4>Performance When Started</h4>
        <p>Starts: ${started.startedCount}</p>
        <p>Average Points: ${n(started.averagePoints, 2)}</p>
        <p>Record: ${started.wins}-${started.losses}</p>
      </div>
      <div class="card">
        <h4>Weekly Trends</h4>
        <ul>${started.trends.slice(-12).map((t) => `<li>${escapeHtml(t.season)} W${t.week}: ${escapeHtml(t.manager)} scored ${n(t.points, 2)} vs ${escapeHtml(t.opponent || "unknown")}</li>`).join("") || "<li>No trend data.</li>"}</ul>
      </div>
      <div class="card">
        <h4>Ownership + Trade Trail</h4>
        <ul>${ownership.slice(-12).map((o) => `<li>${o.season} W${o.week}: add ${o.addRoster || "-"} / drop ${o.dropRoster || "-"}</li>`).join("") || "<li>No ownership movement data.</li>"}</ul>
      </div>
    </div>
  `;

  const headshot = qs("[data-player-headshot]", out);
  if (headshot) headshot.addEventListener("error", () => { headshot.hidden = true; });
}

async function initPlayerPage() {
  renderLoading("Building player history");
  await loadHistoryData(8);
  buildPlayerSearch();
  clearLoading();
}

function renderTradeBlockPage() {
  const root = qs("#trade-block-root");
  if (!root) return;

  const rankings = tradeBlockRankings(
    state.rosters,
    state.playersById,
    state.playerValues,
    state.standings,
    state.usersById
  );

  const activeBlock = parseTradeBlock();
  const valueMap = Object.fromEntries(rankings.map((r) => [r.playerId, r]));
  const filtered = activeBlock.length
    ? activeBlock
        .map((pid) => {
          const fromRank = valueMap[String(pid)];
          if (fromRank) return fromRank;

          const ownerRoster = state.rosters.find((r) => safeArray(r.players).includes(String(pid)));
          return {
            playerId: String(pid),
            playerName: state.playersById[String(pid)]?.full_name || String(pid),
            position: state.playersById[String(pid)]?.position || "N/A",
            owner: ownerRoster ? managerNameFromRosterId(ownerRoster.roster_id) : "Unknown",
            value: Number(state.playerValues[String(pid)] || 0),
            bestFitManager: "Unknown",
          };
        })
        .sort((a, b) => b.value - a.value)
    : rankings;

  root.innerHTML = filtered
    .map(
      (row, idx) => `
      <article class="card trade-card">
        <div class="trade-rank">#${idx + 1}</div>
        <h4>${escapeHtml(row.playerName)} (${escapeHtml(row.position)})</h4>
        <p>Current Manager: ${escapeHtml(row.owner)}</p>
        <p>Desirability Score: ${n(row.value, 0)}</p>
        <div class="fit-callout">Strongest fit: ${escapeHtml(row.bestFitManager)}</div>
      </article>
    `
    )
    .join("");
}

function initStaticConfigPanels() {
  const leaguePinned = qs("#league-id-pinned");
  if (leaguePinned) leaguePinned.textContent = state.leagueId;

  const rivalryList = qs("#rivalry-list");
  if (rivalryList) {
    const rivalries = parseRivalries();
    if (!rivalries.length) rivalryList.closest(".card")?.remove();
    else rivalryList.innerHTML = rivalries.map((r) => `<li>${escapeHtml(r)}</li>`).join("");
  }

  const tradeList = qs("#trade-block-list");
  if (tradeList) {
    const ids = parseTradeBlock();
    tradeList.innerHTML = ids.map((pid) => `<li>${state.playersById[String(pid)]?.full_name || pid}</li>`).join("") || "<li>No active trade block players configured in code.</li>";
  }
}

async function boot() {
  markActiveNav();

  if (!state.leagueId) {
    renderLoading("League ID is not configured in assets/config.js.");
    return;
  }

  renderLoading("Syncing Sleeper data");

  try {
    await loadBaseData();
    renderLeagueIdentity();
    initStaticConfigPanels();
    clearLoading();

    if (page === "dashboard") await initDashboard();
    if (page === "analytics") await initAnalyticsPage();
    if (page === "managers") await initManagersPage();
    if (page === "players") await initPlayerPage();
    if (page === "trade-block") renderTradeBlockPage();
  } catch (error) {
    clearLoading();
    renderError(`Data load failed: ${error.message}`);
  }
}

boot();
