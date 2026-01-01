// ===== AUTH =====
function getCurrentUser() {
const raw = sessionStorage.getItem('currentUser');
if (!raw) return null;
try { return JSON.parse(raw); } catch { return null; }
}

function requireAuth() {
const user = getCurrentUser();
if (!user) {
  window.location.href = 'login.html';
  return null;
}
return user;
}

function logout() {
sessionStorage.removeItem('currentUser');
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

// ===== DOM =====
const qEl = document.getElementById('q');
const searchBtn = document.querySelector('button.btn.btn-primary');

const apiHint = document.getElementById('apiHint');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');

// Player modal
const playerModalEl = document.getElementById('playerModal');
const playerModal = new bootstrap.Modal(playerModalEl);
const playerFrame = document.getElementById('playerFrame');
const playerTitle = document.getElementById('playerTitle');
playerModalEl.addEventListener('hidden.bs.modal', () => {
  playerFrame.src = '';
  const playerFallback = document.getElementById('playerFallback');
  const openOnYouTube = document.getElementById('openOnYouTube');
  if (playerFallback) playerFallback.classList.add('d-none');
  if (openOnYouTube) openOnYouTube.href = '#';
});

// Favorites modal
const favModalEl = document.getElementById('favModal');
const favModal = new bootstrap.Modal(favModalEl);
const favSelect = document.getElementById('favSelect');
const favNewName = document.getElementById('favNewName');
const favErr = document.getElementById('favErr');
const favConfirmBtn = document.getElementById('favConfirmBtn');

// Toast
const toastEl = document.getElementById('saveToast');
const toastBody = document.getElementById('toastBody');
const toast = new bootstrap.Toast(toastEl, { delay: 3500 });

function showToast(html) {
toastBody.innerHTML = html;
toast.show();
}

function setStatus(text) {
statusEl.textContent = text || '';
}

// ===== QUERYSTRING =====
function setQueryString(q) {
const params = new URLSearchParams(window.location.search);
if (q) params.set('q', q); else params.delete('q');
history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
}

function getQueryStringQ() {
const params = new URLSearchParams(window.location.search);
return (params.get('q') || '').trim();
}

// ===== STATE (restore page like it was) =====
function stateKey(username) { return `search_state_${username}`; }

function saveState(username, state) {
sessionStorage.setItem(stateKey(username), JSON.stringify(state));
}

function loadState(username) {
const raw = sessionStorage.getItem(stateKey(username));
if (!raw) return null;
try { return JSON.parse(raw); } catch { return null; }
}

// ===== YOUTUBE DATA API =====
const YT_API_KEY = 'AIzaSyCGp_KUC8r2jBeIzsPOOHKCffYL3o4teDU';
const USER_COUNTRY_CODE = 'IL'; // change if needed

function showApiKeyHintIfMissing() {
// IMPORTANT: If you open this file by double-clicking (file://), YouTube embeds often fail
// and API key referrer restrictions won't match. Use a local server (Live Server) or GitHub Pages.
setStatus("Origin: " + window.location.origin + " | Protocol: " + window.location.protocol);
if (window.location.protocol === 'file:') {
  apiHint.classList.remove('d-none');
  apiHint.innerHTML = `
    <div><strong>This page is opened as a local file (file://).</strong></div>
    <div class="small">Please run it through a web server so YouTube can play inside the modal:</div>
    <ul class="small mb-0">
      <li><strong>VS Code</strong>: Right click <code>search.html</code> → <em>Open with Live Server</em></li>
      <li><strong>Terminal</strong>: in the project folder run <code>python3 -m http.server 5500</code> then open <code>http://localhost:5500/search.html</code></li>
      <li><strong>GitHub Pages</strong>: open your published site URL</li>
    </ul>
  `;
  return true;
}

if (YT_API_KEY) {
  apiHint.classList.add('d-none');
  return false;
}

apiHint.classList.remove('d-none');
apiHint.innerHTML = `<div><strong>Missing YouTube API key.</strong></div><div class="small">Set <code>YT_API_KEY</code> in <code>search.html</code> and refresh.</div>`;
return true;
}

async function ytSearch(query) {
const url = new URL('https://www.googleapis.com/youtube/v3/search');
url.searchParams.set('part', 'snippet');
url.searchParams.set('type', 'video');
url.searchParams.set('maxResults', '12');
url.searchParams.set('q', query);
url.searchParams.set('key', YT_API_KEY);

const res = await fetch(url);
if (!res.ok) throw new Error(`Search failed (${res.status})`);
const data = await res.json();
return data.items || [];
}

async function ytVideoDetails(ids) {
if (!ids.length) return [];
const url = new URL('https://www.googleapis.com/youtube/v3/videos');
url.searchParams.set('part', 'contentDetails,statistics,status');
url.searchParams.set('id', ids.join(','));
url.searchParams.set('key', YT_API_KEY);

const res = await fetch(url);
if (!res.ok) throw new Error(`Details failed (${res.status})`);
const data = await res.json();
return data.items || [];
}

function parseIsoDuration(iso) {
const m = String(iso || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
if (!m) return '—';
const h = Number(m[1] || 0);
const min = Number(m[2] || 0);
const s = Number(m[3] || 0);
const pad = (n) => String(n).padStart(2, '0');
if (h > 0) return `${h}:${pad(min)}:${pad(s)}`;
return `${min}:${pad(s)}`;
}

function fmtViews(n) {
const num = Number(n || 0);
return new Intl.NumberFormat().format(num);
}

// ===== FAVORITES / PLAYLISTS STORAGE =====
// localStorage['playlistsByUser'] = { [username]: [ {id,name,createdAt,videos:[video]} ] }
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

function setUserPlaylists(username, pls) {
const all = readPlaylistsByUser();
all[username] = pls;
writePlaylistsByUser(all);
}

function isVideoInAnyPlaylist(playlists, videoId) {
return playlists.some(pl => Array.isArray(pl.videos) && pl.videos.some(v => v.videoId === videoId));
}

// ===== RENDERING =====
const clampStyle = 'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;';

function openPlayer(videoId, title) {
playerTitle.textContent = title || 'Playing';

// If running from file://, modal playback is unreliable. Open in YouTube instead.
if (window.location.protocol === 'file:') {
  window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank');
  return;
}

playerFrame.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&playsinline=1`;
playerModal.show();
}

// selected video for favorites
let pendingAdd = null;
let lastResults = [];

function openFavModal(user, playlists, videoObj) {
pendingAdd = { user, playlists, videoObj };

favErr.classList.add('d-none');
favErr.textContent = '';
favNewName.value = '';

favSelect.innerHTML = '';
if (playlists.length === 0) {
  const opt = document.createElement('option');
  opt.value = '';
  opt.textContent = 'No playlists yet';
  favSelect.appendChild(opt);
  favSelect.disabled = true;
} else {
  favSelect.disabled = false;
  for (const pl of playlists) {
    const opt = document.createElement('option');
    opt.value = pl.id;
    opt.textContent = pl.name;
    favSelect.appendChild(opt);
  }
}

favModal.show();
}

favConfirmBtn.addEventListener('click', () => {
if (!pendingAdd) return;

const { user, playlists, videoObj } = pendingAdd;
const newName = favNewName.value.trim();
const chosenId = favSelect.disabled ? '' : favSelect.value;

favErr.classList.add('d-none');
favErr.textContent = '';

let targetPlaylist = null;

if (newName) {
  targetPlaylist = {
    id: Date.now().toString(),
    name: newName,
    createdAt: Date.now(),
    videos: []
  };
  playlists.unshift(targetPlaylist);
} else {
  targetPlaylist = playlists.find(p => p.id === chosenId);
}

if (!targetPlaylist) {
  favErr.textContent = 'Please choose a playlist or type a new name.';
  favErr.classList.remove('d-none');
  return;
}

targetPlaylist.videos = Array.isArray(targetPlaylist.videos) ? targetPlaylist.videos : [];
if (!targetPlaylist.videos.some(v => v.videoId === videoObj.videoId)) {
  targetPlaylist.videos.push(videoObj);
}

setUserPlaylists(user.username, playlists);
favModal.hide();

// re-render to show check/disable
renderResults(user, lastResults);

// toast link
showToast(`Saved to <strong>${targetPlaylist.name}</strong>. <a class="text-info" href="playlists.html?playlistId=${encodeURIComponent(targetPlaylist.id)}">Open playlist</a>`);
});

function renderResults(user, results) {
resultsEl.innerHTML = '';
lastResults = results;

const playlists = getUserPlaylists(user.username);

if (!results.length) {
  resultsEl.innerHTML = `<div class="col-12"><div class="alert alert-info">No results.</div></div>`;
  return;
}

for (const r of results) {
  const col = document.createElement('div');
  col.className = 'col-12 col-md-6 col-lg-4';

  const title = r.title;
  const inFav = isVideoInAnyPlaylist(playlists, r.videoId);

  col.innerHTML = `
    <div class="card h-100 border-secondary position-relative">
      ${inFav ? `<span class="position-absolute top-0 end-0 m-2 badge text-bg-success"><i class=\"fa-solid fa-check\"></i></span>` : ''}
      <img src="${r.thumbnail}" alt="${title}" class="rounded-top" style="width:100%;height:190px;object-fit:cover;cursor:pointer;" />
      <div class="card-body d-flex flex-column">
        <h5 class="card-title videoTitle" title="${title}" style="${clampStyle};cursor:pointer;">${title}</h5>

        <div class="text-muted small mb-2">
          <div><i class="fa-regular fa-clock"></i> ${r.duration || '—'}</div>
          <div><i class="fa-regular fa-eye"></i> ${r.views ? fmtViews(r.views) : '—'} views</div>
        </div>

        <div class="mt-auto d-flex gap-2">
          <button class="btn btn-outline-info w-50 playBtn" type="button"><i class="fa-solid fa-play"></i> Player</button>
          <button class="btn ${inFav ? 'btn-outline-secondary' : 'btn-outline-danger'} w-50 favBtn" type="button" ${inFav ? 'disabled' : ''}>
            <i class="fa-solid ${inFav ? 'fa-check' : 'fa-heart'}"></i> ${inFav ? 'Saved' : 'Favorite'}
          </button>
        </div>
      </div>
    </div>
  `;

  col.querySelector('img').addEventListener('click', () => openPlayer(r.videoId, r.title));
  col.querySelector('.playBtn').addEventListener('click', () => openPlayer(r.videoId, r.title));
  col.querySelector('.videoTitle').addEventListener('click', () => openPlayer(r.videoId, r.title));
  col.querySelector('.favBtn').addEventListener('click', () => {
    const pls = getUserPlaylists(user.username);
    openFavModal(user, pls, r);
  });

  resultsEl.appendChild(col);
}
}

// ===== SEARCH FLOW =====
async function runSearch(user, query) {
const q = (query || '').trim();
if (!q) {
  setStatus('Type something to search.');
  resultsEl.innerHTML = '';
  return;
}

setQueryString(q);
saveState(user.username, { q });

setStatus('Searching...');
resultsEl.innerHTML = '';

const items = await ytSearch(q);
const ids = items.map(it => it.id?.videoId).filter(Boolean);

const details = await ytVideoDetails(ids);
const detailsMap = new Map(details.map(d => [d.id, d]));


const resultsAll = items.map(it => {
  const videoId = it.id.videoId;
  const sn = it.snippet;
  const d = detailsMap.get(videoId);


  // Only true if explicitly true
  const embeddable = d?.status?.embeddable === true;
  const isPublic = d?.status?.privacyStatus === 'public';
  const processed = d?.status?.uploadStatus === 'processed';

  // Age restriction
  const ytRating = d?.contentDetails?.contentRating?.ytRating;
  const ageRestricted = ytRating === 'ytAgeRestricted';

  // Region restriction
  const blocked = d?.contentDetails?.regionRestriction?.blocked || [];
  const regionBlocked = Array.isArray(blocked) && blocked.includes(USER_COUNTRY_CODE);

  return {
      videoId,
      title: sn.title,
      thumbnail: sn.thumbnails?.high?.url || sn.thumbnails?.medium?.url || sn.thumbnails?.default?.url,
      duration: parseIsoDuration(d?.contentDetails?.duration),
      views: d?.statistics?.viewCount || 0,
      embeddable,
      isPublic,
      processed,
      ageRestricted,
      regionBlocked
  };
});

// Only show videos that will actually play in the modal
const results = resultsAll.filter(r =>
r.embeddable && r.isPublic && r.processed && !r.ageRestricted && !r.regionBlocked
);

const removed = resultsAll.length - results.length;

if (results.length === 0) {
setStatus(`No playable results for “${q}”. Try a different search (many videos disable embedding / are restricted).`);
} else if (removed > 0) {
setStatus(`Found ${results.length} playable results for “${q}” (hidden ${removed} restricted/unplayable videos).`);
} else {
setStatus(`Found ${results.length} results for “${q}”.`);
}

renderResults(user, results);
saveState(user.username, { q, results });
}

// ===== EVENTS =====
searchBtn.addEventListener('click', async () => {
const user = getCurrentUser();
if (!user) return;
if (showApiKeyHintIfMissing()) return;

try {
  await runSearch(user, qEl.value);
} catch (e) {
  setStatus(String(e?.message || e));
}
});

qEl.addEventListener('keydown', (e) => {
if (e.key === 'Enter') {
  e.preventDefault();
  searchBtn.click();
}
});

// ===== BOOT =====
const user = requireAuth();
if (user) {
renderHeader(user);

// Restore query from URL first, else session state
const qFromUrl = getQueryStringQ();
const st = loadState(user.username);

if (qFromUrl) qEl.value = qFromUrl;
else if (st?.q) qEl.value = st.q;

// If we have cached results, render them immediately (page looks same when returning)
if (st?.results && Array.isArray(st.results) && st.results.length > 0) {
  setStatus(`Showing saved results for “${st.q || ''}”.`);
  renderResults(user, st.results);
}

// If query exists, auto-run (will refresh results)
if (qEl.value.trim() && !showApiKeyHintIfMissing()) {
  searchBtn.click();
}
}
