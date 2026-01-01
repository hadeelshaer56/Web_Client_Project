// ---- Helpers ----
function readUsers() {
    // Users are stored under localStorage key: "users"
    // Format: [{ username, password, firstName, imageUrl }]
    const raw = localStorage.getItem('users');
    if (!raw) return [];
    try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
    } catch {
    return [];
    }
}

function writeUsers(users) {
    localStorage.setItem('users', JSON.stringify(users));
}

function showMessage(type, text) {
    const box = document.getElementById('msgBox');
    box.classList.remove('d-none', 'alert-danger', 'alert-success', 'alert-warning', 'alert-info');
    box.classList.add(type);
    box.textContent = text;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function isPasswordStrong(pw) {
    // at least 6 chars
    if (pw.length < 6) return false;
    // contains at least one letter, one number, one special
    const hasLetter = /[A-Za-z]/.test(pw);
    const hasNumber = /\d/.test(pw);
    const hasSpecial = /[^A-Za-z0-9]/.test(pw);
    return hasLetter && hasNumber && hasSpecial;
}

// ---- DOM ----
const form = document.getElementById('registerForm');
const usernameEl = document.getElementById('username');
const firstNameEl = document.getElementById('firstName');
const passwordEl = document.getElementById('password');
const confirmEl = document.getElementById('confirmPassword');
const imageUrlEl = document.getElementById('imageUrl');

// Image preview 
const imgPreview = document.getElementById('imgPreview');
const imgPreviewHint = document.getElementById('imgPreviewHint');

function setPreviewState({ visible, hint, src }) {
    if (src !== undefined) imgPreview.src = src;
    imgPreview.style.display = visible ? 'block' : 'none';
    imgPreviewHint.textContent = hint || '';
}

// Live preview: show only when the image actually loads
imageUrlEl.addEventListener('input', () => {
    const url = imageUrlEl.value.trim();

    if (!url) {
    setPreviewState({ visible: false, hint: 'Image preview will appear here.', src: '' });
    return;
    }

    // Start with "loading" state
    setPreviewState({ visible: false, hint: 'Loading preview...', src: '' });

    // Try to load the image before showing it (avoids broken preview)
    const tester = new Image();
    tester.onload = () => {
    setPreviewState({ visible: true, hint: '', src: url });
    };
    tester.onerror = () => {
    setPreviewState({
        visible: false,
        hint: 'Could not load image. Make sure this is a DIRECT image URL (ends with .jpg/.png/.webp) and uses https.',
        src: ''
    });
    };
    tester.src = url;
});

// ---- Submit ----
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = usernameEl.value.trim();
    const firstName = firstNameEl.value.trim();
    const password = passwordEl.value;
    const confirmPassword = confirmEl.value;
    const imageUrl = imageUrlEl.value.trim();

    // 1) Required fields
    if (!username || !firstName || !password || !confirmPassword || !imageUrl) {
    showMessage('alert-danger', 'Please fill in all fields.');
    return;
    }

    // 2) Username must be unique in localStorage(users)
    const users = readUsers();
    const exists = users.some(u => (u.username || '').toLowerCase() === username.toLowerCase());
    if (exists) {
    showMessage('alert-danger', 'Username already exists. Please choose another.');
    return;
    }

    // 3) Password rules
    if (!isPasswordStrong(password)) {
    showMessage('alert-danger', 'Password must be at least 6 characters and include a letter, a number, and a special character.');
    return;
    }

    // 4) Confirm password
    if (password !== confirmPassword) {
    showMessage('alert-danger', 'Passwords do not match.');
    return;
    }

    // 5) Validate that the image URL actually loads
    // Common issue: users paste a page URL (Google Images, Instagram, etc.) instead of a direct image URL.
    const canLoadImage = await new Promise((resolve) => {
    const tester = new Image();
    const timeout = setTimeout(() => resolve(false), 3500);
    tester.onload = () => { clearTimeout(timeout); resolve(true); };
    tester.onerror = () => { clearTimeout(timeout); resolve(false); };
    tester.src = imageUrl;
    });

    if (!canLoadImage) {
    showMessage('alert-danger', 'Profile image URL did not load. Please paste a DIRECT image link (jpg/png/webp) that opens as an image in a new tab, preferably https.');
    return;
    }

    // Save
    users.push({ username, password, firstName, imageUrl });
    writeUsers(users);

    showMessage('alert-success', 'Registration successful! Redirecting to login...');

    // Redirect to login
    setTimeout(() => {
    window.location.href = 'login.html';
    }, 800);
});