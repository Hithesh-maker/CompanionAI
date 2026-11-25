document.addEventListener('DOMContentLoaded', () => {
  const checkinButton = document.getElementById('checkinButton');
  const safetyButton = document.getElementById('safetyButton');

  function showBanner(text) {
    let box = document.getElementById('safetyFeedbackBox');
    if (!box) {
      box = document.createElement('div');
      box.id = 'safetyFeedbackBox';
      box.className = 'form-message success';
      box.style.marginTop = '16px';
      const target = safetyButton?.parentElement || document.querySelector('.panel');
      target?.insertAdjacentElement('afterend', box);
    }
    box.textContent = text;
  }

  async function submitCheckin(kind) {
    try {
      const data = await window.CompanionApp.api('/api/safety/checkin', {
        method: 'POST',
        body: JSON.stringify({ kind, note: `User triggered ${kind} support` }),
      });
      showBanner(data.guidance);
    } catch {
      showBanner(
        kind === 'safety'
          ? 'If you are in danger, contact local emergency services or call/text 988.'
          : 'Pause for 3 slow breaths: 5 things you see, 4 you feel, 3 you hear.',
      );
    }
  }

  if (checkinButton) checkinButton.addEventListener('click', () => submitCheckin('grounding'));
  if (safetyButton) safetyButton.addEventListener('click', () => submitCheckin('safety'));
});
