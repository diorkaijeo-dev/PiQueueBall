(function () {
  "use strict";

  const MAX_PICTURE_BYTES = 1024 * 1024;
  const profileForm = document.getElementById("profile-form");
  const profileContent = document.getElementById("profile-content");
  const nicknameInput = document.getElementById("profile-nickname");
  const pictureInput = document.getElementById("profile-picture");
  const picturePreview = document.getElementById("profile-picture-preview");
  const initials = document.getElementById("profile-initials");
  const removePictureButton = document.getElementById("remove-picture");
  const status = document.getElementById("profile-status");
  let currentUserId = "";
  let ownProfile = null;
  let pendingPicture = "";

  function updatePicturePreview(value, profile) {
    const picture = value || profile && profile.avatar_data_url;
    if (picture) {
      picturePreview.src = picture;
      picturePreview.hidden = false;
      initials.hidden = true;
    } else {
      picturePreview.removeAttribute("src");
      picturePreview.hidden = true;
      initials.textContent = profile ? profile.display_name.slice(0, 2).toLocaleUpperCase() : "";
      initials.hidden = false;
    }
  }

  function renderOwnProfile(profile) {
    if (!profile || profile.id !== currentUserId) {
      throw new Error("Only the signed-in user's profile can be shown here.");
    }
    ownProfile = profile;
    pendingPicture = profile.avatar_data_url || "";
    nicknameInput.value = profile.display_name;
    pictureInput.value = "";
    profileForm.hidden = false;
    document.getElementById("profile-display-name").textContent = "Your online player profile";
    updatePicturePreview(profile.avatar_data_url || "", profile);
    profileContent.hidden = false;
    renderCloudStats(profile).catch((error) => {
      status.textContent = error.message || "Unable to load online match statistics.";
    });
  }

  async function renderCloudStats(profile) {
    const stats = document.getElementById("profile-stats");
    const empty = document.getElementById("empty-profile-stats");
    const list = document.getElementById("partner-stats");
    const partnerEmpty = document.getElementById("empty-partner-stats");
    const { data: matches, error } = await window.piqueueSupabase.from("match_records")
      .select("id, client_match_id, mode, score_one, score_two, winner_team, played_at, match_players(player_id, team_index, player_name)")
      .order("played_at", { ascending: false });
    if (error) throw error;

    const record = { played: 0, wins: 0, losses: 0, lastPlayed: null, recentPartner: null, partners: new Map() };
    const countedMatches = new Set();
    const profileName = profile.display_name.trim().toLocaleLowerCase();
    function accumulateMatch({ id, mode, winner, playedAtValue, members }) {
      if (id && countedMatches.has(id)) return;
      if (id) countedMatches.add(id);
      const mine = members.find((member) => member.player_id === profile.id
        || (!member.player_id && member.player_name.trim().toLocaleLowerCase() === profileName));
      if (!mine) return;
      record.played += 1;
      if (winner === mine.team_index) record.wins += 1;
      else record.losses += 1;
      const playedAt = new Date(playedAtValue);
      if (!Number.isNaN(playedAt.getTime()) && (!record.lastPlayed || playedAt > record.lastPlayed)) {
        record.lastPlayed = playedAt;
      }
      if (mode !== "doubles") return;
      const partner = members.find((member) => member !== mine && member.team_index === mine.team_index);
      if (!partner) return;
      let partnerRecord = record.partners.get(partner.player_id || partner.player_name);
      if (!partnerRecord) {
        partnerRecord = { name: partner.player_name, played: 0, wins: 0, losses: 0, lastPlayed: null };
        record.partners.set(partner.player_id || partner.player_name, partnerRecord);
      }
      partnerRecord.played += 1;
      if (winner === mine.team_index) partnerRecord.wins += 1;
      else partnerRecord.losses += 1;
      if (!Number.isNaN(playedAt.getTime()) && (!partnerRecord.lastPlayed || playedAt > partnerRecord.lastPlayed)) {
        partnerRecord.lastPlayed = playedAt;
      }
      if (!record.recentPartner || (!Number.isNaN(playedAt.getTime()) && playedAt > record.recentPartner.date)) {
        record.recentPartner = { name: partner.player_name, date: playedAt };
      }
    }

    matches.forEach((match) => accumulateMatch({
      id: match.client_match_id || match.id,
      mode: match.mode,
      winner: match.winner_team,
      playedAtValue: match.played_at,
      members: match.match_players || []
    }));

    const savedState = localStorage.getItem("piqueueball.queue.v1");
    if (savedState) {
      const localState = JSON.parse(savedState);
      if (!localState || !Array.isArray(localState.results)) {
        throw new Error("Saved local match results are invalid.");
      }
      localState.results.forEach((match) => {
        const members = (match.teams || []).flatMap((team, teamIndex) =>
          (Array.isArray(team) ? team : []).map((player) => ({
            player_id: player.userId || null,
            player_name: player.name,
            team_index: teamIndex
          }))
        );
        accumulateMatch({
          id: match.queueId || match.id,
          mode: match.mode,
          winner: match.winner,
          playedAtValue: match.completedAt,
          members
        });
      });
    }

    const values = [
      ["Games won", record.wins],
      ["Games lost", record.losses],
      ["Win rate", (record.played ? Math.round((record.wins / record.played) * 100) : 0) + "%"],
      ["Recent partner", record.recentPartner ? record.recentPartner.name : "None yet"],
      ["Last played", record.lastPlayed ? record.lastPlayed.toLocaleDateString() : "Never"]
    ];
    stats.replaceChildren();
    values.forEach(([label, value]) => {
      const row = document.createElement("div");
      row.className = "profile-stat";
      const term = document.createElement("dt");
      term.textContent = label;
      const description = document.createElement("dd");
      description.textContent = String(value);
      row.append(term, description);
      stats.append(row);
    });
    empty.hidden = record.played > 0;
    empty.textContent = "Complete a match to start building player stats.";

    list.replaceChildren();
    const frequentPartners = Array.from(record.partners.values()).filter((partner) => partner.played >= 2);
    frequentPartners.forEach((partner) => {
      const item = document.createElement("li");
      item.className = "partner-stat-item";
      const name = document.createElement("strong");
      name.textContent = partner.name;
      const summary = document.createElement("span");
      summary.textContent = partner.played + " games · " + partner.wins + " wins · "
        + partner.losses + " losses · " + Math.round((partner.wins / partner.played) * 100) + "% wins";
      item.append(name, summary);
      list.append(item);
    });
    partnerEmpty.hidden = frequentPartners.length > 0;
  }

  pictureInput.addEventListener("change", () => {
    const file = pictureInput.files[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) {
      pictureInput.value = "";
      status.textContent = "Choose a PNG, JPEG, WebP, or GIF image.";
      return;
    }
    if (file.size > MAX_PICTURE_BYTES) {
      pictureInput.value = "";
      status.textContent = "Profile pictures must be 1 MB or smaller.";
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") {
        status.textContent = "The selected picture could not be read.";
        return;
      }
      pendingPicture = reader.result;
      updatePicturePreview(pendingPicture, ownProfile);
      status.textContent = "Picture ready. Save your profile to keep it.";
    });
    reader.addEventListener("error", () => {
      status.textContent = "Unable to read the selected picture.";
    });
    reader.readAsDataURL(file);
  });

  removePictureButton.addEventListener("click", () => {
    pendingPicture = "";
    pictureInput.value = "";
    updatePicturePreview("", ownProfile);
    status.textContent = "Picture removed from this profile. Save your profile to apply the change.";
  });

  profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!ownProfile || ownProfile.id !== currentUserId) {
      status.textContent = "Your profile is still loading. Try again shortly.";
      return;
    }
    const button = profileForm.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const { data: updatedProfile, error } = await window.piqueueSupabase.from("profiles").update({
        display_name: nicknameInput.value.trim() || "Player",
        avatar_data_url: pendingPicture,
        updated_at: new Date().toISOString()
      }).eq("id", currentUserId).select("id, display_name, avatar_data_url").single();
      if (error) throw error;
      renderOwnProfile(updatedProfile);
      status.textContent = "Profile saved.";
    } catch (error) {
      status.textContent = error.message || "Unable to save your profile.";
    } finally {
      button.disabled = false;
    }
  });

  async function loadOwnProfile() {
    const session = await window.piqueueAuth.ready;
    if (!session) return;
    currentUserId = session.user.id;
    const { data: profile, error } = await window.piqueueSupabase.from("profiles")
      .select("id, display_name, avatar_data_url")
      .eq("id", currentUserId)
      .single();
    if (error) throw error;
    renderOwnProfile(profile);
  }

  window.piqueueAuth.ready.then(() => loadOwnProfile()).catch((error) => {
    status.textContent = error.message || "Your profile could not be loaded.";
  });
}());
