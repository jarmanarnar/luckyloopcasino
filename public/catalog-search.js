// Share matching between the lobby, catalog and member collections.
export function normalizeSearchText(value) {
  return String(value || '').normalize('NFD').replace(/\p{M}/gu, '')
    .toLocaleLowerCase().replace(/['’‘]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const documents = new WeakMap();
function searchDocument(game) {
  if (!documents.has(game)) {
    const title = normalizeSearchText(game.title);
    const provider = normalizeSearchText(game.providerName);
    documents.set(game, { title, compactTitle: title.replaceAll(' ', ''), provider,
      compactProvider: provider.replaceAll(' ', ''), words: `${title} ${provider}`.split(' ').filter(Boolean) });
  }
  return documents.get(game);
}

// One insertion, deletion, substitution or adjacent transposition. Never fuzzy
// match short terms or compare against arbitrary substrings of a longer word.
function oneEditApart(term, word) {
  if (term.length < 4 || word.length < 4 || Math.abs(term.length - word.length) > 1) return false;
  let offset = 0;
  while (offset < term.length && term[offset] === word[offset]) offset++;
  if (offset === term.length || offset === word.length) return true;
  if (term.length > word.length) return term.slice(offset + 1) === word.slice(offset);
  if (word.length > term.length) return term.slice(offset) === word.slice(offset + 1);
  return term.slice(offset + 1) === word.slice(offset + 1)
    || (term[offset] === word[offset + 1] && term[offset + 1] === word[offset]
      && term.slice(offset + 2) === word.slice(offset + 2));
}

export function createCatalogSearch(value) {
  const query = normalizeSearchText(value);
  const compactQuery = query.replaceAll(' ', '');
  const terms = [...new Set(query.split(' ').filter(Boolean))];
  return {
    active: Boolean(query),
    score(game) {
      if (!query) return 0;
      const { title, compactTitle, provider, compactProvider, words } = searchDocument(game);
      if (title === query || compactTitle === compactQuery) return 0;
      if (title.startsWith(query) || compactTitle.startsWith(compactQuery)) return 100;
      if (title.includes(query) || compactTitle.includes(compactQuery)) return 200;
      if (provider.includes(query) || compactProvider.includes(compactQuery)) return 400;
      let fuzzyTerms = 0;
      let partialTerms = 0;
      for (const term of terms) {
        if (words.includes(term)) continue;
        if (words.some(word => word.startsWith(term))) { partialTerms++; continue; }
        if (fuzzyTerms || !words.some(word => oneEditApart(term, word))) return null;
        fuzzyTerms++;
      }
      if (fuzzyTerms) return 500 + partialTerms;
      return 300 + partialTerms;
    },
  };
}
