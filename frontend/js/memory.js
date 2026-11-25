document.addEventListener('DOMContentLoaded', async () => {
  const memoryForm = document.getElementById('memoryForm');
  const titleInput = document.getElementById('memoryTitle');
  const contentInput = document.getElementById('memoryContent');
  const sensitiveInput = document.getElementById('sensitiveMemory');
  const messageEl = document.getElementById('memoryMessage');
  const countEl = document.getElementById('memoryCount');
  const listEl = document.getElementById('memoryList');

  function renderMemories(memories) {
    if (countEl) countEl.textContent = String(memories.length);
    listEl.innerHTML = '';

    if (memories.length === 0) {
      listEl.innerHTML = `
        <div class="memory-empty">
          <div class="memory-empty-icon" aria-hidden="true">♡</div>
          <p>Nothing saved yet.</p>
          <small>You decide what CompanionAI remembers.</small>
        </div>`;
      return;
    }

    memories.forEach((item) => {
      const card = document.createElement('article');
      card.className = 'memory-item';

      const h3 = document.createElement('h3');
      h3.textContent = item.title;

      const p = document.createElement('p');
      p.textContent = item.content;

      const meta = document.createElement('div');
      meta.className = 'memory-item-meta';
      const badgeText = item.sensitive ? 'Sensitive · Private only' : 'Standard context';
      const span = document.createElement('span');
      span.textContent = `${badgeText} · ${item.created_at}`;

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'secondary-button';
      delBtn.textContent = 'Remove';
      delBtn.addEventListener('click', async () => {
        try {
          await window.CompanionApp.api(`/api/memories/${item.id}`, { method: 'DELETE' });
          await loadMemories();
        } catch (err) {
          if (messageEl) messageEl.textContent = err.message;
        }
      });

      meta.appendChild(span);
      meta.appendChild(delBtn);
      card.appendChild(h3);
      card.appendChild(p);
      card.appendChild(meta);
      listEl.appendChild(card);
    });
  }

  async function loadMemories() {
    try {
      const data = await window.CompanionApp.api('/api/memories');
      renderMemories(data.memories || []);
    } catch {
      // Handled by auth guard
    }
  }

  if (memoryForm) {
    memoryForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (messageEl) {
        messageEl.textContent = '';
        messageEl.className = 'form-message';
      }

      try {
        await window.CompanionApp.api('/api/memories', {
          method: 'POST',
          body: JSON.stringify({
            title: titleInput.value.trim(),
            content: contentInput.value.trim(),
            sensitive: Boolean(sensitiveInput?.checked),
          }),
        });
        memoryForm.reset();
        if (messageEl) {
          messageEl.textContent = 'Memory saved.';
          messageEl.classList.add('success');
        }
        await loadMemories();
      } catch (err) {
        if (messageEl) {
          messageEl.textContent = err.message || 'Failed to save memory.';
          messageEl.classList.add('error');
        }
      }
    });
  }

  loadMemories();
});
