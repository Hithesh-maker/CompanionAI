document.addEventListener('DOMContentLoaded', async () => {
  const userNameEl = document.getElementById('userName');
  const userEmailEl = document.getElementById('userEmail');
  const settingsThemeToggle = document.getElementById('settingsThemeToggle');
  const logoutButton = document.getElementById('logoutButton');

  const stored = window.CompanionApp.getStoredUser();
  if (stored) {
    if (userNameEl) userNameEl.textContent = stored.name;
    if (userEmailEl) userEmailEl.textContent = stored.email;
  }

  try {
    const data = await window.CompanionApp.api('/api/auth/me');
    if (data.user) {
      if (userNameEl) userNameEl.textContent = data.user.name;
      if (userEmailEl) userEmailEl.textContent = data.user.email;
      window.CompanionApp.applyTheme(data.user.theme || 'light');
    }
  } catch {
    // Auth guard handles redirect
  }

  if (settingsThemeToggle) {
    settingsThemeToggle.addEventListener('change', async () => {
      const theme = settingsThemeToggle.checked ? 'dark' : 'light';
      window.CompanionApp.applyTheme(theme);
      try {
        const res = await window.CompanionApp.api('/api/settings', {
          method: 'PUT',
          body: JSON.stringify({ theme }),
        });
        window.CompanionApp.setSession(res.user);
      } catch {
        // Keep local preference
      }
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
      try {
        await window.CompanionApp.api('/api/auth/logout', { method: 'POST' });
      } catch {
        // Proceed with client cleanup
      }
      window.CompanionApp.clearSession();
      window.location.href = 'login.html';
    });
  }
});
