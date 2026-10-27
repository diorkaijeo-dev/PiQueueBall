(function () {
  "use strict";

  const STORAGE_KEY = "piqueueball.queue.v1";
  const noCurrentMatch = document.getElementById("no-current-match");
  const scoreMatch = document.getElementById("score-match");
  const scoreTeams = document.getElementById("score-teams");
  const scoreFormat = document.getElementById("score-format");
  const scoreMessage = document.getElementById("score-message");
  const completeButton = document.getElementById("complete-match");
  const status = document.getElementById("score-status");

  function validScore(value) {
    return Number.isInteger(value) && value >= 0;
  }

  function newUuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
      const random = Math.floor(Math.random() * 16);
      return (character === "x" ? random : (random & 3) | 8).toString(16);
    });
  }

  function readState() {
    let value;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) throw new Error("No saved match data was found.");
      value = JSON.parse(saved);
    } catch (error) {
      status.textContent = "Unable to read saved match data. Return to the queue and try again.";
      return null;
    }
    if (!value || !Array.isArray(value.players) || !value.currentMatch
      || !Array.isArray(value.currentMatch.teams) || value.currentMatch.teams.length !== 2
      || !value.currentMatch.teams.every(Array.isArray)) {
      return null;
    }
    const currentMatch = value.currentMatch;
    currentMatch.scores = Array.isArray(currentMatch.scores) && currentMatch.scores.length === 2
      ? currentMatch.scores.map((score) => validScore(score) ? score : null)
      : [0, 0];
    value.played = Array.isArray(value.played) ? value.played : [];
    value.results = Array.isArray(value.results) ? value.results : [];
    value.queueHistory = Array.isArray(value.queueHistory) ? value.queueHistory : [];
    return value;
  }

  const state = readState();

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (error) {
      status.textContent = "Unable to save this match in the browser. Check its storage settings.";
      return false;
    }
  }

  let scoreSaveTimer = null;
  function scheduleScoreSave() {
    window.clearTimeout(scoreSaveTimer);
    scoreSaveTimer = window.setTimeout(() => {
      scoreSaveTimer = null;
      saveState();
    }, 200);
  }

  function flushScoreSave() {
    if (scoreSaveTimer === null) return;
    window.clearTimeout(scoreSaveTimer);
    scoreSaveTimer = null;
    saveState();
  }

  window.addEventListener("pagehide", flushScoreSave);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushScoreSave();
  });

  function playerFor(id) {
    return state.players.find((player) => player.id === id);
  }

  function teamSnapshots() {
    const savedNames = state.currentMatch.names;
    return state.currentMatch.teams.map((team, teamIndex) => team.map((id) => {
      const savedPlayer = savedNames && savedNames[teamIndex]
        ? savedNames[teamIndex].find((player) => player.id === id)
        : null;
      const player = playerFor(id);
      return {
        id,
        userId: player && player.onlineId ? player.onlineId : savedPlayer && savedPlayer.userId || null,
        avatarDataUrl: player && player.avatarDataUrl || "",
        name: savedPlayer ? savedPlayer.name : player ? player.name : "Unknown player"
      };
    }));
  }

  function ensureQueueSnapshot() {
    if (state.currentMatch.queueId) return;
    const queueId = newUuid();
    state.currentMatch.queueId = queueId;
    state.queueHistory.push({
      id: queueId,
      startedAt: new Date().toISOString(),
      mode: state.currentMatch.mode === "doubles" ? "doubles" : "singles",
      players: state.players.map((player) => ({
        id: player.id, userId: player.onlineId || null, name: player.name
      })),
      teams: teamSnapshots().map((team) => team.map((player) => ({
        id: player.id, userId: player.userId, name: player.name, avatarDataUrl: player.avatarDataUrl
      })))
    });
    saveState();
  }

  function renderScores() {
    if (!state) return;
    ensureQueueSnapshot();
    noCurrentMatch.hidden = true;
    scoreMatch.hidden = false;
    const isDoubles = state.currentMatch.mode === "doubles";
    scoreFormat.textContent = isDoubles ? "Doubles" : "Singles";
    scoreTeams.replaceChildren();

    state.currentMatch.teams.forEach((team, index) => {
      const card = document.createElement("div");
      card.className = "team-card";
      const label = document.createElement("span");
      label.className = "team-label";
      label.textContent = (isDoubles ? "TEAM " : "PLAYER ") + (index + 1);
      const names = document.createElement("div");
      names.className = "team-names";
      teamSnapshots()[index].forEach((player) => {
        const name = document.createElement("span");
        name.className = "team-player";
        if (player.avatarDataUrl) {
          const avatar = document.createElement("img");
          avatar.src = player.avatarDataUrl;
          avatar.alt = "";
          name.append(avatar);
        }
        const label = document.createElement("span");
        label.textContent = player.name;
        name.append(label);
        names.append(name);
      });
      const control = document.createElement("div");
      control.className = "team-score";
      const inputId = "team-score-" + index;
      const inputLabel = document.createElement("label");
      inputLabel.htmlFor = inputId;
      inputLabel.textContent = "Score";
      const input = document.createElement("input");
      input.id = inputId;
      input.type = "number";
      input.min = "0";
      input.step = "1";
      input.inputMode = "numeric";
      input.value = validScore(state.currentMatch.scores[index]) ? String(state.currentMatch.scores[index]) : "";
      input.setAttribute("aria-label", (isDoubles ? "Team " : "Player ") + (index + 1) + " score");
      input.addEventListener("input", () => {
        const score = input.value === "" ? null : Number(input.value);
        state.currentMatch.scores[index] = validScore(score) ? score : null;
        scheduleScoreSave();
        updateScoreMessage();
      });
      control.append(inputLabel, input);
      card.append(label, names, control);
      scoreTeams.append(card);
    });
    updateScoreMessage();
  }

  function updateScoreMessage() {
    const scores = state.currentMatch.scores;
    const valid = scores.length === 2 && scores.every(validScore);
    completeButton.disabled = !valid || scores[0] === scores[1];
    if (!valid) {
      scoreMessage.textContent = "Enter a non-negative whole-number score for both sides.";
    } else if (scores[0] === scores[1]) {
      scoreMessage.textContent = "Scores are tied. Update a score to complete the match.";
    } else {
      const winningSide = scores[0] > scores[1] ? 0 : 1;
      scoreMessage.textContent = (state.currentMatch.mode === "doubles" ? "Team " : "Player ")
        + (winningSide + 1) + " is ahead.";
    }
  }

  completeButton.addEventListener("click", async () => {
    if (!state) return;
    const scores = state.currentMatch.scores;
    if (!scores.every(validScore) || scores[0] === scores[1]) {
      updateScoreMessage();
      return;
    }

    const currentMatch = state.currentMatch;
    const teams = teamSnapshots();
    const winner = scores[0] > scores[1] ? 0 : 1;
    completeButton.disabled = true;
    let syncOwnerId = null;
    try {
      const session = await window.piqueueAuth.ready;
      syncOwnerId = session ? session.user.id : null;
    } catch (error) {
      status.textContent = error.message || "Unable to verify the signed-in account. The match was not completed.";
      completeButton.disabled = false;
      return;
    }
    const stateSnapshot = JSON.stringify(state);
    const resultId = newUuid();
    const completedAt = new Date().toISOString();
    const queueSnapshot = state.queueHistory.find((queue) => queue.id === state.currentMatch.queueId);
    state.results.push({
      id: resultId,
      queueId: state.currentMatch.queueId,
      completedAt,
      mode: state.currentMatch.mode === "doubles" ? "doubles" : "singles",
      teams: teams.map((team) => team.map((player) => ({
        id: player.id, userId: player.userId, name: player.name
      }))),
      scores: scores.slice(),
      winner,
      syncOwnerId,
      syncStatus: "pending"
    });
    if (queueSnapshot) {
      queueSnapshot.completedAt = completedAt;
      queueSnapshot.resultId = resultId;
      queueSnapshot.scores = scores.slice();
      queueSnapshot.winner = winner;
    }

    const playedNow = state.currentMatch.teams.flat();
    state.played = state.played.filter((id) => playerFor(id));
    playedNow.forEach((id) => {
      if (!playerFor(id)) return;
      state.played = state.played.filter((playedId) => playedId !== id);
      state.played.push(id);
    });
    state.currentMatch = null;
    const activeIds = state.players.map((player) => player.id);
    if (activeIds.length > 0 && activeIds.every((id) => state.played.includes(id))) state.played = [];

    if (!saveState()) {
      Object.keys(state).forEach((key) => delete state[key]);
      Object.assign(state, JSON.parse(stateSnapshot));
      renderScores();
      return;
    }

    if (localStorage.getItem("piqueueball.offline.v1") === "true"
      || !navigator.onLine || !window.piqueueSupabase) {
      sessionStorage.setItem("piqueueball.sync-status.v1",
        "Match saved on this device. It will sync when you are online and signed in.");
    }
    if (window.piqueueSyncLocalMatches && navigator.onLine) {
      window.piqueueSyncLocalMatches();
    }
    window.location.href = "results.html";
  });

  if (state) renderScores();
}());
