(function () {
  "use strict";

  const STORAGE_KEY = "piqueueball.queue.v1";
  const HISTORY_PAGE_SIZE = 25;
  const status = document.getElementById("tracker-status");
  let resultsPage = 0;
  let queueHistoryPage = 0;
  if (status) {
    const syncStatus = sessionStorage.getItem("piqueueball.sync-status.v1");
    if (syncStatus) {
      status.textContent = syncStatus;
      sessionStorage.removeItem("piqueueball.sync-status.v1");
    }
  }

  function readState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return { players: [], results: [], queueHistory: [] };
      const value = JSON.parse(saved);
      if (!value || !Array.isArray(value.players)) throw new Error("Saved player data is invalid.");
      return {
        players: value.players.filter((player) => player && typeof player.id === "string" && typeof player.name === "string"),
        queueHistory: Array.isArray(value.queueHistory) ? value.queueHistory.filter((queue) =>
          queue && typeof queue.id === "string" && typeof queue.startedAt === "string"
          && Array.isArray(queue.players) && queue.players.every((player) =>
            player && typeof player.id === "string" && typeof player.name === "string")
          && Array.isArray(queue.teams) && queue.teams.length === 2
          && queue.teams.every((team) => Array.isArray(team) && team.every((player) =>
            player && typeof player.id === "string" && typeof player.name === "string"))
        ) : [],
        results: Array.isArray(value.results) ? value.results.filter((result) =>
          result && typeof result.completedAt === "string"
          && Array.isArray(result.teams) && result.teams.length === 2
          && result.teams.every((team) => Array.isArray(team) && team.every((player) =>
            player && typeof player.id === "string" && typeof player.name === "string"))
          && Array.isArray(result.scores) && result.scores.length === 2
          && result.scores.every((score) => Number.isInteger(score) && score >= 0)
          && (result.winner === 0 || result.winner === 1)
        ) : []
      };
    } catch (error) {
      status.textContent = "Unable to read saved match results in this browser.";
      return null;
    }
  }

  function resultTeamName(team) {
    return team.map((player) => player.name).join(" + ");
  }

  function formattedDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString();
  }

  function renderPagination(containerId, itemCount, currentPage, onPageChange) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.replaceChildren();
    const pageCount = Math.ceil(itemCount / HISTORY_PAGE_SIZE);
    if (pageCount <= 1) return;

    const previous = document.createElement("button");
    previous.type = "button";
    previous.textContent = "Previous";
    previous.disabled = currentPage === 0;
    previous.addEventListener("click", () => onPageChange(currentPage - 1));
    const pageLabel = document.createElement("span");
    pageLabel.textContent = "Page " + (currentPage + 1) + " of " + pageCount;
    const next = document.createElement("button");
    next.type = "button";
    next.textContent = "Next";
    next.disabled = currentPage >= pageCount - 1;
    next.addEventListener("click", () => onPageChange(currentPage + 1));
    container.append(previous, pageLabel, next);
  }

  function renderStats(state) {
    const body = document.getElementById("player-stats");
    const empty = document.getElementById("empty-stats");
    const stats = new Map();
    state.players.forEach((player) => {
      const id = player.onlineId || player.id;
      stats.set(id, { id, name: player.name, played: 0, wins: 0, losses: 0 });
    });
    state.results.forEach((result) => {
      result.teams.forEach((team, teamIndex) => {
        team.forEach((player) => {
          const id = player.userId || player.id;
          const entry = stats.get(id) || { id, name: player.name, played: 0, wins: 0, losses: 0 };
          entry.played += 1;
          if (result.winner === teamIndex) entry.wins += 1;
          else entry.losses += 1;
          stats.set(id, entry);
        });
      });
    });

    body.replaceChildren();
    Array.from(stats.values()).sort((first, second) => first.name.localeCompare(second.name)).forEach((stat) => {
      const row = document.createElement("tr");
      [stat.name, stat.played, stat.wins, stat.losses].forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = String(value);
        row.append(cell);
      });
      body.append(row);
    });
    empty.hidden = state.results.length > 0;
  }

  function renderResults(state) {
    const list = document.getElementById("results-list");
    const empty = document.getElementById("empty-results");
    const count = document.getElementById("results-count");
    list.replaceChildren();

    const results = state.results.slice().reverse();
    const pageCount = Math.ceil(results.length / HISTORY_PAGE_SIZE);
    resultsPage = Math.min(resultsPage, Math.max(0, pageCount - 1));
    const pageStart = resultsPage * HISTORY_PAGE_SIZE;
    results.slice(pageStart, pageStart + HISTORY_PAGE_SIZE).forEach((result) => {
      const item = document.createElement("li");
      item.className = "result-item";
      const top = document.createElement("div");
      top.className = "result-top";
      const date = document.createElement("time");
      date.dateTime = result.completedAt;
      date.textContent = formattedDate(result.completedAt);
      const mode = document.createElement("span");
      mode.textContent = result.mode === "doubles" ? "Doubles" : "Singles";
      top.append(date, mode);
      const winner = document.createElement("div");
      winner.className = "result-winner";
      winner.textContent = "Winner: " + resultTeamName(result.teams[result.winner]);
      const score = document.createElement("div");
      score.className = "result-score";
      result.teams.forEach((team, index) => {
        const side = document.createElement("span");
        side.className = "result-side";
        side.textContent = resultTeamName(team);
        const points = document.createElement("strong");
        points.textContent = String(result.scores[index]);
        side.append(points);
        score.append(side);
      });
      item.append(top, winner, score);
      list.append(item);
    });

    count.textContent = state.results.length + (state.results.length === 1 ? " match" : " matches");
    empty.hidden = state.results.length > 0;
    renderPagination("results-pagination", results.length, resultsPage, (page) => {
      resultsPage = page;
      renderResults(state);
    });
  }

  function renderQueueHistory(state) {
    const list = document.getElementById("queue-history-list");
    const empty = document.getElementById("empty-queue-history");
    const count = document.getElementById("queue-history-count");
    list.replaceChildren();

    const queues = state.queueHistory.slice()
      .sort((first, second) => second.startedAt.localeCompare(first.startedAt));
    const pageCount = Math.ceil(queues.length / HISTORY_PAGE_SIZE);
    queueHistoryPage = Math.min(queueHistoryPage, Math.max(0, pageCount - 1));
    const resultsByQueue = new Map(state.results.flatMap((match) =>
      [[match.queueId, match], [match.id, match]]
    ));
    const pageStart = queueHistoryPage * HISTORY_PAGE_SIZE;
    queues.slice(pageStart, pageStart + HISTORY_PAGE_SIZE).forEach((queue) => {
      const result = resultsByQueue.get(queue.resultId) || resultsByQueue.get(queue.id);
      const item = document.createElement("li");
      item.className = "queue-history-item";
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      const title = document.createElement("span");
      title.className = "queue-history-title";
      title.textContent = formattedDate(queue.startedAt);
      const status = document.createElement("span");
      status.className = result ? "queue-history-state completed" : "queue-history-state";
      status.textContent = result ? "Completed" : "In progress";
      summary.append(title, status);

      const content = document.createElement("div");
      content.className = "queue-history-details";
      const format = document.createElement("p");
      format.className = "queue-history-meta";
      format.textContent = (queue.mode === "doubles" ? "Doubles" : "Singles")
        + " · " + queue.players.length + (queue.players.length === 1 ? " player" : " players");
      const rosterLabel = document.createElement("strong");
      rosterLabel.textContent = "Players in this queue";
      const roster = document.createElement("p");
      roster.className = "queue-history-roster";
      roster.textContent = queue.players.map((player) => player.name).join(", ");
      content.append(format, rosterLabel, roster);

      queue.teams.forEach((team, index) => {
        const side = document.createElement("p");
        side.className = "queue-history-side";
        const teamLabel = queue.mode === "doubles" ? "Team " : "Player ";
        side.textContent = teamLabel + (index + 1) + ": " + resultTeamName(team);
        if (result) side.textContent += " — " + result.scores[index];
        content.append(side);
      });
      if (result) {
        const winner = document.createElement("p");
        winner.className = "result-winner";
        winner.textContent = "Winner: " + resultTeamName(result.teams[result.winner]);
        const completionDate = document.createElement("time");
        completionDate.className = "queue-history-meta";
        completionDate.dateTime = result.completedAt;
        completionDate.textContent = "Completed " + formattedDate(result.completedAt);
        content.append(winner, completionDate);
      }

      details.append(summary, content);
      item.append(details);
      list.append(item);
    });

    count.textContent = state.queueHistory.length + (state.queueHistory.length === 1 ? " queue" : " queues");
    empty.hidden = state.queueHistory.length > 0;
    renderPagination("queue-history-pagination", queues.length, queueHistoryPage, (page) => {
      queueHistoryPage = page;
      renderQueueHistory(state);
    });
  }

  function mergeOnlineHistory(state, records) {
    const cloudResults = records.map((record) => {
      const participants = record.match_players || [];
      const teams = [0, 1].map((index) => participants
        .filter((player) => player.team_index === index)
        .map((player) => ({
          id: player.player_id || "guest:" + record.id + ":" + player.player_name,
          userId: player.player_id,
          name: player.player_name
        })));
      return {
        id: record.id,
        queueId: record.client_match_id,
        completedAt: record.played_at,
        mode: record.mode,
        teams,
        scores: [record.score_one, record.score_two],
        winner: record.winner_team
      };
    });
    const resultsByQueue = new Map(cloudResults.map((result) => [result.queueId, result]));
    const localResults = state.results.filter((result) => !resultsByQueue.has(result.queueId))
      .map((result) => ({
        ...result,
        teams: result.teams.map((team) => team.map((player) => ({
          ...player, userId: player.userId || null
        })))
      }));
    state.results = cloudResults.concat(localResults);

    const cloudQueues = records.map((record) => window.piqueueballHistory.queueFromRecord(record));
    const onlineQueueIds = new Set(cloudQueues.map((queue) => queue.id));
    state.queueHistory = cloudQueues.concat(state.queueHistory.filter((queue) => !onlineQueueIds.has(queue.id)));
  }

  async function loadOnlineHistory(state) {
    const { data: records, error } = await window.piqueueSupabase.from("match_records")
      .select("id, client_match_id, mode, score_one, score_two, winner_team, queue_started_at, played_at, match_players(player_id, team_index, player_name), match_queue_players(player_id, player_name, queue_index, team_index)")
      .order("played_at", { ascending: false });
    if (error) throw error;
    mergeOnlineHistory(state, records || []);
    if (document.getElementById("player-stats")) renderStats(state);
    if (document.getElementById("results-list")) renderResults(state);
    if (document.getElementById("queue-history-list")) renderQueueHistory(state);
  }

  const state = readState();
  if (!state) return;
  if (document.getElementById("player-stats")) renderStats(state);
  if (document.getElementById("results-list")) renderResults(state);
  if (document.getElementById("queue-history-list")) renderQueueHistory(state);
  function refreshOnlineHistory(event) {
    const session = event.detail && event.detail.session;
    if (session) loadOnlineHistory(state).catch((error) => {
      if (status) status.textContent = error.message || "Unable to load online match history.";
    });
  }
  window.addEventListener("piqueueball:online-sync-complete", refreshOnlineHistory);
  window.piqueueAuth.ready.then((session) => {
    if (session) return loadOnlineHistory(state);
  }).catch((error) => {
    if (status) status.textContent = error.message || "Unable to load online match history.";
  });

  const exportButton = document.getElementById("export-data");
  if (exportButton) {
    exportButton.addEventListener("click", () => {
      try {
        const savedState = localStorage.getItem(STORAGE_KEY);
        if (!savedState) throw new Error("No saved device data is available to export.");
        const data = JSON.stringify({
          exportedAt: new Date().toISOString(),
          deviceData: JSON.parse(savedState)
        }, null, 2);
        const downloadUrl = URL.createObjectURL(new Blob([data], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = "piqueueball-device-data-" + new Date().toISOString().slice(0, 10) + ".json";
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(downloadUrl);
        if (status) status.textContent = "Device data exported.";
      } catch (error) {
        if (status) status.textContent = error.message || "Unable to export device data.";
      }
    });
  }

  const syncReviewMessage = document.getElementById("sync-review-message");
  const claimOfflineSyncButton = document.getElementById("claim-offline-sync");
  function renderSyncReview(review) {
    if (!syncReviewMessage || !claimOfflineSyncButton) return;
    const count = review && Number.isInteger(review.unassignedCount) ? review.unassignedCount : 0;
    syncReviewMessage.hidden = count === 0;
    claimOfflineSyncButton.hidden = count === 0;
    if (count) {
      syncReviewMessage.textContent = count + " offline match" + (count === 1 ? " has" : "es have")
        + " no account assigned. Review the local results above before syncing them to this account.";
      claimOfflineSyncButton.textContent = "Sync " + count + " offline match"
        + (count === 1 ? "" : "es") + " to this account";
    }
  }
  window.addEventListener("piqueueball:sync-review-required", (event) => renderSyncReview(event.detail));
  renderSyncReview(window.piqueueballSyncReview);
  if (claimOfflineSyncButton) {
    claimOfflineSyncButton.addEventListener("click", async () => {
      claimOfflineSyncButton.disabled = true;
      try {
        await window.piqueueSyncLocalMatches({ claimUnassigned: true });
      } finally {
        claimOfflineSyncButton.disabled = false;
      }
    });
  }
}());
