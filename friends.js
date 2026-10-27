(function () {
  "use strict";

  const STORAGE_KEY = "piqueueball.queue.v1";
  const client = window.piqueueSupabase;
  const status = document.getElementById("friends-status");
  const form = document.getElementById("friend-form");
  let signedInUser;

  function showError(error) {
    status.textContent = error && error.message ? error.message : "Unable to complete that action.";
  }

  function card(profile, actions) {
    const item = document.createElement("li");
    item.className = "friend-item";
    const avatar = document.createElement("span");
    avatar.className = "friend-avatar";
    if (profile.avatar_data_url) {
      const image = document.createElement("img");
      image.src = profile.avatar_data_url;
      image.alt = "";
      avatar.append(image);
    } else {
      avatar.textContent = profile.display_name.slice(0, 2).toLocaleUpperCase();
    }
    const name = document.createElement("strong");
    name.className = "friend-name";
    name.textContent = profile.display_name;
    const controls = document.createElement("div");
    controls.className = "friend-actions";
    actions.forEach((action) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = action.primary ? "btn secondary-button" : "friend-action";
      button.textContent = action.label;
      button.addEventListener("click", action.run);
      controls.append(button);
    });
    item.append(avatar, name, controls);
    return item;
  }

  function addToQueue(profile) {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const state = saved ? JSON.parse(saved) : {
        players: [], played: [], partners: [], ownPartner: null, mode: "singles",
        stayTogether: false, currentMatch: null, results: [], queueHistory: [], profiles: {}
      };
      if (!Array.isArray(state.players)) throw new Error("The saved queue data is invalid.");
      if (state.currentMatch) {
        status.textContent = "Finish the current match before adding players to the queue.";
        return;
      }
      if (state.players.some((player) => player.onlineId === profile.id)) {
        status.textContent = profile.display_name + " is already in the queue.";
        return;
      }
      state.players.push({
        id: "online-" + profile.id,
        onlineId: profile.id,
        name: profile.display_name,
        avatarDataUrl: profile.avatar_data_url || ""
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      status.textContent = profile.display_name + " added to the queue.";
    } catch (error) {
      status.textContent = "Unable to add this player to the queue. Check browser storage.";
    }
  }

  async function loadFriends(user) {
    status.textContent = "Loading friends…";
    const { data: relations, error } = await client.from("friendships")
      .select("id, requester_id, addressee_id, status, created_at")
      .or("requester_id.eq." + user.id + ",addressee_id.eq." + user.id)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const profilesById = new Map();
    const profileIds = Array.from(new Set(relations.flatMap((relation) =>
      [relation.requester_id, relation.addressee_id].filter((id) => id !== user.id)
    )));
    if (profileIds.length) {
      const { data: profiles, error: profileError } = await client.from("profiles")
        .select("id, display_name, avatar_data_url")
        .in("id", profileIds);
      if (profileError) throw profileError;
      profiles.forEach((profile) => profilesById.set(profile.id, profile));
    }

    const requests = document.getElementById("request-list");
    const friends = document.getElementById("friend-list");
    requests.replaceChildren();
    friends.replaceChildren();
    let pendingCount = 0;
    let friendCount = 0;

    relations.forEach((relation) => {
      const otherId = relation.requester_id === user.id ? relation.addressee_id : relation.requester_id;
      const profile = profilesById.get(otherId);
      if (!profile) return;
      if (relation.status === "accepted") {
        friendCount += 1;
        friends.append(card(profile, [
          { label: "Add to queue", primary: true, run: () => addToQueue(profile) },
          {
            label: "Remove",
            run: async () => {
              const { error: removeError } = await client.rpc("remove_friend", { friend_id: otherId });
              if (removeError) showError(removeError);
              else {
                status.textContent = "Friend removed.";
                await loadFriends(user);
              }
            }
          }
        ]));
      } else {
        pendingCount += 1;
        const incoming = relation.addressee_id === user.id;
        requests.append(card(profile, incoming ? [
          {
            label: "Accept",
            primary: true,
            run: async () => {
              const { error: responseError } = await client.rpc("respond_to_friend_request", {
                request_id: relation.id,
                accept_request: true
              });
              if (responseError) showError(responseError);
              else {
                status.textContent = "Friend request accepted.";
                await loadFriends(user);
              }
            }
          },
          {
            label: "Decline",
            run: async () => {
              const { error: responseError } = await client.rpc("respond_to_friend_request", {
                request_id: relation.id,
                accept_request: false
              });
              if (responseError) showError(responseError);
              else await loadFriends(user);
            }
          }
        ] : [{ label: "Sent", run: () => {} }]));
      }
    });

    document.getElementById("empty-requests").hidden = pendingCount > 0;
    document.getElementById("empty-friends").hidden = friendCount > 0;
    document.getElementById("friends-count").textContent = friendCount + (friendCount === 1 ? " friend" : " friends");
    status.textContent = "";
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    const { error } = await client.rpc("request_friend_by_email", {
      friend_email: document.getElementById("friend-email").value.trim()
    });
    button.disabled = false;
    if (error) {
      showError(error);
      return;
    }
    document.getElementById("friend-email").value = "";
    status.textContent = "Friend request sent.";
    const { data } = await client.auth.getUser();
    if (data.user) await loadFriends(data.user);
  });

  document.getElementById("add-self").addEventListener("click", async () => {
    try {
      const { data: profile, error } = await client.from("profiles")
        .select("id, display_name, avatar_data_url")
        .eq("id", signedInUser.id)
        .single();
      if (error) throw error;
      addToQueue(profile);
    } catch (error) {
      showError(error);
    }
  });

  window.piqueueAuth.ready.then((session) => {
    if (!session) return;
    signedInUser = session.user;
    loadFriends(session.user).catch(showError);
  }).catch(showError);
}());
