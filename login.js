function readUsers() {
    const raw = localStorage.getItem('users');
    if (!raw) return [];
    try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
    } catch {
    return [];
    }
}

function showMessage(type, text) {
    const box = document.getElementById('msgBox');
    box.classList.remove('d-none', 'alert-danger', 'alert-success', 'alert-warning', 'alert-info');
    box.classList.add(type);
    box.textContent = text;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

const form = document.getElementById('loginForm');
const usernameEl = document.getElementById('username');
const passwordEl = document.getElementById('password');

form.addEventListener('submit', (e) => {
    e.preventDefault();

    const username = usernameEl.value.trim();
    const password = passwordEl.value;

    if (!username || !password) {
    showMessage('alert-danger', 'Please fill in username and password.');
    return;
    }

    const users = readUsers();

    // Find matching user
    const user = users.find(u =>
    (u.username || '').toLowerCase() === username.toLowerCase() &&
    (u.password || '') === password
    );

    if (!user) {
    showMessage('alert-danger', 'Invalid username or password.');
    return;
    }

    // Save currentUser in sessionStorage (required by HW)
    // We'll store the full user object (without changing your users array)
    sessionStorage.setItem('currentUser', JSON.stringify({
    username: user.username,
    firstName: user.firstName,
    imageUrl: user.imageUrl
    }));

    showMessage('alert-success', 'Login successful! Redirecting to search...');

    setTimeout(() => {
    window.location.href = 'search.html';
    }, 600);
});