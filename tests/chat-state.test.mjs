import assert from 'node:assert/strict';
import test from 'node:test';
import { CHAT_LIMIT, CHAT_HISTORY_LIMIT, cleanChatText, normalizeChatMessages } from '../public/chat-state.js';

const message = (id, overrides = {}) => ({
  id, name: 'Alex', room: 'general', text: 'Hello 🍀', at: '2026-11-12T12:00:00Z', ...overrides,
});
test('stored chat rejects invalid rooms, dates and empty messages and deduplicates ids', () => {
  assert.deepEqual(normalizeChatMessages(null), []);
  const result = normalizeChatMessages([null, message('1'), message('1'), message('2', { room: '__proto__' }),
    message('3', { at: 'invalid' }), message('4', { text: ' \u0000 ' })]);
  assert.equal(result.length, 1);
  assert.equal(result[0].text, 'Hello 🍀');
});
test('messages are bounded and text remains literal, including HTML-looking input', () => {
  assert.equal(cleanChatText('x'.repeat(500)).length, CHAT_LIMIT);
  assert.equal(cleanChatText(' \u202eHello\u0000\nworld '), 'Hello\nworld');
  assert.equal(cleanChatText('<img src=x onerror=alert(1)>'), '<img src=x onerror=alert(1)>');
  const result = normalizeChatMessages([message('reply', { name: 'N'.repeat(99), reply: { name: 'R'.repeat(80), text: 'T'.repeat(400) } })])[0];
  assert.equal(result.name.length, 24);
  assert.equal(result.reply.name.length, 24);
  assert.equal(result.reply.text.length, 100);
});
test('history keeps the most recent bounded set and preserves room separation', () => {
  const result = normalizeChatMessages(Array.from({ length: 130 }, (_, i) => message(String(i), { room: i % 2 ? 'vip' : 'general' })));
  assert.equal(result.length, CHAT_HISTORY_LIMIT);
  assert.equal(result[0].id, '30');
  assert.equal(result.filter(item => item.room === 'vip').length, 50);
});
