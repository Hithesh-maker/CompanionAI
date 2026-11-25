document.addEventListener('DOMContentLoaded', async () => {
  const privacyToggle = document.getElementById('privacyToggle');
  const sensorToggle = document.getElementById('sensorToggle');
  const externalAIToggle = document.getElementById('externalAIToggle');

  async function loadPrivacy() {
    try {
      const data = await window.CompanionApp.api('/api/privacy');
      if (data.privacy) {
        if (privacyToggle) privacyToggle.checked = Boolean(data.privacy.privacy_mode);
        if (sensorToggle) sensorToggle.checked = Boolean(data.privacy.sensor_enabled);
        if (externalAIToggle) externalAIToggle.checked = Boolean(data.privacy.external_ai_enabled);
      }
    } catch {
      // Handled by auth guard
    }
  }

  async function savePrivacy() {
    try {
      await window.CompanionApp.api('/api/privacy', {
        method: 'PUT',
        body: JSON.stringify({
          privacy_mode: Boolean(privacyToggle?.checked),
          sensor_enabled: Boolean(sensorToggle?.checked),
          external_ai_enabled: Boolean(externalAIToggle?.checked),
        }),
      });
    } catch {
      // Ignore transient errors
    }
  }

  [privacyToggle, sensorToggle, externalAIToggle].forEach((el) => {
    if (el) el.addEventListener('change', savePrivacy);
  });

  loadPrivacy();
});
