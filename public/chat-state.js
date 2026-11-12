// Browser-local preview: no network, wagers or wallet mutations.
export const CHAT_LIMIT = 300;
export const CHAT_HISTORY_LIMIT = 100;
export const CHAT_ROOMS = Object.freeze({ general: 'General Chat', vip: 'VIP Chat' });

export function cleanChatText(value, limit = CHAT_LIMIT) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u0008\u000b-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/gu, '').trim().slice(0, limit) : '';
}
export function normalizeChatMessages(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.filter(item => item && typeof item.id === 'string' && item.id.length <= 100
    && Object.hasOwn(CHAT_ROOMS, item.room) && cleanChatText(item.text)
    && typeof item.at === 'string' && Number.isFinite(Date.parse(item.at)))
    .filter(item => { if (seen.has(item.id)) return false; seen.add(item.id); return true; })
    .slice(-CHAT_HISTORY_LIMIT).map(item => ({
      id: item.id, room: item.room, text: cleanChatText(item.text),
      name: cleanChatText(item.name, 24) || 'Loop Player', at: item.at,
      reply: item.reply && cleanChatText(item.reply.text) ? {
        name: cleanChatText(item.reply.name, 24) || 'Loop Player', text: cleanChatText(item.reply.text, 100),
      } : null,
    }));
}
const sample = (id, name, avatar, text, rank = 'silver', reply = null) => ({ id, name, avatar, text, rank, reply });
export const SAMPLE_MESSAGES = Object.freeze({
  general: [
    sample('g1', 'Luna', '🌙', 'Hey everyone! 👋', 'gold'),
    sample('g2', 'PixelFox', '🦊', 'Good luck, Loop crew 🍀'),
    sample('g3', 'Milo', '🧑🏽‍🚀', 'Love the new lobby.', 'gold'),
    sample('g4', 'Nova', '👩🏻', 'Hello friends ✨', 'gold'),
    sample('g5', 'Orbit', '🪐', 'What are you playing today?'),
    sample('g6', 'Loop Guide', '🎧', 'Welcome! Tap a message to reply.', 'guide', { name: 'Luna', text: 'Hey everyone! 👋' }),
    sample('g7', 'Sunny', '🌞', 'Good luck everyone 🌈', 'gold'),
    sample('g8', 'Mochi', '🐼', 'Just exploring the new games.'),
    sample('g9', 'PixelFox', '🦊', 'The new releases look great.', 'silver', { name: 'Orbit', text: 'What are you playing today?' }),
    sample('g10', 'Nova', '👩🏻', 'Nice! ✨', 'gold'),
    sample('g11', 'LuckyCat', '🐱', 'Hello Loop! 🍀', 'gold'),
    sample('g12', 'Atlas', '🧑🏻', 'Have a great day, everyone.'),
    sample('g13', 'Luna', '🌙', 'Good vibes all around 💜', 'gold'),
    sample('g14', 'Orbit', '🪐', 'See you in the lobby!'),
    sample('g15', 'Loop Guide', '🎧', 'This is a demo conversation. Your messages stay on this device.', 'guide'),
    sample('g16', 'Sunny', '🌞', 'Good luck, friends 🍀', 'gold'),
  ],
  vip: [
    sample('v1', 'Loop Guide', '🎧', 'Welcome to the VIP room preview.', 'guide'),
    sample('v2', 'Luna', '🌙', 'A little quieter in here ✨', 'gold'),
    sample('v3', 'Atlas', '🧑🏻', 'Hello everyone!', 'gold'),
    sample('v4', 'Nova', '👩🏻', 'Have a lovely session 🍀', 'gold'),
  ],
});
