function getCurrentUser() {
  // Prefer sessionStorage, but fall back to localStorage so auth survives reloads/new tabs.
  const rawSession = sessionStorage.getItem('currentUser');
  const rawLocal = localStorage.getItem('currentUser');
  const raw = rawSession || rawLocal;
  if (!raw) return null;
  try {
    const user = JSON.parse(raw);
    // Keep sessionStorage in sync for the rest of the app.
    if (!rawSession) {
      sessionStorage.setItem('currentUser', JSON.stringify(user));
    }
    return user;
  } catch {
    return null;
  }
}

function requireAuth() {
  const user = getCurrentUser();
  if (!user) {
    window.location.href = 'login.html';
    return null;
  }
  // Also persist to localStorage so a reload/new tab doesn't lose auth.
  localStorage.setItem('currentUser', JSON.stringify(user));
  return user;
}

function logout() {
  sessionStorage.removeItem('currentUser');
  localStorage.removeItem('currentUser');
  window.location.href = 'login.html';
}

function renderHeader(user) {
  const displayName = user.firstName ? user.firstName : user.username;
  const img = user.imageUrl || 'https://via.placeholder.com/64?text=User';

  document.getElementById('appHeader').innerHTML = `
    <div class="card border-secondary">
      <div class="card-body d-flex flex-wrap align-items-center justify-content-between gap-3">
        <div class="d-flex align-items-center gap-3">
          <img
            src="${img}"
            alt="${displayName}"
            style="width:56px;height:56px;object-fit:cover;border-radius:50%;"
            onerror="this.onerror=null;this.src='https://via.placeholder.com/64?text=User';"
          />
          <div>
            <div class="text-muted small">Welcome</div>
            <div class="h5 m-0 text-primary">${displayName}</div>
          </div>
        </div>

        <div class="d-flex flex-wrap gap-2">
          <a class="btn btn-outline-light" href="search.html"><i class="fa-solid fa-magnifying-glass"></i> Search</a>
          <a class="btn btn-outline-light" href="playlists.html"><i class="fa-solid fa-music"></i> Playlists</a>
          <button class="btn btn-outline-danger" type="button" id="logoutBtn">
            <i class="fa-solid fa-right-from-bracket"></i> Logout
          </button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('logoutBtn').addEventListener('click', logout);
}

const user = requireAuth();
if (user) renderHeader(user);

// ===== Step 1: Playlists sidebar + select by querystring =====

// Storage shape:
// localStorage['playlistsByUser'] = { [username]: [ {id,name,createdAt,videos:[]} ] }
function readPlaylistsByUser() {
  const raw = localStorage.getItem('playlistsByUser');
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

function writePlaylistsByUser(obj) {
  localStorage.setItem('playlistsByUser', JSON.stringify(obj));
}

function getUserPlaylists(username) {
  const all = readPlaylistsByUser();
  return Array.isArray(all[username]) ? all[username] : [];
}

function setUserPlaylists(username, playlists) {
  const all = readPlaylistsByUser();
  all[username] = playlists;
  writePlaylistsByUser(all);
}

function getPlaylistIdFromQS() {
  const params = new URLSearchParams(window.location.search);
  return (params.get('playlistId') || '').trim();
}

function setPlaylistIdInQS(id) {
  const params = new URLSearchParams(window.location.search);
  if (id) params.set('playlistId', id); else params.delete('playlistId');
  const qs = params.toString();
  history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
}

const playlistsListEl = document.getElementById('playlistsList');
const noPlaylistsEl = document.getElementById('noPlaylists');
const activePlaylistNameEl = document.getElementById('activePlaylistName');
const pickPlaylistHintEl = document.getElementById('pickPlaylistHint');
const songsWrapEl = document.getElementById('songsWrap');
const emptyPlaylistEl = document.getElementById('emptyPlaylist');
const songsTableWrapEl = document.getElementById('songsTableWrap');
const songsTbodyEl = document.getElementById('songsTbody');

const playlistsSortSelectEl = document.getElementById('playlistsSortSelect');
const songsSortWrapEl = document.getElementById('songsSortWrap');
const songsSortSelectEl = document.getElementById('songsSortSelect');

const songsSearchInputEl = document.getElementById('songsSearchInput');
const noSongsFoundEl = document.getElementById('noSongsFound');

const newPlaylistBtn = document.getElementById('newPlaylistBtn');

// New playlist modal refs
const newPlModalEl = document.getElementById('newPlModal');
const newPlModal = new bootstrap.Modal(newPlModalEl);
const newPlNameEl = document.getElementById('newPlName');
const newPlErrEl = document.getElementById('newPlErr');
const createPlBtn = document.getElementById('createPlBtn');

// Playlist player modal refs
const playlistPlayerModalEl = document.getElementById('playlistPlayerModal');
const playlistPlayerModal = new bootstrap.Modal(playlistPlayerModalEl);
const playlistPlayerTitleEl = document.getElementById('playlistPlayerTitle');
const playlistPlayerFrameEl = document.getElementById('playlistPlayerFrame');
const playlistPrevBtn = document.getElementById('playlistPrevBtn');
const playlistNextBtn = document.getElementById('playlistNextBtn');

let playlists = [];
let activePlaylistId = '';
let songsSearchTerm = '';

// ===== YouTube autoplay playlist player =====
// We need the IFrame Player API to detect when a video ends and then play the next one.
if (!window.YT || !window.YT.Player) {
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
}

let ytReady = false;
let ytPlayer = null;

let playingPlaylistId = '';
let playingVideos = [];
let playingIndex = 0;
let pendingVideoId = null;

// Called by the YouTube IFrame API when it finishes loading
window.onYouTubeIframeAPIReady = function () {
  ytReady = true;
  if (pendingVideoId) {
    createYTPlayer(pendingVideoId);
    pendingVideoId = null;
  }
};

function createYTPlayer(videoId) {
  // Clear container (important if reopening modal)
  playlistPlayerFrameEl.innerHTML = '';

  ytPlayer = new YT.Player('playlistPlayerFrame', {
    videoId,
    playerVars: { autoplay: 1, rel: 0 },
    events: {
      onStateChange: (event) => {
        if (event.data === YT.PlayerState.ENDED) {
          if (playingVideos.length > 1) {
            playAtIndex(playingIndex + 1);
          }
        }
      }
    }
  });
}

function playAtIndex(index) {
  if (!playingVideos.length) return;

  // Wrap around
  if (index < 0) index = playingVideos.length - 1;
  if (index >= playingVideos.length) index = 0;
  playingIndex = index;

  const pl = playlists.find(p => p.id === playingPlaylistId) || null;
  const plName = pl ? pl.name : 'Playlist';
  const v = playingVideos[playingIndex];

  playlistPlayerTitleEl.innerHTML = `<i class="fa-solid fa-play"></i> ${plName} — ${v.title || 'Track'}`;

  // Disable nav if only one song
  const disableNav = playingVideos.length <= 1;
  playlistPrevBtn.disabled = disableNav;
  playlistNextBtn.disabled = disableNav;

  if (ytPlayer && ytReady) {
    ytPlayer.loadVideoById(v.videoId);
  } else if (ytReady) {
    createYTPlayer(v.videoId);
  } else {
    // API not ready yet; queue the first video
    pendingVideoId = v.videoId;
  }
}

// Prev/Next buttons
playlistPrevBtn.addEventListener('click', () => playAtIndex(playingIndex - 1));
playlistNextBtn.addEventListener('click', () => playAtIndex(playingIndex + 1));

function safeJSON(key, fallback) {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

function extractVideoId(url) {
  if (!url) return null;
  const regExp = /^.*(?:youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]{11}).*/;
  const match = String(url).match(regExp);
  return match ? match[1] : null;
}

function normalizeVideo(v) {
  const url = v.url || v.watchUrl || v.link || '';
  const title = v.title || v.name || '';
  const videoId = v.videoId || extractVideoId(url) || '';
  const thumbnail = v.thumbnail || (videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : '');

  let rating = Number(v.rating);
  if (!Number.isFinite(rating)) rating = 0;
  if (rating < 0) rating = 0;
  if (rating > 10) rating = 10;

  return {
    videoId,
    title,
    url,
    thumbnail,
    rating
  };
}

// ===== Drag & Drop reorder for songs inside a playlist =====
let draggedRow = null;
let dndBound = false;

function getDragAfterElement(container, y) {
  const rows = [...container.querySelectorAll('tr[draggable="true"]:not(.tt-dragging)')];
  let closest = { offset: Number.NEGATIVE_INFINITY, element: null };

  for (const row of rows) {
    const box = row.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      closest = { offset, element: row };
    }
  }
  return closest.element;
}

function persistPlaylistOrderFromDOM() {
  const pl = playlists.find(p => p.id === activePlaylistId);
  if (!pl) return;

  const ids = [...songsTbodyEl.querySelectorAll('tr[data-videoid]')]
    .map(tr => tr.dataset.videoid)
    .filter(Boolean);

  // Build a map from current playlist videos by videoId
  const map = new Map((pl.videos || []).map(x => {
    const nx = normalizeVideo(x);
    return [nx.videoId, nx];
  }));

  pl.videos = ids.map(id => map.get(id)).filter(Boolean);
  setUserPlaylists(user.username, playlists);
}

function bindSongsDnDOnce() {
  if (dndBound) return;
  dndBound = true;

  songsTbodyEl.addEventListener('dragstart', (e) => {
    const tr = e.target.closest('tr[data-videoid]');
    if (!tr) return;
    draggedRow = tr;
    tr.classList.add('tt-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tr.dataset.videoid);
  });

  songsTbodyEl.addEventListener('dragover', (e) => {
    if (!draggedRow) return;
    e.preventDefault();
    const after = getDragAfterElement(songsTbodyEl, e.clientY);
    if (after == null) songsTbodyEl.appendChild(draggedRow);
    else songsTbodyEl.insertBefore(draggedRow, after);
  });

  songsTbodyEl.addEventListener('dragend', () => {
    if (!draggedRow) return;
    draggedRow.classList.remove('tt-dragging');
    draggedRow = null;
    persistPlaylistOrderFromDOM();
  });
}

function getPlaylistAverageRating(pl) {
  const vids = Array.isArray(pl?.videos) ? pl.videos.map(normalizeVideo) : [];
  if (!vids.length) return 0;
  const sum = vids.reduce((acc, v) => acc + (Number(v.rating) || 0), 0);
  return sum / vids.length;
}

function sortByMode(arr, mode, getTitle, getRating) {
  if (mode === 'az') {
    arr.sort((a, b) => String(getTitle(a)).localeCompare(String(getTitle(b))));
  } else if (mode === 'za') {
    arr.sort((a, b) => String(getTitle(b)).localeCompare(String(getTitle(a))));
  } else if (mode === 'rating') {
    arr.sort((a, b) => (getRating(b) - getRating(a)) || String(getTitle(a)).localeCompare(String(getTitle(b))));
  }
}

function applyPlaylistsSorting(mode) {
  // View-only sorting: do not mutate or persist stored order here.
  // Kept for backward compatibility but intentionally does nothing.
  return;
}

function applySongsSorting(mode) {
  // View-only sorting: do not mutate or persist stored order here.
  // Kept for backward compatibility but intentionally does nothing.
  return;
}

function getSortedPlaylistsForView() {
  const mode = (playlistsSortSelectEl?.value || '').trim();
  if (!mode) return playlists;
  const copy = [...playlists];
  sortByMode(copy, mode, (p) => p.name, (p) => getPlaylistAverageRating(p));
  return copy;
}

function getSortedSongsForView(videos) {
  const mode = (songsSortSelectEl?.value || '').trim();
  if (!mode) return videos;
  const copy = [...videos];
  sortByMode(copy, mode, (v) => v.title, (v) => Number(v.rating) || 0);
  return copy;
}

function renderSongs(playlist) {
  const allVids = Array.isArray(playlist?.videos) ? playlist.videos.map(normalizeVideo) : [];

  songsTbodyEl.innerHTML = '';

  // Empty playlist
  if (!allVids.length) {
    emptyPlaylistEl.classList.remove('d-none');
    noSongsFoundEl.classList.add('d-none');
    songsTableWrapEl.classList.add('d-none');
    return;
  }

  // Filter by search term (title)
  const term = (songsSearchTerm || '').trim().toLowerCase();
  const filtered = term
    ? allVids.filter(v => String(v.title || '').toLowerCase().includes(term))
    : allVids;

  // View-only sorting (does not change stored order)
  const vids = getSortedSongsForView(filtered);

  emptyPlaylistEl.classList.add('d-none');

  // No matches
  if (!vids.length) {
    noSongsFoundEl.classList.remove('d-none');
    songsTableWrapEl.classList.add('d-none');
    return;
  }

  noSongsFoundEl.classList.add('d-none');
  songsTableWrapEl.classList.remove('d-none');

  for (const v of vids) {
    const tr = document.createElement('tr');
    tr.setAttribute('draggable', 'true');
    tr.dataset.videoid = v.videoId;
    tr.innerHTML = `
      <td>
        <div class="d-flex align-items-center gap-3">
          <i class="fa-solid fa-grip-vertical text-muted"></i>
          <img src="${v.thumbnail}" alt="" style="width:84px;height:56px;object-fit:cover;border-radius:8px;" />
          <div class="fw-semibold">${v.title || '(untitled)'}</div>
        </div>
      </td>
      <td>
        <input
          type="number"
          min="0"
          max="10"
          step="1"
          class="form-control form-control-sm"
          value="${Number.isFinite(v.rating) ? v.rating : 0}"
          data-videoid="${v.videoId}"
          aria-label="Rating"
        />
      </td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-info me-2" type="button" data-action="play" data-videoid="${v.videoId}">
          <i class="fa-solid fa-play"></i> Play
        </button>
        <button class="btn btn-sm btn-outline-danger" type="button" data-action="remove" data-videoid="${v.videoId}">
          <i class="fa-solid fa-trash"></i> Remove
        </button>
      </td>
    `;

    tr.querySelector('button[data-action="remove"]').addEventListener('click', (e) => {
      const vid = e.currentTarget.getAttribute('data-videoid');
      const pl = playlists.find(p => p.id === activePlaylistId);
      if (!pl) return;
      pl.videos = (pl.videos || []).filter(x => (x.videoId || extractVideoId(x.url || '')) !== vid);
      setUserPlaylists(user.username, playlists);
      renderSongs(pl);
    });

    tr.querySelector('button[data-action="play"]').addEventListener('click', (e) => {
      const vid = e.currentTarget.getAttribute('data-videoid');
      const pl = playlists.find(p => p.id === activePlaylistId) || null;
      if (!pl) return;

      const vids = Array.isArray(pl.videos) ? pl.videos.map(normalizeVideo).filter(v => v.videoId) : [];
      if (!vids.length) {
        alert('This playlist is empty. Add songs first.');
        return;
      }

      const idx = vids.findIndex(v => v.videoId === vid);
      playingPlaylistId = activePlaylistId;
      playingVideos = vids;
      playingIndex = idx >= 0 ? idx : 0;

      playlistPlayerModal.show();
      playAtIndex(playingIndex);
    });

    // Persist rating changes
    const ratingInput = tr.querySelector('input[data-videoid]');
    ratingInput.addEventListener('change', (e) => {
      const vid = e.currentTarget.getAttribute('data-videoid');
      let val = Number(e.currentTarget.value);
      if (!Number.isFinite(val)) val = 0;
      if (val < 0) val = 0;
      if (val > 10) val = 10;
      e.currentTarget.value = val;

      const pl = playlists.find(p => p.id === activePlaylistId);
      if (!pl) return;
      pl.videos = (pl.videos || []).map(x => {
        const nx = normalizeVideo(x);
        if (nx.videoId === vid) {
          return { ...nx, rating: val };
        }
        return nx;
      });
      setUserPlaylists(user.username, playlists);
      renderSidebar();
    });

    songsTbodyEl.appendChild(tr);
  }

}

function importLegacyFavoritesIfNeeded(currentUser) {
  // Try a few common keys that earlier steps might have used
  const keys = [
    `favorites_${currentUser.username}`,
    `${currentUser.username}_favorites`,
    'favorites',
    'favoriteSongs',
    'songs' // last resort
  ];

  let legacy = [];
  for (const k of keys) {
    const arr = safeJSON(k, []);
    if (Array.isArray(arr) && arr.length) {
      // If key is 'songs', only use items that look like YouTube entries
      if (k === 'songs') {
        const yt = arr.filter(s => extractVideoId(s.url || s.link || ''));
        if (yt.length) { legacy = yt; break; }
      } else {
        legacy = arr;
        break;
      }
    }
  }

  if (!legacy.length) return;

  // Find Favorites playlist (by name), create it if missing
  let fav = playlists.find(p => String(p.name).toLowerCase() === 'favorites');
  if (!fav) {
    fav = { id: Date.now().toString(), name: 'Favorites', createdAt: Date.now(), videos: [] };
    playlists.unshift(fav);
  }

  // If favorites already has videos, do nothing
  if (Array.isArray(fav.videos) && fav.videos.length) return;

  fav.videos = legacy.map(normalizeVideo).filter(v => v.videoId && v.url);
  setUserPlaylists(currentUser.username, playlists);
}

function renderSidebar() {
  playlistsListEl.innerHTML = '';

  if (!playlists.length) {
    noPlaylistsEl.classList.remove('d-none');
    return;
  }
  noPlaylistsEl.classList.add('d-none');

  const viewPlaylists = getSortedPlaylistsForView();
  for (const pl of viewPlaylists) {
    const isActive = pl.id === activePlaylistId;

    const item = document.createElement('div');
    item.className = `list-group-item list-group-item-action d-flex justify-content-between align-items-center ${isActive ? 'active' : ''}`;
    item.style.userSelect = 'none';

    // Name (select)
    const nameSpan = document.createElement('span');
    nameSpan.className = 'flex-grow-1 fw-semibold';
    nameSpan.textContent = pl.name;
    nameSpan.style.cursor = 'pointer';
    nameSpan.addEventListener('click', () => selectPlaylist(pl.id));

    // Play button (kept as select for now)
    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = `btn btn-sm ${isActive ? 'btn-light' : 'btn-outline-info'} ms-2`;
    playBtn.innerHTML = `<i class="fa-solid fa-play me-1"></i> Play playlist`;
    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      playPlaylist(pl.id);
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = `btn btn-sm ${isActive ? 'btn-light' : 'btn-outline-danger'} ms-2`;
    delBtn.innerHTML = `<i class="fa-solid fa-trash"></i>`;
    delBtn.title = 'Delete playlist';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deletePlaylist(pl.id);
    });

    item.appendChild(nameSpan);
    item.appendChild(playBtn);
    item.appendChild(delBtn);
    playlistsListEl.appendChild(item);
  }
}

function renderMain() {
  const pl = playlists.find(p => p.id === activePlaylistId) || null;
  if (!pl) {
    activePlaylistNameEl.textContent = '';
    pickPlaylistHintEl.classList.remove('d-none');
    songsWrapEl.classList.add('d-none');
    songsSortWrapEl.classList.add('d-none');
    return;
  }

  activePlaylistNameEl.textContent = pl.name;
  pickPlaylistHintEl.classList.add('d-none');
  songsSortWrapEl.classList.remove('d-none');
  songsWrapEl.classList.remove('d-none');
  renderSongs(pl);
}

function selectPlaylist(id) {
  activePlaylistId = id;
  setPlaylistIdInQS(id);
  songsSearchTerm = '';
  if (songsSearchInputEl) songsSearchInputEl.value = '';
  renderSidebar();
  renderMain();
}

function deletePlaylist(id) {
  const pl = playlists.find(p => p.id === id);
  if (!pl) return;

  const ok = confirm(`Delete playlist "${pl.name}"?`);
  if (!ok) return;

  playlists = playlists.filter(p => p.id !== id);
  setUserPlaylists(user.username, playlists);

  // If we deleted the active playlist, select the first one if exists (per requirements)
  if (activePlaylistId === id) {
    if (playlists.length) {
      activePlaylistId = playlists[0].id;
      setPlaylistIdInQS(activePlaylistId);
    } else {
      activePlaylistId = '';
      setPlaylistIdInQS('');
    }
  }

  renderSidebar();
  renderMain();
}

function playPlaylist(id) {
  const pl = playlists.find(p => p.id === id) || null;
  if (!pl) return;

  // Select playlist on the right too
  selectPlaylist(id);

  const vids = Array.isArray(pl.videos) ? pl.videos.map(normalizeVideo).filter(v => v.videoId) : [];
  if (!vids.length) {
    alert('This playlist is empty. Add songs first.');
    return;
  }

  playingPlaylistId = id;
  playingVideos = vids;
  playingIndex = 0;

  playlistPlayerModal.show();
  playAtIndex(0);
}

playlistPlayerModalEl.addEventListener('hidden.bs.modal', () => {
  playingPlaylistId = '';
  playingVideos = [];
  playingIndex = 0;
  pendingVideoId = null;

  if (ytPlayer) {
    ytPlayer.destroy();
    ytPlayer = null;
  }
  playlistPlayerFrameEl.innerHTML = '';

  playlistPlayerTitleEl.innerHTML = `<i class="fa-solid fa-play"></i> Playlist Player`;
  playlistPrevBtn.disabled = false;
  playlistNextBtn.disabled = false;
});

function bootPlaylistsStep1(currentUser) {
  playlists = getUserPlaylists(currentUser.username);
  importLegacyFavoritesIfNeeded(currentUser);
  // reload after possible import
  playlists = getUserPlaylists(currentUser.username);

  // Pick from querystring; if none/invalid and playlists exist, auto-select first.
  const qsId = getPlaylistIdFromQS();
  if (qsId && playlists.some(p => p.id === qsId)) {
    activePlaylistId = qsId;
  } else if (playlists.length) {
    activePlaylistId = playlists[0].id;
    setPlaylistIdInQS(activePlaylistId);
  } else {
    activePlaylistId = '';
    setPlaylistIdInQS('');
  }

  // Sorting is view-only and starts unset by default
  playlistsSortSelectEl.value = '';
  songsSortSelectEl.value = '';
  renderSidebar();
  renderMain();

  playlistsSortSelectEl.addEventListener('change', () => {
    renderSidebar();
    renderMain();
  });

  songsSortSelectEl.addEventListener('change', () => {
    renderMain();
  });

  songsSearchInputEl.addEventListener('input', () => {
    songsSearchTerm = songsSearchInputEl.value || '';
    renderMain();
  });

  // Enable drag & drop reorder in the songs table
  bindSongsDnDOnce();

  // New playlist modal
  newPlaylistBtn.addEventListener('click', () => {
    newPlErrEl.classList.add('d-none');
    newPlErrEl.textContent = '';
    newPlNameEl.value = '';
    newPlModal.show();
  });

  createPlBtn.onclick = () => {
    const name = (newPlNameEl.value || '').trim();
    newPlErrEl.classList.add('d-none');
    newPlErrEl.textContent = '';

    if (!name) {
      newPlErrEl.textContent = 'Playlist name is required.';
      newPlErrEl.classList.remove('d-none');
      return;
    }

    const pl = { id: Date.now().toString(), name, createdAt: Date.now(), videos: [] };
    playlists.unshift(pl);
    setUserPlaylists(currentUser.username, playlists);
    newPlModal.hide();
    selectPlaylist(pl.id);
  };
}

if (user) {
  bootPlaylistsStep1(user);
}
