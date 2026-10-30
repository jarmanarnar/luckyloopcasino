// Permanent exclusions from the user's review. Keep these when refreshing the
// catalog or curating picks; archived source data is not an approved game list.
const removedIds = new Set([
  'demonbeatsr96f10',
  'bloodsuckersj0r2',
  'bloodsuckers2000',
  'ghostpirates0000',
  'halloweenjack000',
  'whatsupwitcr96f1',
  'bloodandshadow2',
  'bloodandshadow',
  'alohaxmas0000000',
  'gonzo',
  'starburst',
  'barbarianfury',
  'bonanza',
  'mental',
  'fruitshop0000000',
  'baccarat2ne00000',
  'jacksmultihandn1',
  'blackjack3ne0000',
  'gonzosquestr96f1',
  'doublestacks0000',
  'divinemegaways00',
  'divinefortur96f1',
  'godsoffortune000',
  'discodanny000000',
  'deadwestr96f1000',
  'deadalive3r96f10',
  'deadoralive2fb00',
  'deadoralive00000',
  // Original vendor codes for games that used a local shorthand ID.
  'eldorado00000000',
  'starburstr000000',
  'bonanzav60000000',
]);

export function isRemovedGame(game) {
  const demoId = new URL(game.url).pathname.split('/').filter(Boolean).at(-1);
  return removedIds.has(game.id.toLowerCase()) || removedIds.has(demoId.toLowerCase());
}
