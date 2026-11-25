document.addEventListener('DOMContentLoaded', async () => {
  const chatMessages = document.getElementById('chatMessages');
  const chatStatus = document.getElementById('chatStatus');
  const chatForm = document.getElementById('chatForm');
  const messageInput = document.getElementById('messageInput');
  const charCount = document.getElementById('characterCount');
  const sendButton = document.getElementById('sendButton');
  const emotionText = document.getElementById('emotionText');
  const recommendationText = document.getElementById('recommendationText');

  function appendMessage(role, content) {
    const welcome = chatMessages.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    const wrapper = document.createElement('div');
    wrapper.className = `message ${role === 'user' ? 'user' : 'ai'}`;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = content;

    wrapper.appendChild(bubble);
    chatMessages.appendChild(wrapper);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function updateContext(ctx) {
    if (!ctx) return;
    if (emotionText) emotionText.textContent = `Current tone: ${ctx.emotion}`;
    if (recommendationText && ctx.recommendation) recommendationText.textContent = ctx.recommendation;
  }

  async function loadHistory() {
    try {
      const data = await window.CompanionApp.api('/api/chat');
      if (Array.isArray(data.messages) && data.messages.length > 0) {
        data.messages.forEach((m) => appendMessage(m.role, m.content));
      }
      updateContext(data.emotionalContext);
    } catch {
      // Handled by auth guard if unauthenticated
    }
  }

  async function sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed) return;

    appendMessage('user', trimmed);
    messageInput.value = '';
    if (charCount) charCount.textContent = '0 / 1000';
    sendButton.disabled = true;
    chatStatus.setAttribute('aria-hidden', 'false');
    chatStatus.style.display = 'flex';

    try {
      const data = await window.CompanionApp.api('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ message: trimmed }),
      });
      appendMessage('ai', data.reply.content);
      updateContext(data.emotionalContext);
    } catch (err) {
      appendMessage('ai', err.message || 'Unable to respond right now. Please try again.');
    } finally {
      sendButton.disabled = false;
      chatStatus.setAttribute('aria-hidden', 'true');
      chatStatus.style.display = 'none';
    }
  }

  if (messageInput && charCount) {
    messageInput.addEventListener('input', () => {
      charCount.textContent = `${messageInput.value.length} / 1000`;
    });
  }

  document.querySelectorAll('.suggestion-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const msg = chip.dataset.message || chip.textContent;
      sendMessage(msg);
    });
  });

  if (chatForm) {
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      sendMessage(messageInput.value);
    });
  }

  loadHistory();
});
