document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');

  if (loginForm) {
    const emailInput = document.getElementById('loginEmail');
    const passwordInput = document.getElementById('loginPassword');
    const msgEl = document.getElementById('loginMessage');

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      msgEl.textContent = '';
      msgEl.className = 'form-message';

      try {
        const data = await window.CompanionApp.api('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            email: emailInput.value.trim(),
            password: passwordInput.value,
          }),
        });
        window.CompanionApp.setSession(data.user, data.token);
        msgEl.textContent = 'Signed in. Redirecting...';
        msgEl.classList.add('success');
        window.location.href = 'home.html';
      } catch (err) {
        msgEl.textContent = err.message || 'Invalid credentials.';
        msgEl.classList.add('error');
      }
    });
  }

  if (registerForm) {
    const nameInput = document.getElementById('registerName');
    const emailInput = document.getElementById('registerEmail');
    const passwordInput = document.getElementById('registerPassword');
    const confirmInput = document.getElementById('confirmPassword');
    const msgEl = document.getElementById('registerMessage');

    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      msgEl.textContent = '';
      msgEl.className = 'form-message';

      if (passwordInput.value !== confirmInput.value) {
        msgEl.textContent = 'Passwords do not match.';
        msgEl.classList.add('error');
        return;
      }

      try {
        const data = await window.CompanionApp.api('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            name: nameInput.value.trim(),
            email: emailInput.value.trim(),
            password: passwordInput.value,
          }),
        });
        window.CompanionApp.setSession(data.user, data.token);
        msgEl.textContent = 'Account created. Redirecting...';
        msgEl.classList.add('success');
        window.location.href = 'home.html';
      } catch (err) {
        msgEl.textContent = err.message || 'Registration failed.';
        msgEl.classList.add('error');
      }
    });
  }
});
