import { average, byDesc, compareStr, groupBy, playoffWeek, safeArray, sum, unique } from "./utils.js";

export function mapUsers(users) {
  const map = {};
  for (const user of safeArray(users)) {
    map[String(user.user_id)] = user;
  }
  return map;
}

export function mapRosters(rosters) {
  const map = {};
  for (const roster of safeArray(rosters)) {
    map[String(roster.roster_id)] = roster;
  }
  return map;
}

export function getManagerName(roster, usersById) {
  const user = usersById[String(roster.owner_id)] || {};
  return user.display_name || user.username || `Roster ${roster.roster_id}`;
}

export function computeStandings(rosters, usersById) {
  return safeArray(rosters)
    .map((roster) => {
      const wins = Number(roster.settings?.wins || 0);
      const losses = Number(roster.settings?.losses || 0);
      const ties = Number(roster.settings?.ties || 0);
      const pointsFor = Number(roster.settings?.fpts || 0) + Number(roster.settings?.fpts_decimal || 0) / 100;
      return {
        rosterId: String(roster.roster_id),
        ownerId: String(roster.owner_id || ""),
        manager: getManagerName(roster, usersById),
        wins,
        losses,
        ties,
        pointsFor,
        record: `${wins}-${losses}${ties ? `-${ties}` : ""}`,
      };
    })
    .sort((a, b) => (b.wins - a.wins) || (b.pointsFor - a.pointsFor) || compareStr(a.manager, b.manager))
    .map((row, idx) => ({ ...row, rank: idx + 1 }));
}

export function buildWeeklyMatchups(matchups, rostersById, usersById) {
  const grouped = groupBy(safeArray(matchups), (m) => String(m.matchup_id));
  const rows = [];

  for (const matchupId of Object.keys(grouped)) {
    const teams = grouped[matchupId]
      .map((m) => {
        const roster = rostersById[String(m.roster_id)] || {};
        return {
          rosterId: String(m.roster_id),
          manager: getManagerName(roster, usersById),
          points: Number(m.points || 0),
          starters: safeArray(m.starters),
          players: safeArray(m.players),
          playersPoints: m.players_points || {},
        };
      })
      .sort((a, b) => b.points - a.points);

    rows.push({ matchupId, teams });
  }

  return rows;
}

export function playoffPicture(standings, league) {
  const spots = Number(league?.settings?.playoff_teams || 6);
  return { spots };
}

function scoreProjectedPlayer(projection, scoringSettings, position) {
  const stats = projection?.stats || {};
  let score = 0;
  let matchedStats = 0;

  for (const [setting, multiplier] of Object.entries(scoringSettings || {})) {
    const stat = Number(stats[setting]);
    if (!Number.isFinite(stat) || !Number.isFinite(Number(multiplier))) continue;
    score += stat * Number(multiplier);
    matchedStats += 1;
  }

  const receptions = Number(stats.rec || 0);
  const positionBonus = Number(scoringSettings?.[`bonus_rec_${String(position || "").toLowerCase()}`] || 0);
  score += receptions * positionBonus;

  if (!matchedStats) return Number(stats.pts_ppr || stats.pts_half_ppr || stats.pts_std || 0);
  return score;
}

export function eligibleForSlot(position, slot) {
  const pos = String(position || "").toUpperCase();
  const target = String(slot || "").toUpperCase();
  if (pos === target || (pos === "DST" && target === "DEF")) return true;
  if (target === "FLEX") return ["RB", "WR", "TE"].includes(pos);
  if (target === "SUPER_FLEX") return ["QB", "RB", "WR", "TE"].includes(pos);
  if (target === "REC_FLEX") return ["WR", "TE"].includes(pos);
  if (target === "WRRB_FLEX") return ["RB", "WR"].includes(pos);
  return false;
}

export function buildRosterProjectionScores(rosters, projectionsByPlayer, league, playersById) {
  const slots = safeArray(league?.roster_positions).filter(
    (slot) => !["BN", "IR", "TAXI"].includes(String(slot).toUpperCase())
  );
  const scores = {};

  for (const roster of safeArray(rosters)) {
    const available = safeArray(roster.players)
      .map((playerId) => {
        const player = playersById[playerId] || {};
        const projection = projectionsByPlayer[playerId];
        return {
          playerId: String(playerId),
          position: player.position || projection?.position || "",
          points: projection ? scoreProjectedPlayer(projection, league?.scoring_settings, player.position) : 0,
        };
      })
      .filter((player) => Number.isFinite(player.points));

    const selected = [];
    for (const slot of slots) {
      const candidate = available
        .filter((player) => !selected.includes(player.playerId) && eligibleForSlot(player.position, slot))
        .sort((a, b) => b.points - a.points)[0];
      if (candidate) selected.push(candidate.playerId);
    }

    const lineup = selected.map((playerId) => available.find((player) => player.playerId === playerId));
    scores[String(roster.roster_id)] = {
      points: sum(lineup.map((player) => player?.points || 0)),
      projectedSlots: lineup.filter((player) => player && projectionsByPlayer[player.playerId]).length,
      totalSlots: slots.length,
    };
  }

  return scores;
}

export function calculatePlayoffOdds(
  standings,
  league,
  weeklyGamesByWeek,
  rosterProjections = {},
  simulationCount = 5000
) {
  const spots = Number(league?.settings?.playoff_teams || 6);
  const regularWeeks = Math.max(1, playoffWeek(league) - 1);
  const scoreHistory = Object.fromEntries(standings.map((team) => [team.rosterId, []]));

  for (const weekly of safeArray(weeklyGamesByWeek)) {
    for (const game of safeArray(weekly.games)) {
      if (!game.teams.some((team) => Number(team.points || 0) !== 0)) continue;
      for (const team of game.teams) {
        if (scoreHistory[team.rosterId]) scoreHistory[team.rosterId].push(Number(team.points || 0));
      }
    }
  }

  const playedWeeks = Math.max(
    0,
    ...standings.map((team) => team.wins + team.losses + team.ties)
  );
  const remainingWeeks = Math.max(0, regularWeeks - playedWeeks);
  const leagueScores = Object.values(scoreHistory).flat();
  const leagueAverage = average(leagueScores) || 100;
  const leagueDeviation = Math.max(
    12,
    Math.sqrt(average(leagueScores.map((score) => (score - leagueAverage) ** 2))) || 18
  );
  const profiles = standings.map((team) => {
    const scores = scoreHistory[team.rosterId] || [];
    const scoringMean = average(scores) || (playedWeeks ? team.pointsFor / playedWeeks : leagueAverage);
    const projection = rosterProjections[team.rosterId] || {};
    const projectionCoverage = Number(projection.totalSlots || 0)
      ? Number(projection.projectedSlots || 0) / Number(projection.totalSlots)
      : 0;
    const projectionWeight = Number(projection.points || 0) > 0 && projectionCoverage >= 0.6
      ? Math.max(0.25, 0.65 - playedWeeks * 0.035)
      : 0;
    const mean = scoringMean * (1 - projectionWeight) + Number(projection.points || 0) * projectionWeight;
    const deviation = scores.length > 1
      ? Math.max(10, Math.sqrt(average(scores.map((score) => (score - scoringMean) ** 2))))
      : leagueDeviation;
    return { ...team, mean, deviation, projection: Number(projection.points || 0), projectionCoverage };
  });

  let seed = 0x5f3759df;
  for (const team of standings) {
    seed = (seed ^ Number(team.rosterId) ^ Math.round(team.pointsFor * 100)) >>> 0;
  }
  function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }
  function normal() {
    const a = Math.max(random(), Number.EPSILON);
    const b = random();
    return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
  }

  const playoffCounts = Object.fromEntries(standings.map((team) => [team.rosterId, 0]));
  for (let simulation = 0; simulation < simulationCount; simulation += 1) {
    const results = profiles.map((team) => ({
      ...team,
      simulatedWins: team.wins + team.ties * 0.5,
      simulatedPoints: team.pointsFor,
    }));

    for (let week = 0; week < remainingWeeks; week += 1) {
      const shuffled = [...results];
      for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(random() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
      }
      for (let index = 0; index + 1 < shuffled.length; index += 2) {
        const first = shuffled[index];
        const second = shuffled[index + 1];
        const firstScore = Math.max(0, first.mean + normal() * first.deviation);
        const secondScore = Math.max(0, second.mean + normal() * second.deviation);
        first.simulatedPoints += firstScore;
        second.simulatedPoints += secondScore;
        if (firstScore >= secondScore) first.simulatedWins += 1;
        else second.simulatedWins += 1;
      }
    }

    results
      .sort((a, b) => (b.simulatedWins - a.simulatedWins) || (b.simulatedPoints - a.simulatedPoints))
      .slice(0, spots)
      .forEach((team) => { playoffCounts[team.rosterId] += 1; });
  }

  return profiles
    .map((team) => ({
      ...team,
      odds: simulationCount ? playoffCounts[team.rosterId] / simulationCount : 0,
    }))
    .sort((a, b) => (b.odds - a.odds) || (a.rank - b.rank));
}

export function weeklySummary(matchupRows) {
  const complete = matchupRows.filter(
    (m) => m.teams.length >= 2 && m.teams.some((team) => Number(team.points || 0) !== 0)
  );
  if (!complete.length) {
    return {
      topScore: null,
      worstScore: null,
      closest: null,
      blowout: null,
      otherGames: [],
    };
  }

  const games = complete.map((game) => {
    const [a, b] = game.teams;
    const margin = Math.abs(a.points - b.points);
    return {
      matchupId: game.matchupId,
      a,
      b,
      margin,
      winner: a.points >= b.points ? a : b,
      loser: a.points >= b.points ? b : a,
    };
  });

  const topScoreGame = [...games].sort((x, y) => y.winner.points - x.winner.points)[0] || null;
  const worstScore = games
    .flatMap((game) => [game.a, game.b])
    .sort((a, b) => a.points - b.points)[0] || null;
  const closest = [...games].sort((x, y) => x.margin - y.margin)[0] || null;
  const blowout = [...games].sort((x, y) => y.margin - x.margin)[0] || null;
  const featuredIds = new Set([closest?.matchupId, blowout?.matchupId]);
  const otherGames = games
    .filter((game) => !featuredIds.has(game.matchupId))
    .sort((a, b) => a.margin - b.margin);

  return {
    topScore: topScoreGame,
    worstScore,
    closest,
    blowout,
    otherGames,
  };
}
export function teamCompositionMetrics(rosters, playersById, usersById) {
  const metrics = [];

  for (const roster of safeArray(rosters)) {
    const teamCounts = {};
    for (const pid of safeArray(roster.players)) {
      const team = playersById[pid]?.team || "FA";
      teamCounts[team] = (teamCounts[team] || 0) + 1;
    }

    const entries = Object.entries(teamCounts).filter(([team]) => team && team !== "FA");
    entries.sort((a, b) => b[1] - a[1]);

    const total = sum(entries.map((e) => e[1]));
    let diversityIndex = 0;
    for (const [, count] of entries) {
      const p = total ? count / total : 0;
      if (p > 0) diversityIndex += -(p * Math.log(p));
    }

    metrics.push({
      rosterId: String(roster.roster_id),
      manager: getManagerName(roster, usersById),
      mostCommon: entries[0] || ["N/A", 0],
      leastCommon: entries[entries.length - 1] || ["N/A", 0],
      teamCount: entries.length,
      diversityIndex,
    });
  }

  const mostRepresented = [...metrics].sort((a, b) => b.teamCount - a.teamCount)[0] || null;

  return {
    byTeam: metrics,
    mostRepresented,
  };
}

export function ageMetrics(rosters, playersById, usersById) {
  const rows = safeArray(rosters).map((roster) => {
    const posMap = { QB: [], RB: [], WR: [], TE: [], DEF: [] };
    const ages = [];

    for (const pid of safeArray(roster.players)) {
      const player = playersById[pid] || {};
      const age = Number(player.age || 0);
      if (age > 0) ages.push(age);
      const pos = String(player.position || "").toUpperCase();
      if (posMap[pos] && age > 0) posMap[pos].push(age);
      if (pos === "DST" && age > 0) posMap.DEF.push(age);
    }

    return {
      manager: getManagerName(roster, usersById),
      averageAge: average(ages),
      rooms: Object.fromEntries(Object.entries(posMap).map(([k, v]) => [k, average(v)])),
    };
  });

  return rows.sort((a, b) => b.averageAge - a.averageAge);
}

function futurePickValue(pick, currentSeason) {
  const roundValues = { 1: 6000, 2: 3000, 3: 1500, 4: 750, 5: 400 };
  const yearsOut = Math.max(0, Number(pick?.season || currentSeason) - Number(currentSeason || 0));
  return Math.round((roundValues[Number(pick?.round)] || 250) * (0.88 ** yearsOut));
}

export function collectTrades(allTransactions, usersById, rostersById, playersById, playerValues, draftPicks, currentSeason, leagueId = "") {
  const trades = [];

  for (const tx of safeArray(allTransactions)) {
    if (tx.type !== "trade") continue;

    const adds = tx.adds || {};
    const byManager = {};
    const ensureParty = (rosterId) => {
      const rid = String(rosterId || "");
      if (!rid) return null;
      if (!byManager[rid]) byManager[rid] = { assetsIn: [], inValue: 0 };
      return byManager[rid];
    };

    for (const rosterId of safeArray(tx.roster_ids)) ensureParty(rosterId);

    for (const [pid, rosterId] of Object.entries(adds)) {
      const rid = String(rosterId);
      const value = Number(playerValues[pid] || 0);
      const player = playersById[pid] || {};
      const party = ensureParty(rid);
      party.assetsIn.push({
        type: "player",
        playerId: String(pid),
        name: player.full_name || player.last_name || "Unknown player",
        position: player.position || "",
        value,
      });
      party.inValue += value;
    }

    for (const pick of safeArray(tx.draft_picks)) {
      const party = ensureParty(pick.owner_id);
      if (!party) continue;
      const selectedPick = safeArray(draftPicks).find((draftPick) => (
        String(draftPick.draftSeason || "") === String(pick.season || "")
        && String(draftPick.originalRosterId || "") === String(pick.roster_id || "")
        && Number(draftPick.round || 0) === Number(pick.round || 0)
      ));
      const selectedPlayerId = String(selectedPick?.player_id || "");
      const selectedPlayer = playersById[selectedPlayerId] || {};
      const value = selectedPlayerId
        ? Number(playerValues[selectedPlayerId] || 0)
        : futurePickValue(pick, currentSeason);
      party.assetsIn.push(selectedPlayerId ? {
        type: "used-pick",
        season: String(pick.season || ""),
        round: Number(pick.round || 0),
        playerId: selectedPlayerId,
        name: selectedPlayer.full_name || selectedPlayer.last_name || "Unknown player",
        position: selectedPlayer.position || "",
        value,
      } : {
        type: "pick",
        season: String(pick.season || ""),
        round: Number(pick.round || 0),
        value,
      });
      party.inValue += value;
    }

    const parties = Object.entries(byManager).map(([rid, payload]) => {
      const roster = rostersById[String(rid)] || {};
      const rosterUser = usersById[String(roster.owner_id)] || null;
      return {
        rosterId: rid,
        ownerId: String(roster.owner_id || ""),
        manager: rosterUser?.display_name || `Roster ${rid}`,
        avatarId: String(rosterUser?.avatar || ""),
        ...payload,
      };
    });

    const averageReceived = average(parties.map((party) => party.inValue));
    const imbalance = parties.length
      ? average(parties.map((party) => Math.abs(party.inValue - averageReceived)))
      : 0;

    trades.push({
      transactionId: String(tx.transaction_id),
      statusUpdated: Number(tx.status_updated || 0),
      season: String(currentSeason || ""),
      leagueId: String(leagueId || ""),
      parties,
      imbalance,
      raw: tx,
    });
  }

  trades.sort((a, b) => a.imbalance - b.imbalance);

  return {
    ranked: trades,
    best: trades[0] || null,
    worst: trades[trades.length - 1] || null,
  };
}

export function buildPerformanceMetrics(weeklyGamesByWeek, standings, currentWeek = Infinity) {
  const teamScores = {};
  const matchupLuck = {};
  const completedOppScores = {};
  const remainingOppRanks = {};
  const rankByRoster = Object.fromEntries(standings.map((row) => [row.rosterId, row.rank]));

  for (const weekly of weeklyGamesByWeek) {
    for (const game of weekly.games) {
      const hasScore = game.teams.some((team) => Number(team.points || 0) !== 0);
      if (weekly.week <= currentWeek && hasScore) {
        for (const team of game.teams) {
          if (!teamScores[team.rosterId]) teamScores[team.rosterId] = [];
          teamScores[team.rosterId].push(team.points);
        }
      }

      if (game.teams.length >= 2 && hasScore) {
        const [a, b] = game.teams;
        if (weekly.week < currentWeek) {
          const winner = a.points >= b.points ? a : b;
          const loser = a.points >= b.points ? b : a;
          matchupLuck[winner.rosterId] = (matchupLuck[winner.rosterId] || 0) + 1;
          matchupLuck[loser.rosterId] = (matchupLuck[loser.rosterId] || 0) - 1;
          if (!completedOppScores[a.rosterId]) completedOppScores[a.rosterId] = [];
          if (!completedOppScores[b.rosterId]) completedOppScores[b.rosterId] = [];
          completedOppScores[a.rosterId].push(b.points);
          completedOppScores[b.rosterId].push(a.points);
        } else if (weekly.week > currentWeek) {
          if (!remainingOppRanks[a.rosterId]) remainingOppRanks[a.rosterId] = [];
          if (!remainingOppRanks[b.rosterId]) remainingOppRanks[b.rosterId] = [];
          remainingOppRanks[a.rosterId].push(rankByRoster[b.rosterId] || standings.length);
          remainingOppRanks[b.rosterId].push(rankByRoster[a.rosterId] || standings.length);
        }
      }
    }
  }

  const rows = standings.map((s) => {
    const scores = teamScores[s.rosterId] || [];
    const avg = average(scores);
    const ceiling = scores.length ? Math.max(...scores) : 0;
    const floor = scores.length ? Math.min(...scores) : 0;
    const variance = scores.length ? average(scores.map((x) => Math.abs(x - avg))) : 0;
    return {
      rosterId: s.rosterId,
      manager: s.manager,
      avg,
      ceiling,
      floor,
      consistency: Math.max(0, 100 - variance),
      luck: matchupLuck[s.rosterId] || 0,
      completedSchedule: average(completedOppScores[s.rosterId] || []),
      remainingSchedule: average(remainingOppRanks[s.rosterId] || []),
    };
  });

  return rows.sort((a, b) => b.avg - a.avg);
}

export function allTimeHeadToHead(historyBundles, ownerIdA, ownerIdB) {
  let winsA = 0;
  let winsB = 0;

  for (const season of historyBundles) {
    const ownerToRoster = {};
    for (const r of safeArray(season.rosters)) ownerToRoster[String(r.owner_id)] = String(r.roster_id);
    const rosterA = ownerToRoster[String(ownerIdA)];
    const rosterB = ownerToRoster[String(ownerIdB)];
    if (!rosterA || !rosterB) continue;

    for (const weekly of safeArray(season.weekly || [])) {
      for (const game of weekly.games) {
        if (game.teams.length < 2) continue;
        const ids = game.teams.map((t) => t.rosterId);
        if (!(ids.includes(rosterA) && ids.includes(rosterB))) continue;
        const a = game.teams.find((t) => t.rosterId === rosterA);
        const b = game.teams.find((t) => t.rosterId === rosterB);
        if (!a || !b) continue;
        if (a.points > b.points) winsA += 1;
        if (b.points > a.points) winsB += 1;
      }
    }
  }

  return { winsA, winsB };
}

export function managerAwards(historyBundles, ownerId) {
  let championships = 0;
  let regularSeasonTitles = 0;
  let playoffApps = 0;
  let biggestBlowout = 0;

  for (const season of historyBundles) {
    const seasonComplete = String(season.league?.status || "").toLowerCase() === "complete";
    const standings = season.standings || [];
    if (seasonComplete && standings[0]?.ownerId === String(ownerId)) regularSeasonTitles += 1;

    const ownerToRoster = {};
    for (const r of safeArray(season.rosters)) ownerToRoster[String(r.owner_id)] = String(r.roster_id);
    const rosterId = ownerToRoster[String(ownerId)];
    if (!rosterId) continue;

    const playoffStart = playoffWeek(season.league);
    let appearedInPlayoffs = false;

    for (const weekly of safeArray(season.weekly || [])) {
      const isPlayoff = Number(weekly.week) >= playoffStart;
      for (const game of weekly.games) {
        if (game.teams.length < 2) continue;
        const team = game.teams.find((t) => t.rosterId === rosterId);
        const opp = game.teams.find((t) => t.rosterId !== rosterId);
        if (!team || !opp) continue;
          if (team.points === 0 && opp.points === 0) continue;
        const margin = team.points - opp.points;
        if (margin > biggestBlowout) biggestBlowout = margin;
        if (isPlayoff) appearedInPlayoffs = true;
      }
    }

    if (appearedInPlayoffs) playoffApps += 1;

    const championshipGame = seasonComplete
      ? safeArray(season.brackets?.winners).find((row) => Number(row.p) === 1)
      : null;
    if (String(championshipGame?.w || "") === rosterId) championships += 1;
  }

  return {
    championships,
    regularSeasonTitles,
    playoffApps,
    biggestBlowout,
  };
}

export function playerOwnershipTimeline(historyBundles, playerId) {
  const timeline = [];
  for (const season of historyBundles) {
    const usersByOwner = {};
    for (const r of safeArray(season.rosters)) usersByOwner[String(r.roster_id)] = String(r.owner_id);

    for (const weekly of safeArray(season.transactions || [])) {
      for (const tx of safeArray(weekly.items || [])) {
        const addRoster = tx.adds?.[playerId];
        const dropRoster = tx.drops?.[playerId];
        if (addRoster || dropRoster) {
          timeline.push({
            season: season.league?.season,
            week: weekly.week,
            addRoster: addRoster ? String(addRoster) : "",
            dropRoster: dropRoster ? String(dropRoster) : "",
            addOwnerId: addRoster ? usersByOwner[String(addRoster)] : "",
            dropOwnerId: dropRoster ? usersByOwner[String(dropRoster)] : "",
          });
        }
      }
    }
  }
  return timeline;
}

export function tradeBlockRankings(rosters, playersById, playerValues, standings, usersById) {
  const standingsByRoster = Object.fromEntries(standings.map((s) => [s.rosterId, s]));
  const needsByRoster = {};

  for (const roster of safeArray(rosters)) {
    const posCounts = { QB: 0, RB: 0, WR: 0, TE: 0, DEF: 0 };
    for (const pid of safeArray(roster.players)) {
      const p = playersById[pid] || {};
      const pos = String(p.position || "").toUpperCase();
      if (posCounts[pos] !== undefined) posCounts[pos] += 1;
      if (pos === "DST") posCounts.DEF += 1;
    }
    needsByRoster[String(roster.roster_id)] = {
      QB: Math.max(0, 2 - posCounts.QB),
      RB: Math.max(0, 5 - posCounts.RB),
      WR: Math.max(0, 6 - posCounts.WR),
      TE: Math.max(0, 2 - posCounts.TE),
      DEF: Math.max(0, 1 - posCounts.DEF),
    };
  }

  const tradeBlock = [];
  for (const roster of safeArray(rosters)) {
    const manager = getManagerName(roster, usersById);
    const ranked = safeArray(roster.players)
      .map((pid) => ({ pid, value: Number(playerValues[pid] || 0), player: playersById[pid] || {} }))
      .sort((a, b) => b.value - a.value);

    for (const row of ranked) {
      const pos = String(row.player.position || "").toUpperCase();
      let bestFit = { manager: "N/A", fit: -9999 };
      for (const target of safeArray(rosters)) {
        if (String(target.roster_id) === String(roster.roster_id)) continue;
        const need = needsByRoster[String(target.roster_id)]?.[pos] || 0;
        const standingPenalty = Number(standingsByRoster[String(target.roster_id)]?.rank || 999) / 20;
        const fit = need * 10 - standingPenalty;
        if (fit > bestFit.fit) {
          bestFit = {
            manager: getManagerName(target, usersById),
            fit,
          };
        }
      }

      tradeBlock.push({
        owner: manager,
        rosterId: String(roster.roster_id),
        playerId: String(row.pid),
        playerName: row.player.full_name || row.player.last_name || row.pid,
        position: pos,
        value: row.value,
        bestFitManager: bestFit.manager,
      });
    }
  }

  return tradeBlock.sort((a, b) => b.value - a.value);
}

export function upsetCandidates(weeklyGames, standings) {
  const rankByRoster = Object.fromEntries(standings.map((s) => [s.rosterId, s.rank]));
  const alerts = [];

  for (const game of safeArray(weeklyGames)) {
    if (game.teams.length < 2) continue;
    const [a, b] = game.teams;
    const rankA = rankByRoster[a.rosterId] || 99;
    const rankB = rankByRoster[b.rosterId] || 99;
    const better = rankA < rankB ? a : b;
    const underdog = rankA < rankB ? b : a;
    if (underdog.points > better.points && Math.abs(rankA - rankB) >= 3) {
      alerts.push({
        underdog: underdog.manager,
        favorite: better.manager,
        margin: underdog.points - better.points,
      });
    }
  }

  return alerts.sort((x, y) => y.margin - x.margin);
}

export function weeklyAllStars(matchups, playersById) {
  const bestByPos = {};

  for (const team of safeArray(matchups)) {
    for (const starterId of safeArray(team.starters)) {
      const player = playersById[starterId] || {};
      const pos = String(player.position || "").toUpperCase();
      const score = Number(team.playersPoints?.[starterId] || 0);
      if (!bestByPos[pos] || score > bestByPos[pos].score) {
        bestByPos[pos] = {
          playerId: starterId,
          playerName: player.full_name || player.last_name || starterId,
          pos,
          score,
        };
      }
    }
  }

  return Object.values(bestByPos).sort((a, b) => b.score - a.score);
}

export function managerTradeProfile(trades, ownerId) {
  const mine = trades.filter((t) => t.parties.some((p) => String(p.ownerId) === String(ownerId)));
  const deltas = mine.map((t) => {
    const me = t.parties.find((p) => String(p.ownerId) === String(ownerId));
    const averagePackage = average(t.parties.map((party) => party.inValue));
    return (me?.inValue || 0) - averagePackage;
  });

  return {
    tradeFrequency: mine.length,
    tradeSuccessRate: deltas.length ? deltas.filter((d) => d >= 0).length / deltas.length : 0,
    avgValueDiff: average(deltas),
  };
}

export function playerStartedStats(historyBundles, playerId, ownerToManagerNameResolver) {
  const scores = [];
  let wins = 0;
  let losses = 0;

  for (const season of historyBundles) {
    const rosterIdByOwner = {};
    for (const r of safeArray(season.rosters)) rosterIdByOwner[String(r.owner_id)] = String(r.roster_id);

    for (const weekly of safeArray(season.weekly || [])) {
      for (const game of weekly.games) {
        if (game.teams.length < 2) continue;
        for (const team of game.teams) {
          if (!safeArray(team.starters).includes(String(playerId))) continue;
          const opp = game.teams.find((t) => t.rosterId !== team.rosterId);
          if (team.points === 0 && Number(opp?.points || 0) === 0) continue;
          const points = Number(team.playersPoints?.[playerId] || 0);
          scores.push({
            season: season.league?.season,
            week: weekly.week,
            manager: ownerToManagerNameResolver(season, team.rosterId),
            points,
            opponent: opp?.manager || "",
          });
          if (team.points > (opp?.points || 0)) wins += 1;
          if (team.points < (opp?.points || 0)) losses += 1;
        }
      }
    }
  }

  return {
    startedCount: scores.length,
    averagePoints: average(scores.map((s) => s.points)),
    wins,
    losses,
    trends: scores,
  };
}

export function managerTradeRankings(trades) {
  const managers = new Map();
  for (const trade of safeArray(trades)) {
    for (const party of trade.parties) {
      if (party.ownerId) managers.set(party.ownerId, party.manager);
    }
  }

  return [...managers.entries()]
    .map(([ownerId, manager]) => ({ ownerId, manager, ...managerTradeProfile(trades, ownerId) }))
    .filter((row) => row.tradeFrequency > 0)
    .sort((a, b) => (b.avgValueDiff - a.avgValueDiff) || (b.tradeSuccessRate - a.tradeSuccessRate))
    .map((row, index, rows) => ({ ...row, rank: index + 1, fieldSize: rows.length }));
}

  export const TRADE_RANKING_DESCRIPTION = "Managers rank by average current-value advantage over the other packages in their trades. Higher is better.";
