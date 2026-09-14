const threads = [
  {
    id: 'alice-johnson',
    name: 'Alice Johnson',
    email: 'alice@northstarlabs.co',
    color: '#5b7cff',
    messages: [
      {
        id: 'a-1',
        subject: 'Q4 launch checklist',
        date: '2026-09-12T09:15:00Z',
        body: 'Hi team,\n\nI uploaded the revised Q4 launch checklist and the timeline looks good. The biggest risk is still the onboarding delay for the Asia-Pacific beta group. Can we finalize the messaging copy by Friday and confirm the final QA window?\n\nThanks,\nAlice'
      },
      {
        id: 'a-2',
        subject: 'Re: Q4 launch checklist',
        date: '2026-09-12T14:42:00Z',
        body: 'Thanks for the update. I reviewed the checklist this morning and the launch plan is strong overall. I would like us to move the fallback marketing asset earlier before the feature freeze. Please send the final draft for sign-off before tomorrow noon.\n\nRegards,\nAlice'
      },
      {
        id: 'a-3',
        subject: 'Final sign-off needed',
        date: '2026-09-13T07:09:00Z',
        body: 'I have a final quick review request. We need sign-off on the customer messaging before we trigger the staging rollout. If there are no blockers, I can push the announcements out once we confirm the updated support copy for the billing page.\n\nBest,\nAlice'
      }
    ]
  },
  {
    id: 'michael-chen',
    name: 'Michael Chen',
    email: 'michael@peakcommerce.io',
    color: '#3bb0a8',
    messages: [
      {
        id: 'm-1',
        subject: 'Partnership follow-up',
        date: '2026-09-10T12:03:00Z',
        body: 'Hi there,\n\nI wanted to follow up on the partnership deck. The customer success team asked whether we can start with a co-marketing campaign in October. We have a white-glove onboarding path ready if the timeline works for your team.\n\nBest,\nMichael'
      },
      {
        id: 'm-2',
        subject: 'Re: Partnership follow-up',
        date: '2026-09-11T16:27:00Z',
        body: 'I appreciate the quick turnaround and would love to move forward. I am circulating the deck to our product and legal teams this afternoon. If they approve, we can lock the launch date and customer webinar slot.\n\nThanks,\nMichael'
      },
      {
        id: 'm-3',
        subject: 'Legal review complete',
        date: '2026-09-13T08:50:00Z',
        body: 'All legal comments are resolved. We have the final wording for the partner agreement and the onboarding checklist. Please reply with the final signatory names and we can send the package today.\n\nRegards,\nMichael'
      }
    ]
  },
  {
    id: 'nina-patel',
    name: 'Nina Patel',
    email: 'nina@summerfield.dev',
    color: '#f17d6b',
    messages: [
      {
        id: 'n-1',
        subject: 'Sprint recap',
        date: '2026-09-09T11:48:00Z',
        body: 'Hi,\n\nHere is the recap from the sprint review. We closed the mobile login issue, shipped the API documentation refresh, and reduced onboarding friction by 18%. The remaining bottleneck is the delayed sync event in the notification pipeline.\n\nCheers,\nNina'
      },
      {
        id: 'n-2',
        subject: 'Re: Sprint recap',
        date: '2026-09-10T09:12:00Z',
        body: 'The metrics are moving in the right direction. I recommend we keep the current release scope and treat the notification sync issue as a priority follow-up for next week. I can coordinate with the backend team on the incident notes.\n\nThanks,\nNina'
      },
      {
        id: 'n-3',
        subject: 'Roadmap update',
        date: '2026-09-12T18:40:00Z',
        body: 'I attached the updated roadmap for the next two quarters. The priority remains the retention improvements around user prompts and the data sync reliability. We should keep the research capacity focused on the top three drop-off points.\n\nBest,\nNina'
      }
    ]
  }
];

const state = {
  selectedSenderId: threads[0].id,
  openMessageIds: new Set()
};

const senderList = document.getElementById('senderList');
const threadHeader = document.getElementById('threadHeader');
const messageList = document.getElementById('messageList');
const threadCount = document.getElementById('threadCount');
const refreshButton = document.getElementById('refreshButton');

function getInitials(name) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

function summarizeEmail(bodyText) {
  const cleanedText = bodyText.replace(/\s+/g, ' ').trim();
  const sentences = cleanedText.split(/(?<=[.!?])\s+/).filter(Boolean);
  const firstSentence = sentences[0] || cleanedText;
  const excerpt = firstSentence.length > 180 ? `${firstSentence.slice(0, 177).trim()}…` : firstSentence;
  const keywords = [...new Set(cleanedText.toLowerCase().match(/[a-z]{5,}/g) || [])].slice(0, 3);

  const keywordText = keywords.length ? `Key topics: ${keywords.join(', ')}.` : '';
  return `${excerpt} ${keywordText}`.trim();
}

function getSelectedSender() {
  return threads.find((thread) => thread.id === state.selectedSenderId) || threads[0];
}

function renderSenders() {
  senderList.innerHTML = '';
  threadCount.textContent = String(threads.length);

  threads.forEach((thread) => {
    const lastMessage = thread.messages[thread.messages.length - 1];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `sender-item ${thread.id === state.selectedSenderId ? 'selected' : ''}`;
    button.setAttribute('aria-label', `Open messages from ${thread.name}`);
    button.innerHTML = `
      <div class="avatar" style="background: linear-gradient(135deg, ${thread.color}, #8ca6ff);">${getInitials(thread.name)}</div>
      <div class="sender-main">
        <div class="sender-name-row">
          <span class="sender-name">${thread.name}</span>
          <span class="sender-time">${formatDate(lastMessage.date)}</span>
        </div>
        <div class="sender-preview">${summarizeEmail(lastMessage.body)}</div>
      </div>
    `;

    button.addEventListener('click', () => {
      state.selectedSenderId = thread.id;
      render();
    });

    senderList.appendChild(button);
  });
}

function renderThreadHeader() {
  const sender = getSelectedSender();
  threadHeader.innerHTML = `
    <div>
      <p class="eyebrow">Thread</p>
      <h2 class="thread-title">${sender.name}</h2>
    </div>
    <div class="thread-meta">${sender.messages.length} emails</div>
  `;
}

function toggleMessage(messageId) {
  if (state.openMessageIds.has(messageId)) {
    state.openMessageIds.delete(messageId);
  } else {
    state.openMessageIds.add(messageId);
  }

  renderMessages();
}

function renderMessages() {
  const sender = getSelectedSender();
  messageList.innerHTML = '';

  sender.messages.forEach((message) => {
    const isOpen = state.openMessageIds.has(message.id);
    const article = document.createElement('article');
    article.className = `message-card ${isOpen ? 'open' : ''}`;

    article.innerHTML = `
      <div class="message-top">
        <h3 class="message-subject">${message.subject}</h3>
        <span class="message-date">${formatDate(message.date)}</span>
      </div>
      <button class="message-summary" type="button" aria-expanded="${isOpen}">
        <span class="summary-label">AI summary</span>
        <span class="summary-text">${summarizeEmail(message.body)}</span>
      </button>
      <div class="message-body ${isOpen ? 'open' : ''}">${message.body}</div>
    `;

    article.querySelector('.message-summary').addEventListener('click', () => toggleMessage(message.id));
    messageList.appendChild(article);
  });
}

function render() {
  renderSenders();
  renderThreadHeader();
  renderMessages();
}

refreshButton.addEventListener('click', () => {
  const sender = getSelectedSender();
  const lastMessage = sender.messages[sender.messages.length - 1];
  refreshButton.textContent = 'Refreshing...';

  window.setTimeout(() => {
    refreshButton.textContent = 'Refresh';
    const newestMessage = {
      ...lastMessage,
      id: `${lastMessage.id}-new`,
      date: new Date().toISOString(),
      subject: `${lastMessage.subject} · updated`
    };

    sender.messages.push({
      ...newestMessage,
      body: `Hi ${sender.name.split(' ')[0]},\n\nThis is an automatic refresh from your inbox view. The latest update is now visible in this thread, and the AI summary is refreshed to reflect the latest message content.\n\nThanks,\nGmail Messenger`
    });
    render();
  }, 300);
});

render();
