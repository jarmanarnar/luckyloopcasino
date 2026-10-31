import { GAMES, PROVIDERS } from './catalog.js';
import { GAME_TYPES, getGameTypeId } from './game-types.js';

// Provider-page copy describes our active catalog, rather than manufacturing
// studio biographies or treating unverified source metadata as game facts.
export function getProviderDetails(id) {
  const provider = PROVIDERS.find(item => item.id === id);
  if (!provider) return null;
  const games = GAMES.filter(game => game.providerId === id);
  const formats = GAME_TYPES.map(type => ({
    id: type.id,
    title: type.title,
    count: games.filter(game => getGameTypeId(game) === type.id).length,
  })).filter(type => type.count > 0);
  return {
    id: provider.id,
    name: provider.name,
    gameCount: games.length,
    formats,
    summary: `Explore ${provider.name} games in our demo catalog.`,
    description: [
      `This collection currently includes ${games.length} ${provider.name} games. Browse the available titles, search by name, or change the order to find your next game.`,
      `Available game formats: ${formats.map(type => type.title).join(', ')}. Each card opens the selected game inside the site, with the wallet and navigation kept within reach.`,
    ],
  };
}
