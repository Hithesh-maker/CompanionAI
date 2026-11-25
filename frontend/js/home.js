document.addEventListener('DOMContentLoaded', async () => {
  const emotionStatus = document.getElementById('emotionStatus');
  const emotionText = document.getElementById('emotionText');
  const recommendationText = document.getElementById('recommendationText');

  try {
    const data = await window.CompanionApp.api('/api/chat');
    const ctx = data.emotionalContext;
    if (ctx) {
      if (emotionStatus) emotionStatus.textContent = `Recent check-in tone: ${ctx.emotion}`;
      if (emotionText) emotionText.textContent = ctx.emotion;
      if (recommendationText) recommendationText.textContent = ctx.recommendation;
    }
  } catch {
    if (emotionStatus) emotionStatus.textContent = 'Ready whenever you want to talk.';
  }
});
