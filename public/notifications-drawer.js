import { formatRoute } from './routes.js';

const platformNotices = [
  { id: 'platform:new-releases', title: 'Explore New Releases', detail: 'See the latest additions to the demo catalog.',
    action: 'Browse games', route: { type: 'category', categoryId: 'new-releases' } },
  { id: 'platform:daily-bonus', title: 'Daily Bonus', detail: 'Check today’s demo reward and your seven-day streak.',
    action: 'View Daily Bonus', route: { type: 'feature', pageId: 'daily-bonus' } },
  { id: 'platform:providers', title: 'Browse Game Providers', detail: 'Find games from your favorite studios.',
    action: 'View providers', route: { type: 'providers' } },
];
const timeLabel = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

export function initNotificationsDrawer({ router, account, auth }) {
  const dialog = document.querySelector('#notifications-drawer');
  const trigger = document.querySelector('#header-notifications');
  const body = dialog.querySelector('.notifications-drawer__body');
  const tabs = [...dialog.querySelectorAll('[role="tab"]')];
  const [personalPanel, platformPanel] = body.querySelectorAll('[role="tabpanel"]');
  const readAll = dialog.querySelector('.notifications-drawer__read-all');
  const status = dialog.querySelector('[role="status"]');
  let selected = 1;
  let unreadIds = [];
  let renderKey = '';
  let saving = false;

  function selectTab(index) {
    selected = index;
    tabs.forEach((tab, position) => {
      tab.setAttribute('aria-selected', String(index === position));
      tab.tabIndex = index === position ? 0 : -1;
    });
    personalPanel.hidden = index !== 0;
    platformPanel.hidden = index !== 1;
    body.scrollTop = 0;
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(index));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index;
      selectTab(next);
      tabs[next].focus();
    });
  });

  function card(notice, read) {
    const article = node('article', 'notification-card');
    article.dataset.unread = String(!read.has(notice.id));
    if (notice.route) {
      const placeholder = node('div', 'notification-card__media');
      placeholder.setAttribute('aria-hidden', 'true');
      article.append(placeholder);
    }
    const header = node('header', 'notification-card__header');
    header.append(node('h3', '', notice.title));
    if (notice.at && Number.isFinite(Date.parse(notice.at))) {
      const time = node('time', '', timeLabel.format(new Date(notice.at)));
      time.dateTime = notice.at;
      header.append(time);
    }
    article.append(header, node('p', 'notification-card__description', notice.detail));
    if (notice.route) {
      const link = node('a', 'notification-card__action', notice.action);
      link.href = formatRoute(notice.route);
      link.addEventListener('click', event => {
        if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        close();
        router.navigate(notice.route);
      });
      article.append(link);
    }
    return article;
  }

  function syncReadAll() {
    const disabled = saving || !unreadIds.length;
    if (disabled && document.activeElement === readAll) tabs[selected].focus({ preventScroll: true });
    readAll.disabled = disabled;
  }

  function render() {
    const personal = account.getMemberState().history.filter(item => item.type === 'reward').slice(-30).reverse()
      .map(({ id, title, at, detail }) => ({ id: `personal:${id}`, title, at, detail }));
    const read = new Set(account.getNotificationReadIds());
    const key = JSON.stringify([personal, [...read]]);
    if (renderKey === key) return;
    renderKey = key;
    unreadIds = [...personal, ...platformNotices].map(notice => notice.id).filter(id => !read.has(id));
    personalPanel.replaceChildren(...(personal.length ? personal.map(notice => card(notice, read))
      : [node('p', 'notifications-drawer__empty', 'No personal notifications yet.')]));
    platformPanel.replaceChildren(...platformNotices.map(notice => card(notice, read)));
    syncReadAll();
  }

  readAll.addEventListener('click', async () => {
    if (saving || !unreadIds.length) return;
    saving = true;
    syncReadAll();
    status.textContent = '';
    try {
      const result = await account.markNotificationsRead(unreadIds);
      status.textContent = result.ok ? 'Notifications marked as read.' : 'Unable to mark notifications as read.';
    } catch {
      status.textContent = 'Unable to mark notifications as read.';
    } finally {
      saving = false;
      if (dialog.open) render();
      syncReadAll();
    }
  });

  function close() {
    if (dialog.open) dialog.close();
  }
  dialog.querySelector('.notifications-drawer__close').addEventListener('click', close);
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
  });
  router.subscribe(close);
  account.subscribe(() => {
    if (!account.isSignedIn()) close();
    else if (dialog.open) render();
  });

  function open() {
    return auth.require(() => {
      if (document.querySelector('dialog[open]')) return;
      status.textContent = '';
      render();
      body.scrollTop = 0;
      dialog.showModal();
    });
  }
  trigger.addEventListener('click', open);
  return { open };
}
