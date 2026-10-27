(function () {
  "use strict";

  const STORAGE_KEY = "piqueueball.queue.v1";
  let syncing = false;

  function showSyncStatus(message) {
    sessionStorage.removeItem("piqueueball.sync-status.v1");
    const status = document.getElementById("tracker-status") || document.getElementById("score-status");
    if (status) status.textContent = message;
    else sessionStorage.setItem("piqueueball.sync-status.v1", message);
  }

  function readLocalState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    const state = JSON.parse(saved);
    if (!state || !Array.isArray(state.results) || !Array.isArray(state.queueHistory)) {
      throw new Error("Saved match data is invalid and could not be synchronized.");
    }
    return state;
  }

  function matchPayload(state, result) {
    if (!result.queueId || !Array.isArray(result.teams) || result.teams.length !== 2
      || !Array.isArray(result.scores) || result.scores.length !== 2
      || !Number.isInteger(result.scores[0]) || !Number.isInteger(result.scores[1])
      || result.scores[0] === result.scores[1]) {
      throw new Error("A locally saved match has invalid details and could not be synchronized.");
    }

    const queue = state.queueHistory.find((entry) => entry.id === result.queueId);
    const participants = result.teams.flatMap((team, teamIndex) => team.map((player) => ({
      user_id: player.userId || null,
      player_name: player.name,
      team_index: teamIndex
    })));
    const queuePlayers = queue ? queue.players : result.teams.flat();
    const teamByPlayerId = new Map(result.teams.flatMap((team, teamIndex) =>
      team.map((player) => [player.id, teamIndex])
    ));

    return {
      p_client_match_id: result.queueId,
      p_mode: result.mode === "doubles" ? "doubles" : "singles",
      p_score_one: result.scores[0],
      p_score_two: result.scores[1],
      p_participants: participants,
      p_queue_players: queuePlayers.map((player, queueIndex) => ({
        user_id: player.userId || player.onlineId || null,
        player_name: player.name,
        queue_index: queueIndex,
        team_index: teamByPlayerId.has(player.id) ? teamByPlayerId.get(player.id) : null
      })),
      p_queue_started_at: queue && queue.startedAt || result.completedAt,
      p_played_at: result.completedAt
    };
  }

  async function synchronizeLocalMatches(options) {
    if (syncing || !navigator.onLine || !window.piqueueSupabase) return;
    syncing = true;
    try {
      const { data, error: sessionError } = await window.piqueueSupabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!data.session) return;

      const state = readLocalState();
      if (!state) return;
      const userId = data.session.user.id;
      const pendingResults = state.results.filter((result) =>
        result.syncStatus === "pending" || result.syncStatus === undefined
      );
      const unassignedResults = pendingResults.filter((result) => !result.syncOwnerId);
      const otherAccountResults = pendingResults.filter((result) =>
        result.syncOwnerId && result.syncOwnerId !== userId
      );
      const claimedUnassignedResults = options && options.claimUnassigned
        ? unassignedResults
        : [];
      claimedUnassignedResults.forEach((result) => {
        result.syncOwnerId = userId;
      });
      if (claimedUnassignedResults.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

      const syncableResults = pendingResults.filter((result) => result.syncOwnerId === userId);
      const blockedCount = unassignedResults.length - claimedUnassignedResults.length
        + otherAccountResults.length;
      const remainingUnassignedCount = unassignedResults.length - claimedUnassignedResults.length;
      window.piqueueballSyncReview = {
        unassignedCount: remainingUnassignedCount
      };
      window.dispatchEvent(new CustomEvent("piqueueball:sync-review-required", {
        detail: window.piqueueballSyncReview
      }));

      for (const result of syncableResults) {
        const { error } = await window.piqueueSupabase.rpc("record_match", matchPayload(state, result));
        if (error) {
          result.syncError = error.message || "Unable to synchronize this match.";
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
          showSyncStatus("Some locally saved matches could not sync: " + result.syncError);
          return;
        }
        result.syncStatus = "synced";
        delete result.syncError;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      }

      if (blockedCount || syncableResults.length) {
        const messages = [];
        if (syncableResults.length) {
          messages.push(syncableResults.length + (syncableResults.length === 1
            ? " locally saved match synced."
            : " locally saved matches synced."));
        }
        if (remainingUnassignedCount) {
          messages.push(remainingUnassignedCount + " offline match"
            + (remainingUnassignedCount === 1 ? " needs" : "es need") + " review before syncing.");
        }
        if (otherAccountResults.length) {
          messages.push(otherAccountResults.length + " match"
            + (otherAccountResults.length === 1 ? " belongs" : "es belong")
            + " to another account and was not synced.");
        }
        showSyncStatus(messages.join(" "));
      }
      window.dispatchEvent(new CustomEvent("piqueueball:online-sync-complete", {
        detail: { session: data.session }
      }));
    } catch (error) {
      showSyncStatus("Unable to synchronize local matches: " + (error.message || "Check your connection."));
    } finally {
      syncing = false;
    }
  }

  window.piqueueSyncLocalMatches = synchronizeLocalMatches;
  window.addEventListener("online", synchronizeLocalMatches);
  window.addEventListener("piqueueball:supabase-ready", synchronizeLocalMatches);
  synchronizeLocalMatches();
}());
