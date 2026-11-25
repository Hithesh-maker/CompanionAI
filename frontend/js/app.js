// Shared CompanionAI client utilities: theme, API helper, and auth guard
const CompanionApp = (() => {
  const THEME_KEY = 'companionai_theme';
  const TOKEN_KEY = 'companionai_token';
  const USER_KEY = 'companionai_user';

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  function setSession(user, token) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    if (user?.theme) applyTheme(user.theme);
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  function getStoredUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function applyTheme(theme) {
    const isDark = theme === 'dark';
    document.body.classList.toggle('dark', isDark);
    localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
    const settingsToggle = document.getElementById('settingsThemeToggle');
    if (settingsToggle) settingsToggle.checked = isDark;
  }

  async function api(endpoint, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(endpoint, {
      ...options,
      headers,
      credentials: 'same-origin',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || 'Request failed');
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY) || 'light';
    applyTheme(saved);
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
      themeToggle.addEventListener('click', async () => {
        const next = document.body.classList.contains('dark') ? 'light' : 'dark';
        applyTheme(next);
        if (getToken()) {
          try {
            const res = await api('/api/settings', {
              method: 'PUT',
              body: JSON.stringify({ theme: next }),
            });
            setSession(res.user);
          } catch {
            // Keep local preference if offline
          }
        }
      });
    }
  }

  async function requireAuth() {
    const needsAuth = document.body.dataset.authRequired === 'true';
    if (!needsAuth) return null;
    try {
      const data = await api('/api/auth/me');
      setSession(data.user);
      return data;
    } catch {
      clearSession();
      window.location.href = 'login.html';
      return null;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    requireAuth();
  });

  return { api, applyTheme, clearSession, getStoredUser, getToken, setSession, requireAuth };
})();

window.CompanionApp = CompanionApp;
