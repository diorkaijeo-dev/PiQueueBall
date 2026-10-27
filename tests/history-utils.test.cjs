"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "history-utils.js"), "utf8");
const appWindow = {};
vm.runInNewContext(source, { window: appWindow });

test("queue teams stay attached to players after queue rows are sorted", () => {
  const queue = appWindow.piqueueballHistory.queueFromRecord({
    id: "match-1",
    client_match_id: "queue-1",
    queue_started_at: "2026-10-27T10:00:00Z",
    played_at: "2026-10-27T10:30:00Z",
    mode: "doubles",
    match_queue_players: [
      { player_id: "p3", player_name: "Player 3", queue_index: 2, team_index: 1 },
      { player_id: "p1", player_name: "Player 1", queue_index: 0, team_index: 0 },
      { player_id: "p4", player_name: "Player 4", queue_index: 3, team_index: 0 },
      { player_id: "p2", player_name: "Player 2", queue_index: 1, team_index: 1 }
    ]
  });

  assert.deepEqual(JSON.parse(JSON.stringify(queue.players.map((player) => player.id))),
    ["p1", "p2", "p3", "p4"]);
  assert.equal(JSON.stringify(queue.teams.map((team) => team.map((player) => player.id))),
    JSON.stringify([["p1", "p4"], ["p2", "p3"]]));
});

test("queue snapshots preserve guest players and unassigned queue entries", () => {
  const queue = appWindow.piqueueballHistory.queueFromRecord({
    id: "match-2",
    client_match_id: "queue-2",
    queue_started_at: "2026-10-27T10:00:00Z",
    played_at: "2026-10-27T10:30:00Z",
    mode: "singles",
    match_queue_players: [
      { player_id: null, player_name: "Guest", queue_index: 1, team_index: null },
      { player_id: "p1", player_name: "Player 1", queue_index: 0, team_index: 0 }
    ]
  });

  assert.deepEqual(JSON.parse(JSON.stringify(queue.players.map((player) => player.id))),
    ["p1", "guest:match-2:1"]);
  assert.equal(JSON.stringify(queue.teams.map((team) => team.map((player) => player.id))),
    JSON.stringify([["p1"], []]));
});
