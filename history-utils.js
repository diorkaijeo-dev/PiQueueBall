(function () {
  "use strict";

  function queueFromRecord(record) {
    const queueRows = (record.match_queue_players || []).slice()
      .sort((first, second) => first.queue_index - second.queue_index);
    const players = queueRows.map((player) => ({
      id: player.player_id || "guest:" + record.id + ":" + player.queue_index,
      userId: player.player_id,
      name: player.player_name
    }));
    const teams = [0, 1].map((index) => queueRows
      .filter((player) => player.team_index === index)
      .map((player) => ({
        id: player.player_id || "guest:" + record.id + ":" + player.queue_index,
        userId: player.player_id,
        name: player.player_name
      })));

    return {
      id: record.client_match_id,
      startedAt: record.queue_started_at,
      completedAt: record.played_at,
      resultId: record.id,
      mode: record.mode,
      players,
      teams
    };
  }

  window.piqueueballHistory = { queueFromRecord };
}());
