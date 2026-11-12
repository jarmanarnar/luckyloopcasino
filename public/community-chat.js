import { CHAT_LIMIT, CHAT_ROOMS, SAMPLE_MESSAGES, cleanChatText, normalizeChatMessages } from './chat-state.js';

function icon(name) {
  const paths = {
    chat: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/><path d="M8 9h8M8 13h5"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    down: '<path d="m7 10 5 5 5-5"/>',
    rules: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z M22 2 11 13"/>',
    smile: '<circle cx="12" cy="12" r="9"/><path d="M8 14s1 3 4 3 4-3 4-3M8 8h.01M16 8h.01"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
  };
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[name] || paths.chat) + '</svg>';
}
function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function initCommunityChat({ account, auth }) {
  const panel = node('aside', 'community-chat');
  panel.id = 'community-chat';
  panel.lang = 'en'; panel.dir = 'ltr'; panel.hidden = true; panel.inert = true;
  panel.setAttribute('aria-label', 'Community chat');
  // Static markup only. Stored/profile/message values use textContent below.
  panel.innerHTML = [
    '<header class="chat-header"><div class="chat-room-control">',
    '<button class="chat-room-button" type="button" aria-expanded="false" aria-controls="chat-rooms"><span>General Chat</span>', icon('down'), '</button>',
    '<div id="chat-rooms" class="chat-rooms" hidden>',
    ...Object.entries(CHAT_ROOMS).map(([id, label]) => '<button type="button" data-chat-room="' + id + '" aria-pressed="' + (id === 'general') + '">' + label + icon('check') + '</button>'),
    '</div></div><button class="chat-icon-button" type="button" data-chat-action="rules" aria-label="Chat rules" title="Chat rules">', icon('rules'), '</button>',
    '<button class="chat-icon-button chat-close" type="button" data-chat-action="close" aria-label="Close chat" title="Close chat">', icon('close'), '</button></header>',
    '<div class="chat-feed-wrap"><div id="chat-feed" class="chat-feed" role="log" aria-label="Chat messages" aria-live="off" tabindex="0"></div><button class="chat-latest" type="button" hidden>Latest messages ', icon('down'), '</button></div>',
    '<footer class="chat-footer"><div class="chat-reply-preview" hidden><div><strong></strong><span></span></div><button type="button" class="chat-icon-button" aria-label="Cancel reply">', icon('close'), '</button></div>',
    '<div class="chat-emoji" aria-label="Choose an emoji" hidden>',
    ...['🍀','👋','💜','🎉','✨','😊','🔥','🌈'].map(emoji => '<button type="button" aria-label="Insert ' + emoji + '">' + emoji + '</button>'),
    '</div><form id="chat-form" class="chat-composer"><label class="visually-hidden" for="chat-message">Message</label><textarea id="chat-message" rows="1" maxlength="' + CHAT_LIMIT + '" placeholder="Write a message…" autocomplete="off"></textarea>',
    '<button class="chat-icon-button" type="button" aria-label="Choose emoji" aria-expanded="false">', icon('smile'), '</button><button class="chat-send" type="submit" aria-label="Send message" disabled>', icon('send'), '</button></form>',
    '<div class="chat-footer__meta"><span>Demo chat · on this device only</span><span id="chat-count">0 / ' + CHAT_LIMIT + '</span></div><p id="chat-status" class="chat-status" role="status" aria-live="polite"></p></footer>',
    '<dialog class="chat-sheet" aria-labelledby="chat-sheet-title"><header><h2 id="chat-sheet-title"></h2><button type="button" class="chat-icon-button" aria-label="Close chat details">', icon('close'), '</button></header><div class="chat-sheet__body"></div></dialog>',
  ].join('');
  const backdrop = node('div', 'chat-backdrop');
  backdrop.hidden = true; backdrop.setAttribute('aria-hidden', 'true');
  document.body.append(backdrop, panel);

  const $ = selector => panel.querySelector(selector);
  const feed = $('#chat-feed'), form = $('#chat-form'), input = $('#chat-message'), send = $('.chat-send');
  const roomButton = $('.chat-room-button'), rooms = $('#chat-rooms'), status = $('#chat-status');
  const replyPreview = $('.chat-reply-preview'), emojiPicker = $('.chat-emoji'), emojiButton = $('[aria-label="Choose emoji"]');
  const sheet = $('.chat-sheet'), sheetBody = $('.chat-sheet__body');
  const desktop = matchMedia('(min-width: 75rem)');
  const storageKey = 'luckyloop-chat-v1:' + account.getSnapshot().playerId;
  let storage; try { storage = localStorage; } catch { /* In-memory preview still works. */ }
  let messages = [], room = 'general', reply = null;
  let opened = false, opener = null, lastSent = 0, closeTimer = null;
  const inertNodes = new Map(), triggers = [];
  const readSaved = () => { try { return JSON.parse(storage?.getItem(storageKey) || '{}') || {}; } catch { return {}; } };
  function load() { const saved = readSaved(); messages = normalizeChatMessages(saved.messages); }
  load();
  function save() {
    try {
      const saved = readSaved();
      messages = normalizeChatMessages([...normalizeChatMessages(saved.messages), ...messages]
        .sort((a, b) => Date.parse(a.at) - Date.parse(b.at)));
      storage?.setItem(storageKey, JSON.stringify({ messages }));
      if (!storage) status.textContent = 'Messages are available for this session only.';
    } catch { status.textContent = 'Messages are available for this session only.'; }
  }
  for (const [selector, className] of [['#header-member-actions','header-member-action header-chat'], ['#guest-header-actions','auth-icon-button header-chat']]) {
    const trigger = node('button', className);
    trigger.type = 'button'; trigger.innerHTML = icon('chat'); trigger.title = 'Community chat';
    trigger.setAttribute('aria-label', 'Open community chat');
    trigger.setAttribute('aria-controls', panel.id); trigger.setAttribute('aria-expanded', 'false');
    trigger.addEventListener('click', () => opened ? close() : open(trigger));
    document.querySelector(selector)?.append(trigger); triggers.push(trigger);
  }
  function setBackgroundInert(value) {
    if (value) {
      for (const element of document.body.children) {
        if (element === panel || element === backdrop || inertNodes.has(element)) continue;
        inertNodes.set(element, element.inert); element.inert = true;
      }
    } else { for (const [element, previous] of inertNodes) element.inert = previous; inertNodes.clear(); }
  }
  function layout() {
    const modal = opened && !desktop.matches;
    panel.setAttribute('role', desktop.matches ? 'complementary' : 'dialog');
    if (modal) panel.setAttribute('aria-modal', 'true'); else panel.removeAttribute('aria-modal');
    backdrop.hidden = !modal; setBackgroundInert(modal);
    document.body.dataset.chatModal = String(modal);
    if (modal && !panel.contains(document.activeElement)) $('.chat-close').focus({ preventScroll: true });
  }
  function bottom() { feed.scrollTop = feed.scrollHeight; $('.chat-latest').hidden = true; }
  function setReply(item) {
    if (!account.isSignedIn()) { login(); return; }
    reply = { name: item.name, text: item.text };
    replyPreview.querySelector('strong').textContent = 'Replying to ' + item.name;
    replyPreview.querySelector('span').textContent = item.text;
    replyPreview.hidden = false; input.focus({ preventScroll: true });
  }
  function clearReply() { reply = null; replyPreview.hidden = true; }
  function messageCard(item, own = false) {
    const card = node('button', 'chat-message'); card.type = 'button'; card.dataset.rank = own ? 'own' : item.rank;
    card.setAttribute('aria-label', 'Reply to ' + item.name + ': ' + item.text);
    const avatar = node('span', 'chat-avatar', own ? account.getMemberState().profile.avatar : item.avatar);
    avatar.setAttribute('aria-hidden', 'true');
    avatar.append(node('span', 'chat-avatar__badge', item.rank === 'guide' ? '✓' : '◆'));
    const copy = node('span', 'chat-message__copy');
    if (item.reply) {
      const quoted = node('span', 'chat-message__quote');
      quoted.append(node('strong', '', item.reply.name + ': '), node('span', '', item.reply.text)); copy.append(quoted);
    }
    const text = node('span', 'chat-message__text'); text.dir = 'auto';
    text.append(node('strong', 'chat-message__name', item.name + ': '), node('span', '', item.text)); copy.append(text);
    card.append(avatar, copy); card.addEventListener('click', () => setReply(item)); return card;
  }
  function renderMessages(scroll = false) {
    const nearEnd = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 70, previousScroll = feed.scrollTop;
    feed.replaceChildren(node('p', 'chat-day', 'Demo conversation'),
      ...SAMPLE_MESSAGES[room].map(item => messageCard(item)),
      ...messages.filter(item => item.room === room).map(item => messageCard(item, true)));
    if (scroll || nearEnd) bottom(); else { feed.scrollTop = previousScroll; $('.chat-latest').hidden = false; }
  }
  function updateComposer() {
    send.disabled = !account.isSignedIn() || !cleanChatText(input.value);
    $('#chat-count').textContent = input.value.length + ' / ' + CHAT_LIMIT;
    input.style.height = 'auto'; input.style.height = Math.min(88, Math.max(38, input.scrollHeight)) + 'px';
  }
  function syncAccount() {
    const signed = account.isSignedIn();
    form.hidden = !signed; $('#chat-count').hidden = !signed;
    if (!signed) {
      close(); clearTimeout(closeTimer); panel.hidden = true;
      input.value = ''; clearReply(); emojiPicker.hidden = true; emojiButton.setAttribute('aria-expanded', 'false');
    }
    updateComposer();
  }
  function open(trigger = triggers.find(item => item.getClientRects().length)) {
    if (!account.isSignedIn()) { login(); return; }
    if (document.querySelector('dialog[open]')) return;
    clearTimeout(closeTimer); opener = trigger || opener; opened = true;
    panel.hidden = false; panel.inert = false;
    panel.getBoundingClientRect(); // Commit the off-screen position before animating.
    document.body.dataset.chat = 'open';
    triggers.forEach(item => { item.setAttribute('aria-expanded', 'true'); item.setAttribute('aria-label', 'Close community chat'); });
    load(); syncAccount(); renderMessages(true); layout();
    $('.chat-close').focus({ preventScroll: true });
  }
  function close() {
    if (!opened) return;
    opened = false;
    if (sheet.open) sheet.close();
    rooms.hidden = true; roomButton.setAttribute('aria-expanded', 'false');
    emojiPicker.hidden = true; emojiButton.setAttribute('aria-expanded', 'false');
    panel.inert = true; document.body.dataset.chat = 'closed'; layout();
    triggers.forEach(item => { item.setAttribute('aria-expanded', 'false'); item.setAttribute('aria-label', 'Open community chat'); });
    const target = opener?.getClientRects().length ? opener : triggers.find(item => item.getClientRects().length);
    target?.focus({ preventScroll: true });
    closeTimer = setTimeout(() => { if (!opened) panel.hidden = true; }, 260);
  }
  function login() { close(); auth.open('login'); }
  function openRules() {
    $('#chat-sheet-title').textContent = 'Chat rules';
    sheetBody.replaceChildren(node('p', '', 'A good conversation starts with a little respect.'));
    const list = node('ul');
    for (const rule of ['Be kind. No harassment or personal attacks.', 'Keep messages on topic. No spam or promotions.', 'Never share passwords, payment details or private information.', 'These are sample rooms. Messages are saved on this device, not sent to other players.']) list.append(node('li', '', rule));
    sheetBody.append(list);
    sheet.showModal();
  }
  panel.addEventListener('click', event => {
    const action = event.target.closest('[data-chat-action]')?.dataset.chatAction;
    if (action === 'close') close(); else if (action === 'rules') openRules();
  });
  backdrop.addEventListener('click', close);
  sheet.querySelector('header button').addEventListener('click', () => sheet.close());
  sheet.addEventListener('click', event => {
    if (event.target !== sheet) return;
    const rect = sheet.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) sheet.close();
  });
  roomButton.addEventListener('click', () => { rooms.hidden = !rooms.hidden; roomButton.setAttribute('aria-expanded', String(!rooms.hidden)); });
  rooms.addEventListener('click', event => {
    const next = event.target.closest('[data-chat-room]')?.dataset.chatRoom;
    if (!Object.hasOwn(CHAT_ROOMS, next)) return;
    room = next; roomButton.querySelector('span').textContent = CHAT_ROOMS[room];
    for (const option of rooms.querySelectorAll('button')) option.setAttribute('aria-pressed', String(option.dataset.chatRoom === room));
    rooms.hidden = true; roomButton.setAttribute('aria-expanded', 'false'); clearReply(); status.textContent = ''; renderMessages(true); roomButton.focus();
  });
  replyPreview.querySelector('button').addEventListener('click', () => { clearReply(); input.focus(); });
  emojiButton.addEventListener('click', () => { emojiPicker.hidden = !emojiPicker.hidden; emojiButton.setAttribute('aria-expanded', String(!emojiPicker.hidden)); });
  emojiPicker.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button) return;
    const value = button.textContent;
    if (input.value.length - (input.selectionEnd - input.selectionStart) + value.length <= CHAT_LIMIT) input.setRangeText(value, input.selectionStart, input.selectionEnd, 'end');
    emojiPicker.hidden = true; emojiButton.setAttribute('aria-expanded', 'false'); updateComposer(); input.focus();
  });
  input.addEventListener('input', updateComposer);
  input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); form.requestSubmit(); } });
  form.addEventListener('submit', event => {
    event.preventDefault(); const text = cleanChatText(input.value);
    if (!account.isSignedIn()) { login(); return; }
    if (!text) return;
    if (Date.now() - lastSent < 800) { status.textContent = 'Give your last message a moment.'; return; }
    lastSent = Date.now();
    messages.push({ id: crypto.randomUUID(), room, text, name: account.getMemberState().profile.displayName, at: new Date().toISOString(), reply });
    status.textContent = 'Message saved on this device.'; save(); input.value = ''; clearReply(); updateComposer(); renderMessages(true); input.focus();
  });
  $('.chat-latest').addEventListener('click', bottom);
  feed.addEventListener('scroll', () => { $('.chat-latest').hidden = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 100; }, { passive: true });
  document.addEventListener('pointerdown', event => { if (!event.target.closest('.chat-room-control')) { rooms.hidden = true; roomButton.setAttribute('aria-expanded', 'false'); } });
  document.addEventListener('keydown', event => {
    if (!opened || event.defaultPrevented || document.querySelector('dialog[open]')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!rooms.hidden) { rooms.hidden = true; roomButton.setAttribute('aria-expanded', 'false'); roomButton.focus(); }
      else if (!emojiPicker.hidden) { emojiPicker.hidden = true; emojiButton.setAttribute('aria-expanded', 'false'); emojiButton.focus(); }
      else close();
    } else if (event.key === 'Tab' && !desktop.matches) {
      const controls = [...panel.querySelectorAll('button,textarea,[tabindex]')].filter(item => !item.disabled && item.tabIndex >= 0 && item.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    }
  });
  desktop.addEventListener('change', layout);
  window.addEventListener('storage', event => { if (event.key === storageKey) { load(); if (opened) renderMessages(); } });
  account.subscribe(syncAccount); syncAccount();
  return { open, close };
}
