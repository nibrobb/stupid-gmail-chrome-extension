/* global chrome */


const state = {
  threads: [],
  selectedSenderId: null,
  openMessageIds: new Set(),
  token: null,
  nextPageToken: null,
  isLoadingOlder: false,
  shouldScrollToBottom: true,
  size: {
    width: 760,
    height: 560
  }
};

const appShell = document.getElementById('appShell');
const senderList = document.getElementById('senderList');
const threadHeader = document.getElementById('threadHeader');
const messageList = document.getElementById('messageList');
const threadCount = document.getElementById('threadCount');
const refreshButton = document.getElementById('refreshButton');
const authButton = document.getElementById('authButton');
const statusBanner = document.getElementById('statusBanner');
const resizeHandle = document.getElementById('resizeHandle');

function setStatus(message, type = 'info') {
  if (!statusBanner) return;
  statusBanner.textContent = message;
  statusBanner.className = `status-banner ${type}`;
}

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
  if (Number.isNaN(date.getTime())) {
    return 'No date';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

function summarizeEmail(bodyText) {
  const cleanedText = (bodyText || '').replace(/\s+/g, ' ').trim();
  if (!cleanedText) {
    return 'No preview available.';
  }

  const sentences = cleanedText.split(/(?<=[.!?])\s+/).filter(Boolean);
  const firstSentence = sentences[0] || cleanedText;
  const excerpt = firstSentence.length > 180 ? `${firstSentence.slice(0, 177).trim()}…` : firstSentence;
  const keywords = [...new Set(cleanedText.toLowerCase().match(/[a-z]{5,}/g) || [])].slice(0, 3);
  const keywordText = keywords.length ? ` Key topics: ${keywords.join(', ')}.` : '';
  return `${excerpt}${keywordText}`.trim();
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function sanitizeEmailHtml(rawHtml) {
  if (!rawHtml) return '';

  let html = String(rawHtml)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[\s\S]*?>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<form[\s\S]*?<\/form>/gi, '')
    .replace(/\s+on[a-z]+=("[^"]*"|'[^']*')/gi, '')
    .replace(/href\s*=\s*["']?\s*javascript:[^"'\s>]+/gi, 'href="#"');

  return html.trim();
}

function getMessageHtml(payload) {
  if (!payload) return '';

  if (payload.parts && payload.parts.length) {
    let htmlPart = '';
    let textPart = '';

    for (const part of payload.parts) {
      const nestedHtml = getMessageHtml(part);
      if (part.mimeType === 'text/html' && part.body?.data) {
        htmlPart = decodeBase64Url(part.body.data);
      } else if (part.mimeType === 'text/plain' && part.body?.data && !textPart) {
        textPart = decodeBase64Url(part.body.data);
      }

      if (nestedHtml && nestedHtml.trim()) {
        if (part.mimeType === 'text/html' || (part.mimeType && part.mimeType.includes('multipart'))) {
          return nestedHtml;
        }
        if (!htmlPart) {
          htmlPart = nestedHtml;
        }
      }
    }

    if (htmlPart) return htmlPart;
    if (textPart) return `<pre>${escapeHtml(textPart)}</pre>`;
    return '';
  }

  if (payload.mimeType === 'text/html' && payload.body && payload.body.data) {
    return decodeBase64Url(payload.body.data);
  }

  if (payload.mimeType === 'text/plain' && payload.body && payload.body.data) {
    return `<pre>${escapeHtml(decodeBase64Url(payload.body.data))}</pre>`;
  }

  return '';
}

function buildMessageFrameDocument(htmlContent) {
  const safeHtml = sanitizeEmailHtml(htmlContent || '');
  const fallbackHtml = safeHtml || `<pre>${escapeHtml(htmlContent || 'No message content found.')}</pre>`;

  return `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <style>
          :root {
            color-scheme: light;
            --text: #111827;
            --bg: #ffffff;
            --link: #2563eb;
          }
          html, body {
            margin: 0;
            padding: 0;
            background: var(--bg);
            color: var(--text);
            font-family: "Segoe UI", sans-serif;
            line-height: 1.6;
          }
          body {
            padding: 12px 14px;
            overflow-wrap: anywhere;
            word-break: break-word;
          }
          * { box-sizing: border-box; }
          img, video, svg { max-width: 100%; height: auto; display: block; }
          a { color: var(--link); }
          table { border-collapse: collapse; width: 100%; }
          pre, code {
            white-space: pre-wrap;
            word-break: break-word;
            font-family: "SFMono-Regular", Consolas, monospace;
          }
          blockquote {
            border-left: 3px solid #cbd5e1;
            margin: 0;
            padding-left: 12px;
          }
        </style>
      </head>
      <body>${fallbackHtml}</body>
    </html>`;
}

function getSelectedSender() {
  return state.threads.find((thread) => thread.id === state.selectedSenderId) || state.threads[0];
}

function parseHeaderValue(rawValue) {
  return (rawValue || '').replace(/\s+/g, ' ').trim();
}

function parseSenderFromHeader(fromHeader) {
  const value = parseHeaderValue(fromHeader);
  const angleMatch = value.match(/<([^>]+)>/);
  const email = angleMatch ? angleMatch[1] : value;
  const displayName = value.replace(/<[^>]+>/, '').replace(/"/g, '').trim();

  return {
    name: displayName || email || 'Unknown sender',
    email: email || 'unknown@example.com'
  };
}

function decodeBase64Url(value) {
  const normalized = (value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return decodeURIComponent(
    Array.from(binary, (char) => `%${(`00${char.charCodeAt(0).toString(16)}`).slice(-2)}`).join('')
  );
}

function collectTextParts(part) {
  const parts = [];

  function visit(node) {
    if (!node) return;

    if (node.body && node.body.data) {
      const text = decodeBase64Url(node.body.data);
      if (text) {
        parts.push(text);
      }
    }

    if (node.parts) {
      node.parts.forEach(visit);
    }
  }

  visit(part);
  return parts;
}

function parseGmailMessage(message) {
  const headers = message.payload?.headers || [];
  const fromHeader = headers.find((header) => header.name.toLowerCase() === 'from');
  const subjectHeader = headers.find((header) => header.name.toLowerCase() === 'subject');
  const dateHeader = headers.find((header) => header.name.toLowerCase() === 'date');
  const sender = parseSenderFromHeader(fromHeader?.value || 'Unknown sender');
  const bodyText = collectTextParts(message.payload).join('\n').trim();
  const htmlContent = getMessageHtml(message.payload);

  return {
    id: message.id,
    subject: parseHeaderValue(subjectHeader?.value) || 'No subject',
    date: dateHeader?.value || new Date().toISOString(),
    body: bodyText || 'No message content was found in this email.',
    html: htmlContent || `<pre>${escapeHtml(bodyText || 'No message content was found in this email.')}</pre>`,
    senderName: sender.name,
    senderEmail: sender.email
  };
}

function sortThreadsByRecency(threads) {
  return [...threads].sort((a, b) => {
    const aLatest = new Date(a.messages[a.messages.length - 1]?.date || 0).getTime();
    const bLatest = new Date(b.messages[b.messages.length - 1]?.date || 0).getTime();
    return bLatest - aLatest;
  });
}

function buildGmailThreads(messages) {
  const grouped = new Map();

  messages.forEach((message) => {
    const key = message.senderEmail.toLowerCase();
    if (!grouped.has(key)) {
      grouped.set(key, {
        id: key,
        name: message.senderName,
        email: message.senderEmail,
        color: ['#5b7cff', '#3bb0a8', '#f17d6b', '#d171d8', '#f3a64d'][grouped.size % 5],
        messages: []
      });
    }

    grouped.get(key).messages.push({
      id: message.id,
      subject: message.subject,
      date: new Date(message.date).toISOString(),
      body: message.body,
      html: message.html || `<pre>${escapeHtml(message.body)}</pre>`
    });
  });

  return sortThreadsByRecency(
    [...grouped.values()].map((thread) => ({
      ...thread,
      messages: thread.messages
        .filter((message, index, array) => array.findIndex((candidate) => candidate.id === message.id) === index)
        .sort((a, b) => new Date(a.date) - new Date(b.date))
    }))
  );
}

function mergeThreads(existingThreads, incomingThreads) {
  const merged = new Map();

  existingThreads.forEach((thread) => {
    merged.set(thread.id, {
      ...thread,
      messages: [...thread.messages]
    });
  });

  incomingThreads.forEach((thread) => {
    const current = merged.get(thread.id);
    if (!current) {
      merged.set(thread.id, {
        ...thread,
        messages: [...thread.messages]
      });
      return;
    }

    const existingIds = new Set(current.messages.map((message) => message.id));
    const newMessages = thread.messages.filter((message) => !existingIds.has(message.id));
    current.messages = [...current.messages, ...newMessages].sort((a, b) => new Date(a.date) - new Date(b.date));
  });

  return sortThreadsByRecency([...merged.values()]);
}

function renderSenders() {
  senderList.innerHTML = '';
  threadCount.textContent = String(state.threads.length);

  if (!state.threads.length) {
    Array.from({ length: 5 }).forEach(() => {
      const skeleton = document.createElement('div');
      skeleton.className = 'sender-item skeleton-item';
      skeleton.innerHTML = `
        <div class="skeleton avatar-skeleton"></div>
        <div class="sender-main">
          <div class="sender-name-row">
            <span class="skeleton skeleton-line short"></span>
            <span class="skeleton skeleton-line tiny"></span>
          </div>
          <div class="skeleton skeleton-line long"></div>
        </div>
      `;
      senderList.appendChild(skeleton);
    });
    return;
  }

  state.threads.forEach((thread) => {
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
      setSelectedSender(thread.id);
    });

    senderList.appendChild(button);
  });
}

function renderThreadHeader() {
  const sender = getSelectedSender();
  if (!sender) {
    threadHeader.innerHTML = `
      <div>
        <p class="eyebrow">Inbox</p>
        <h2 class="thread-title">Loading mail</h2>
      </div>
      <div class="thread-meta">Waiting for Gmail</div>
    `;
    return;
  }

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

  if (!sender) {
    Array.from({ length: 3 }).forEach(() => {
      const skeletonCard = document.createElement('div');
      skeletonCard.className = 'message-card skeleton-card';
      skeletonCard.innerHTML = `
        <div class="message-top">
          <div class="skeleton skeleton-line subject"></div>
          <div class="skeleton skeleton-line tiny right"></div>
        </div>
        <div class="skeleton skeleton-box summary"></div>
        <div class="skeleton skeleton-box body"></div>
      `;
      messageList.appendChild(skeletonCard);
    });
    return;
  }

  sender.messages.forEach((message) => {
    const isOpen = state.openMessageIds.has(message.id);
    const article = document.createElement('article');
    article.className = `message-card ${isOpen ? 'open' : ''}`;

    const messageBody = document.createElement('div');
    messageBody.className = `message-body ${isOpen ? 'open' : ''}`;

    if (isOpen) {
      const iframe = document.createElement('iframe');
      iframe.className = 'message-iframe';
      iframe.title = `Full message from ${sender.name}`;
      iframe.setAttribute('sandbox', '');
      iframe.srcdoc = buildMessageFrameDocument(message.html || message.body);
      messageBody.appendChild(iframe);
    }

    article.innerHTML = `
      <div class="message-top">
        <h3 class="message-subject">${message.subject}</h3>
        <span class="message-date">${formatDate(message.date)}</span>
      </div>
      <div class="message-actions">
        <button class="message-summary" type="button" aria-expanded="${isOpen}">
          <span class="summary-label">AI summary</span>
          <span class="summary-text">${summarizeEmail(message.body)}</span>
        </button>
        <button class="view-full-button" type="button" data-message-id="${message.id}">View in full</button>
      </div>
    `;

    article.appendChild(messageBody);
    article.querySelector('.message-summary').addEventListener('click', () => toggleMessage(message.id));
    const fullButton = article.querySelector('.view-full-button');
    fullButton.addEventListener('click', () => {
      const fullMessage = sender.messages.find((entry) => entry.id === message.id);
      const html = sanitizeEmailHtml(fullMessage?.html || fullMessage?.body || '');
      const url = URL.createObjectURL(new Blob([buildMessageFrameDocument(html || fullMessage?.body || 'No message content found.')], { type: 'text/html' }));
      chrome.tabs.create({ url });
    });
    messageList.appendChild(article);
  });

  if (state.shouldScrollToBottom) {
    requestAnimationFrame(() => {
      messageList.scrollTop = messageList.scrollHeight;
    });
    state.shouldScrollToBottom = false;
  }
}

function render() {
  renderSenders();
  renderThreadHeader();
  renderMessages();
}

function setSelectedSender(senderId) {
  state.selectedSenderId = senderId;
  state.shouldScrollToBottom = true;
  render();
}



async function loadMessagesFromGmail(options = {}) {
  const { appendOlder = false, pageToken = state.nextPageToken } = options;

  if (!chrome?.identity || !chrome.identity.getAuthToken) {
    setStatus('The Google Identity API is not available in this browser context.', 'error');
    return false;
  }

  const manifestClientId = chrome.runtime.getManifest()?.oauth2?.client_id || '';
  if (manifestClientId.startsWith('YOUR_')) {
    setStatus('Set your Google OAuth client ID in src/manifest.json to enable Gmail access.', 'error');
    return false;
  }

  if (appendOlder && (!pageToken || state.isLoadingOlder)) {
    return false;
  }

  setStatus(appendOlder ? 'Loading older mail...' : 'Connecting to Gmail...', 'info');

  try {
    if (!state.token) {
      state.token = await new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({interactive: true}, (result) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          if (!result) {
            reject(new Error('No Gmail access token was returned.'));
            return;
          }

          resolve(result);
        });
      });
    }

    const requestUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
    requestUrl.searchParams.set('maxResults', '15');
    requestUrl.searchParams.set('labelIds', 'INBOX');
    if (pageToken) {
      requestUrl.searchParams.set('pageToken', pageToken);
    }

    const response = await fetch(requestUrl, {
      headers: {
        Authorization: `Bearer ${state.token}`
      }
    });

    if (!response.ok) {
      throw new Error(`Gmail API request failed: ${response.status}`);
    }

    const list = await response.json();
    const messageIds = list.messages || [];
    const nextPageToken = list.nextPageToken || null;

    if (!messageIds.length) {
      state.nextPageToken = null;
      setStatus('No Gmail messages found.', 'success');
      render();
      return true;
    }

    const fullMessages = await Promise.all(
      messageIds.map(async (messageReference) => {
        const detailResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageReference.id}?format=full`, {
          headers: {
            Authorization: `Bearer ${state.token}`
          }
        });

        if (!detailResponse.ok) {
          return null;
        }

        return detailResponse.json();
      })
    );

    const parsedMessages = fullMessages
      .filter(Boolean)
      .map(parseGmailMessage)
      .filter((message) => message && message.senderEmail);

    const gmailThreads = buildGmailThreads(parsedMessages);
    if (appendOlder && state.threads.length) {
      state.threads = mergeThreads(state.threads, gmailThreads);
    } else {
      state.threads = gmailThreads;
      state.shouldScrollToBottom = true;
    }

    state.nextPageToken = nextPageToken;
    state.selectedSenderId = state.threads[0]?.id || null;
    state.openMessageIds = new Set();
    setStatus(state.threads.length ? `Loaded ${state.threads.length} Gmail senders.` : 'No Gmail messages found.', 'success');
    render();
    return true;
  } catch (error) {
    console.error('Gmail load failed:', error);
    state.threads = [];
    state.selectedSenderId = null;
    state.nextPageToken = null;
    state.openMessageIds = new Set();
    setStatus('Unable to load Gmail messages. Please retry.', 'error');
    render();
    return false;
  }
}

function applyPopupSize() {
  if (!appShell) return;

  appShell.style.width = `${state.size.width}px`;
  appShell.style.height = `${state.size.height}px`;
  document.body.style.width = `${state.size.width}px`;
  document.body.style.height = `${state.size.height}px`;
  document.documentElement.style.width = `${state.size.width}px`;
  document.documentElement.style.height = `${state.size.height}px`;
}

function attachResizeHandle() {
  if (!resizeHandle) return;

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startWidth = state.size.width;
  let startHeight = state.size.height;

  resizeHandle.addEventListener('pointerdown', (event) => {
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    startWidth = state.size.width;
    startHeight = state.size.height;
    resizeHandle.setPointerCapture(event.pointerId);
  });

  resizeHandle.addEventListener('pointermove', (event) => {
    if (!dragging) return;

    const nextWidth = Math.min(1100, Math.max(620, startWidth + (event.clientX - startX)));
    const nextHeight = Math.min(900, Math.max(420, startHeight + (event.clientY - startY)));

    state.size.width = nextWidth;
    state.size.height = nextHeight;
    applyPopupSize();
  });

  resizeHandle.addEventListener('pointerup', () => {
    dragging = false;
  });

  resizeHandle.addEventListener('pointerleave', () => {
    dragging = false;
  });
}

function attachEvents() {
  refreshButton.addEventListener('click', async () => {
    refreshButton.disabled = true;
    refreshButton.textContent = 'Loading...';
    setStatus('Refreshing inbox...', 'info');

    try {
      state.nextPageToken = null;
      state.token = null;
      await loadMessagesFromGmail();
    } finally {
      refreshButton.disabled = false;
      refreshButton.textContent = 'Refresh';
    }
  });

  authButton.addEventListener('click', async () => {
    authButton.disabled = true;
    authButton.textContent = 'Connecting...';

    try {
      state.nextPageToken = null;
      state.token = null;
      await loadMessagesFromGmail();
    } finally {
      authButton.disabled = false;
      authButton.textContent = 'Connect Gmail';
    }
  });

  messageList.addEventListener('scroll', () => {
    if (state.isLoadingOlder || !state.nextPageToken) {
      return;
    }

    const threshold = 120;
    if (messageList.scrollTop <= threshold) {
      state.isLoadingOlder = true;
      const previousScrollHeight = messageList.scrollHeight;
      const previousScrollTop = messageList.scrollTop;
      setStatus('Loading older mail...', 'info');

      loadMessagesFromGmail({ appendOlder: true })
        .finally(() => {
          state.isLoadingOlder = false;
          requestAnimationFrame(() => {
            messageList.scrollTop = messageList.scrollHeight - previousScrollHeight + previousScrollTop;
          });
        });
    }
  });

  attachResizeHandle();
}

applyPopupSize();
attachEvents();
setStatus('Loading message threads...', 'info');
render();
loadMessagesFromGmail().then(_ => {});
