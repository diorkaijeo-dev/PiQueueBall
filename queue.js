(function () {
  "use strict";

  const STORAGE_KEY = "piqueueball.queue.v1";
  const form = document.getElementById("add-player-form");
  const nameInput = document.getElementById("player-name");
  const playerList = document.getElementById("player-list");
  const emptyRoster = document.getElementById("empty-roster");
  const rosterCount = document.getElementById("roster-count");
  const jumbleButton = document.getElementById("jumble-button");
  const samePartner = document.getElementById("same-partner");
  const partnerOption = document.getElementById("partner-option");
  const partnerPicker = document.getElementById("partner-picker");
  const yourPlayerSelect = document.getElementById("your-player");
  const chosenPartnerSelect = document.getElementById("chosen-partner");
  const savePartnerButton = document.getElementById("save-partner");
  const savedPartnerMessage = document.getElementById("saved-partner");
  const matchTeams = document.getElementById("match-teams");
  const matchStats = document.getElementById("match-stats");
  const matchMessage = document.getElementById("match-message");
  const matchTitle = document.getElementById("match-title");
  const matchEyebrow = document.getElementById("match-eyebrow");
  const matchFormat = document.getElementById("match-format");
  const startButton = document.getElementById("start-match");
  const queueStatus = document.getElementById("queue-status");
  const fairnessNote = document.getElementById("fairness-note");
  const modeInputs = document.querySelectorAll('input[name="mode"]');

  function newState() {
    return { players: [], played: [], partners: [], ownPartner: null, mode: "singles", stayTogether: false, currentMatch: null, results: [], queueHistory: [], profiles: {} };
  }

  function validScore(score) {
    return Number.isInteger(score) && score >= 0;
  }

  function newUuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
      const random = Math.floor(Math.random() * 16);
      return (character === "x" ? random : (random & 3) | 8).toString(16);
    });
  }

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return newState();
      const value = JSON.parse(saved);
      if (!value || !Array.isArray(value.players)) return newState();
      const currentMatch = value.currentMatch && Array.isArray(value.currentMatch.teams) ? value.currentMatch : null;
      if (currentMatch) {
        currentMatch.scores = Array.isArray(currentMatch.scores) && currentMatch.scores.length === 2
          ? currentMatch.scores.map((score) => validScore(score) ? score : null)
          : [0, 0];
      }
      const results = Array.isArray(value.results) ? value.results.filter((result) =>
        result && typeof result.id === "string"
        && typeof result.completedAt === "string"
        && Array.isArray(result.teams) && result.teams.length === 2
        && result.teams.every((team) => Array.isArray(team) && team.every((player) =>
          player && typeof player.id === "string" && typeof player.name === "string"))
        && Array.isArray(result.scores) && result.scores.length === 2
        && result.scores.every(validScore)
        && (result.winner === 0 || result.winner === 1)
      ) : [];
      const queueHistory = Array.isArray(value.queueHistory) ? value.queueHistory.filter((queue) =>
        queue && typeof queue.id === "string"
        && typeof queue.startedAt === "string"
        && Array.isArray(queue.players) && queue.players.every((player) =>
          player && typeof player.id === "string" && typeof player.name === "string")
        && Array.isArray(queue.teams) && queue.teams.length === 2
        && queue.teams.every((team) => Array.isArray(team) && team.every((player) =>
          player && typeof player.id === "string" && typeof player.name === "string"))
      ) : [];
      const profiles = value.profiles && typeof value.profiles === "object" && !Array.isArray(value.profiles)
        ? Object.fromEntries(Object.entries(value.profiles).filter(([, profile]) =>
          profile && typeof profile === "object"
          && (profile.nickname === undefined || typeof profile.nickname === "string")
          && (profile.picture === undefined || typeof profile.picture === "string")
        ).map(([id, profile]) => [id, {
          nickname: typeof profile.nickname === "string" ? profile.nickname : "",
          picture: typeof profile.picture === "string" ? profile.picture : ""
        }]))
        : {};
      return {
        players: value.players.filter((player) => player && typeof player.id === "string" && typeof player.name === "string"),
        played: Array.isArray(value.played) ? value.played.filter((id) => typeof id === "string") : [],
        partners: Array.isArray(value.partners) ? value.partners.filter((pair) => Array.isArray(pair) && pair.length === 2) : [],
        ownPartner: Array.isArray(value.ownPartner) && value.ownPartner.length === 2
          && value.ownPartner.every((id) => typeof id === "string")
          ? value.ownPartner
          : null,
        mode: value.mode === "doubles" ? "doubles" : "singles",
        stayTogether: value.stayTogether === true,
        currentMatch,
        results,
        queueHistory,
        profiles
      };
    } catch (error) {
      queueStatus.textContent = "Saved queue data could not be read. Your changes may not persist after this visit.";
      return newState();
    }
  }

  let state = loadState();

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (error) {
      queueStatus.textContent = "Unable to save queue changes in this browser. Check its storage settings.";
      return false;
    }
  }

  async function currentAccountProfile() {
    if (!window.piqueueSupabase || !navigator.onLine
      || localStorage.getItem("piqueueball.offline.v1") === "true") return null;
    const session = await window.piqueueAuth.ready;
    if (!session) return null;
    const { data: profile, error } = await window.piqueueSupabase.from("profiles")
      .select("id, display_name, avatar_data_url")
      .eq("id", session.user.id)
      .single();
    if (error) throw error;
    return profile;
  }

  function selectedMode() {
    return state.mode;
  }

  function neededPlayers() {
    return selectedMode() === "doubles" ? 4 : 2;
  }

  function playerById(id) {
    return state.players.find((player) => player.id === id);
  }

  function displayName(player) {
    const nickname = state.profiles[player.id] && state.profiles[player.id].nickname;
    return nickname && nickname.trim() ? nickname.trim() : player.name;
  }

  function activePartnerPairs() {
    const activeIds = new Set(state.players.map((player) => player.id));
    const assigned = new Set();
    const pairs = [];
    if (state.ownPartner && state.ownPartner.length === 2) {
      const [first, second] = state.ownPartner;
      if (activeIds.has(first) && activeIds.has(second) && first !== second) {
        pairs.push([first, second]);
        assigned.add(first);
        assigned.add(second);
      }
    }
    state.partners.forEach((pair) => {
      const [first, second] = pair;
      if (activeIds.has(first) && activeIds.has(second) && !assigned.has(first) && !assigned.has(second)) {
        pairs.push([first, second]);
        assigned.add(first);
        assigned.add(second);
      }
    });
    const waiting = state.players.filter((player) => !assigned.has(player.id) && !state.played.includes(player.id));
    const returning = state.players.filter((player) => !assigned.has(player.id) && state.played.includes(player.id));
    const unpaired = waiting.concat(returning).map((player) => player.id);
    for (let index = 0; index + 1 < unpaired.length; index += 2) {
      pairs.push([unpaired[index], unpaired[index + 1]]);
    }
    return pairs;
  }

  function candidateMatch() {
    const count = neededPlayers();
    if (state.players.length < count) return null;
    if (selectedMode() === "doubles" && samePartner.checked) {
      const pairs = activePartnerPairs();
      const playedOrder = state.played.filter((id) => playerById(id));
      pairs.sort((first, second) => {
        const rank = (pair) => {
          const unplayed = pair.filter((id) => !state.played.includes(id)).length;
          if (unplayed === 2) return 0;
          if (unplayed === 1) return 1;
          return 2 + Math.max(...pair.map((id) => playedOrder.indexOf(id)));
        };
        return rank(first) - rank(second);
      });
      if (pairs.length < 2) return null;
      return [pairs[0], pairs[1]];
    }

    const eligible = state.players.filter((player) => !state.played.includes(player.id));
    const recentlyPlayed = state.players.filter((player) => state.played.includes(player.id))
      .sort((first, second) => state.played.indexOf(first.id) - state.played.indexOf(second.id));
    const pairIds = state.ownPartner && state.ownPartner.length === 2
      && state.ownPartner[0] !== state.ownPartner[1]
      && state.ownPartner.every((id) => playerById(id))
      ? state.ownPartner
      : null;
    const eligibleIds = eligible.map((player) => player.id);
    const ownPairWaiting = pairIds && pairIds.every((id) => eligibleIds.includes(id));
    const ordered = ownPairWaiting
      ? pairIds.concat(eligibleIds.filter((id) => !pairIds.includes(id)), recentlyPlayed.map((player) => player.id))
      : eligibleIds.concat(recentlyPlayed.map((player) => player.id));
    const selected = ordered.filter((id, index) => ordered.indexOf(id) === index).slice(0, count);
    if (selected.length < count) return null;
    if (selected.length === 2) return [[selected[0]], [selected[1]]];
    if (pairIds && pairIds.every((id) => selected.includes(id))) {
      return [pairIds.slice(), selected.filter((id) => !pairIds.includes(id))];
    }
    return [[selected[0], selected[1]], [selected[2], selected[3]]];
  }

  function shuffle(items) {
    for (let index = items.length - 1; index > 0; index -= 1) {
      const other = Math.floor(Math.random() * (index + 1));
      [items[index], items[other]] = [items[other], items[index]];
    }
    return items;
  }

  function renderRoster() {
    playerList.replaceChildren();
    state.players.forEach((player) => {
      const item = document.createElement("li");
      item.className = "player-item";
      const number = document.createElement("span");
      number.className = "player-number";
      number.textContent = String(state.players.indexOf(player) + 1).padStart(2, "0");
      const name = document.createElement("span");
      name.className = "player-name";
      if (player.avatarDataUrl) {
        const avatar = document.createElement("img");
        avatar.className = "player-avatar";
        avatar.src = player.avatarDataUrl;
        avatar.alt = "";
        name.append(avatar);
      }
      const nameLabel = document.createElement("span");
      nameLabel.className = "player-name-label";
      nameLabel.textContent = displayName(player);
      name.append(nameLabel);
      const status = document.createElement("span");
      status.className = "player-turn";
      status.textContent = state.played.includes(player.id) ? "Played" : "Waiting";
      const remove = document.createElement("button");
      remove.className = "remove-player";
      remove.type = "button";
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", "Remove " + player.name);
      remove.addEventListener("click", () => {
        state.players = state.players.filter((current) => current.id !== player.id);
        state.played = state.played.filter((id) => id !== player.id);
        state.partners = state.partners.filter((pair) => !pair.includes(player.id));
        if (state.ownPartner && state.ownPartner.includes(player.id)) state.ownPartner = null;
        saveState();
        render();
      });
      item.append(number, name, status, remove);
      playerList.append(item);
    });
    emptyRoster.hidden = state.players.length > 0;
    rosterCount.textContent = state.players.length + (state.players.length === 1 ? " player" : " players");
  }

  function renderPartnerPicker() {
    const previousYourPlayer = yourPlayerSelect.value;
    const previousPartner = chosenPartnerSelect.value;
    yourPlayerSelect.replaceChildren(new Option("Choose your name", ""));
    chosenPartnerSelect.replaceChildren(new Option("Choose a partner", ""));
    state.players.forEach((player) => {
      yourPlayerSelect.add(new Option(player.name, player.id));
      chosenPartnerSelect.add(new Option(player.name, player.id));
    });
    yourPlayerSelect.value = state.players.some((player) => player.id === previousYourPlayer)
      ? previousYourPlayer
      : state.ownPartner && playerById(state.ownPartner[0]) ? state.ownPartner[0] : "";
    chosenPartnerSelect.value = state.players.some((player) => player.id === previousPartner)
      ? previousPartner
      : state.ownPartner && playerById(state.ownPartner[1]) ? state.ownPartner[1] : "";
    Array.from(chosenPartnerSelect.options).forEach((option) => {
      option.disabled = Boolean(option.value && option.value === yourPlayerSelect.value);
    });
    savePartnerButton.disabled = Boolean(state.currentMatch) || state.players.length < 2;
    yourPlayerSelect.disabled = Boolean(state.currentMatch);
    chosenPartnerSelect.disabled = Boolean(state.currentMatch);
    if (state.ownPartner && state.ownPartner.every((id) => playerById(id))) {
      savedPartnerMessage.textContent = "Partner set: " + playerById(state.ownPartner[0]).name
        + " + " + playerById(state.ownPartner[1]).name;
    } else {
      savedPartnerMessage.textContent = "No partner chosen yet.";
    }
  }

  function renderMatch(teams, mode, savedNames) {
    matchTeams.replaceChildren();
    matchStats.replaceChildren();
    matchStats.hidden = true;
    if (!teams) {
      matchMessage.textContent = state.players.length < neededPlayers()
        ? "Add " + (neededPlayers() - state.players.length) + " more " + (neededPlayers() - state.players.length === 1 ? "player" : "players") + " to set up this match."
        : "No match is available yet.";
      startButton.disabled = true;
      return;
    }

    startButton.disabled = false;
    teams.forEach((team, index) => {
      const card = document.createElement("div");
      card.className = "team-card";
      const label = document.createElement("span");
      label.className = "team-label";
      label.textContent = mode === "singles" ? "PLAYER " + (index + 1) : "TEAM " + (index + 1);
      const names = document.createElement("div");
      names.className = "team-names";
      team.forEach((id) => {
        const player = playerById(id);
        const savedPlayer = savedNames && savedNames.flat().find((entry) => entry.id === id);
        const nameText = player ? displayName(player) : savedPlayer && savedPlayer.name;
        if (!nameText) return;
        const name = document.createElement("span");
        name.className = "team-player";
        const avatarDataUrl = player && player.avatarDataUrl;
        if (avatarDataUrl) {
          const avatar = document.createElement("img");
          avatar.src = avatarDataUrl;
          avatar.alt = "";
          name.append(avatar);
        }
        const label = document.createElement("span");
        label.textContent = nameText;
        name.append(label);
        names.append(name);
      });
      card.append(label, names);
      matchTeams.append(card);
    });
    const activePlayers = Array.from(new Map(teams.flat().map((id) => {
      const player = playerById(id);
      return player ? [player.id, player] : [];
    }).filter((entry) => entry.length)).values());
    if (activePlayers.length) {
      const title = document.createElement("p");
      title.className = "mini-stats-title";
      title.textContent = "Player stats before this match";
      const table = document.createElement("table");
      const head = document.createElement("thead");
      const heading = document.createElement("tr");
      ["Player", "Played", "Won", "Lost"].forEach((label) => {
        const cell = document.createElement("th");
        cell.scope = "col";
        cell.textContent = label;
        heading.append(cell);
      });
      head.append(heading);
      const body = document.createElement("tbody");
      activePlayers.forEach((player) => {
        const record = { played: 0, won: 0, lost: 0 };
        state.results.forEach((result) => {
          if (!Array.isArray(result.teams)) return;
          const teamIndex = result.teams.findIndex((team) =>
            Array.isArray(team) && team.some((entry) => entry.id === player.id)
          );
          if (teamIndex === -1) return;
          record.played += 1;
          if (result.winner === teamIndex) record.won += 1;
          else record.lost += 1;
        });
        const row = document.createElement("tr");
        const nameCell = document.createElement("td");
        const playerLabel = document.createElement("span");
        playerLabel.className = "mini-stats-player";
        if (player.avatarDataUrl) {
          const avatar = document.createElement("img");
          avatar.src = player.avatarDataUrl;
          avatar.alt = "";
          playerLabel.append(avatar);
        }
        const playerName = document.createElement("span");
        playerName.textContent = displayName(player);
        playerLabel.append(playerName);
        nameCell.append(playerLabel);
        row.append(nameCell);
        [record.played, record.won, record.lost].forEach((value) => {
          const cell = document.createElement("td");
          cell.textContent = String(value);
          row.append(cell);
        });
        body.append(row);
      });
      table.append(head, body);
      matchStats.append(title, table);
      matchStats.hidden = false;
    }
    matchMessage.textContent = state.currentMatch
      ? "This match is in progress. Continue to enter scores and complete it."
      : "Players who have not played this round are selected first.";
  }

  function render() {
    renderRoster();
    modeInputs.forEach((input) => {
      input.checked = input.value === state.mode;
      input.disabled = Boolean(state.currentMatch);
    });
    samePartner.checked = state.stayTogether;
    samePartner.disabled = Boolean(state.currentMatch);
    partnerOption.hidden = state.mode !== "doubles";
    partnerPicker.hidden = state.mode !== "doubles";
    renderPartnerPicker();
    const displayMode = state.currentMatch && state.currentMatch.mode ? state.currentMatch.mode : state.mode;
    matchFormat.textContent = displayMode === "doubles" ? "Doubles" : "Singles";

    const teams = state.currentMatch ? state.currentMatch.teams : candidateMatch();
    if (state.currentMatch) {
      matchTitle.textContent = "Current match";
      matchEyebrow.textContent = "IN PROGRESS";
      startButton.textContent = "Continue match";
      startButton.hidden = false;
    } else {
      matchTitle.textContent = "Match preview";
      matchEyebrow.textContent = "UP NEXT";
      startButton.textContent = "Start match";
      startButton.hidden = false;
    }
    renderMatch(teams, displayMode, state.currentMatch && state.currentMatch.names);
    const canJumble = state.players.length > 1 && !state.currentMatch;
    jumbleButton.disabled = !canJumble;
    fairnessNote.textContent = state.played.length
      ? state.played.length + " player" + (state.played.length === 1 ? " has" : "s have") + " played this round."
      : "Players take turns before anyone gets a second game.";
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const enteredName = nameInput.value.trim();
    if (!enteredName) {
      nameInput.focus();
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      let profile = null;
      const emailAddress = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(enteredName);
      if (!emailAddress) {
        const accountProfile = await currentAccountProfile();
        if (accountProfile
          && enteredName.toLocaleLowerCase() === accountProfile.display_name.trim().toLocaleLowerCase()) {
          profile = accountProfile;
        }
      }
      const enteredEmail = emailAddress;
      if (enteredEmail && navigator.onLine && !window.piqueueSupabase) {
        throw new Error("Profile lookup is not ready yet. Please try again.");
      }
      if (enteredEmail && window.piqueueSupabase && navigator.onLine) {
        const { data, error } = await window.piqueueSupabase.rpc("lookup_profile_by_email", {
          profile_email: enteredName
        });
        if (error) throw error;
        profile = Array.isArray(data) ? data[0] || null : null;
      }
      if (profile && state.players.some((player) =>
        player.registeredProfileId === profile.id || player.onlineId === profile.id
      )) {
        queueStatus.textContent = profile.display_name + " is already in the queue.";
        nameInput.focus();
        return;
      }
      const name = profile ? profile.display_name : enteredName;
      if (state.players.some((player) => player.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
        queueStatus.textContent = "That player is already in the queue.";
        nameInput.focus();
        return;
      }
      const player = profile ? {
        id: "registered-" + profile.id,
        registeredProfileId: profile.id,
        onlineId: profile.id,
        name: profile.display_name,
        avatarDataUrl: profile.avatar_data_url || ""
      } : {
        id: newUuid(),
        name
      };
      state.players.push(player);
      nameInput.value = "";
      queueStatus.textContent = profile
        ? profile.display_name + " added with their registered profile; match stats will count toward this account."
        : enteredEmail
          ? "No registered account found. Added without a profile photo."
          : "Player added to the queue.";
      saveState();
      render();
      nameInput.focus();
    } catch (error) {
      queueStatus.textContent = error && error.message
        ? error.message
        : "Unable to look up that profile. Please try again.";
      nameInput.focus();
    } finally {
      button.disabled = false;
    }
  });

  modeInputs.forEach((input) => input.addEventListener("change", () => {
    state.mode = input.value;
    if (state.currentMatch) state.currentMatch.mode = state.mode;
    saveState();
    render();
  }));

  samePartner.addEventListener("change", () => {
    state.stayTogether = samePartner.checked;
    saveState();
    render();
  });

  yourPlayerSelect.addEventListener("change", renderPartnerPicker);
  savePartnerButton.addEventListener("click", () => {
    const first = yourPlayerSelect.value;
    const second = chosenPartnerSelect.value;
    if (!first || !second || first === second) {
      queueStatus.textContent = "Choose two different players for your team.";
      return;
    }
    state.ownPartner = [first, second];
    queueStatus.textContent = "Your partner choice is saved.";
    saveState();
    render();
  });

  jumbleButton.addEventListener("click", () => {
    if (state.stayTogether && state.mode === "doubles") {
      const units = activePartnerPairs().map((pair) => pair.slice());
      const orderedIds = new Set(units.flat());
      state.players.filter((player) => !orderedIds.has(player.id)).forEach((player) => units.push([player.id]));
      shuffle(units);
      const byId = new Map(state.players.map((player) => [player.id, player]));
      state.players = units.flat().map((id) => byId.get(id)).filter(Boolean);
    } else {
      shuffle(state.players);
    }
    queueStatus.textContent = "Queue jumbled. Players with fewer games remain first.";
    saveState();
    render();
  });

  startButton.addEventListener("click", () => {
    if (state.currentMatch) {
      window.location.href = "score.html";
      return;
    }
    const teams = candidateMatch();
    if (!teams) return;
    if (state.mode === "doubles" && samePartner.checked) {
      teams.forEach((team) => {
        const pair = team.slice();
        if (pair.length === 2 && !state.partners.some((saved) => saved.includes(pair[0]) && saved.includes(pair[1]))) {
          state.partners.push(pair);
        }
      });
    }
    const queueId = newUuid();
    const teamSnapshots = teams.map((team) => team.map((id) => {
      const player = playerById(id);
      return {
        id,
        userId: player && player.onlineId ? player.onlineId : null,
        name: player ? displayName(player) : "",
        avatarDataUrl: player && player.avatarDataUrl || ""
      };
    }));
    state.currentMatch = { teams, mode: state.mode, scores: [0, 0], queueId, names: teamSnapshots };
    state.queueHistory.push({
      id: queueId,
      startedAt: new Date().toISOString(),
      mode: state.mode,
      players: state.players.map((player) => ({
        id: player.id,
        userId: player.onlineId || null,
        name: displayName(player)
      })),
      teams: teamSnapshots.map((team) => team.map((player) => ({
        id: player.id, userId: player.userId, name: player.name, avatarDataUrl: player.avatarDataUrl
      })))
    });
    queueStatus.textContent = "Match started.";
    if (saveState()) {
      window.location.href = "score.html";
    } else {
      state.currentMatch = null;
      render();
    }
  });

  render();
}());
