// Solid UI symbols with transparent cutouts, readable on every app surface.
const paths = {
  filters: 'M7 2h2v3H7V2ZM3 6h10v2H3V6Zm4 3h2v13H7V9Zm9-7h2v13h-2V2Zm-4 14h10v2H12v-2Zm4 3h2v3h-2v-3Z',
  chat: 'M12 2C6.5 2 2 5.8 2 10.5c0 2.1.9 4.1 2.4 5.6L3 22l6.3-3.3c.9.2 1.8.3 2.7.3 5.5 0 10-3.8 10-8.5S17.5 2 12 2ZM7 7.5a1 1 0 0 0 0 2h10a1 1 0 0 0 0-2H7Zm0 4a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2H7Z',
  support: 'M12 2a9 9 0 0 0-9 9v1a2 2 0 0 0-1 1.7v3.6A2.7 2.7 0 0 0 4.7 20H7V11H5.5a6.5 6.5 0 0 1 13 0H17v9h1a2 2 0 0 1-2 1h-1.3a1.5 1.5 0 0 0-1.4-1h-2.6a1.5 1.5 0 0 0 0 3h2.6a1.5 1.5 0 0 0 1.4-1H16a4 4 0 0 0 4-2.4 2.7 2.7 0 0 0 2-2.3v-3.6a2 2 0 0 0-1-1.7v-1a9 9 0 0 0-9-9Z',
  help: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM8.3 8.5h2.2a1.5 1.5 0 0 1 3 0c0 .7-.4 1.1-1.2 1.7-1.2.8-1.5 1.6-1.5 3.3H13c0-1.1.1-1.4 1-2 1.2-.8 1.8-1.7 1.8-3a3.8 3.8 0 0 0-7.5 0ZM12 15a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8Z',
  history: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM11 6v7.1l4.4 2.6 1.2-2-3.2-1.8V6H11Z',
  logout: 'M4 2h9a2 2 0 0 1 2 2v4h-3V5H6v14h6v-3h3v4a2 2 0 0 1-2 2H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Zm13.1 5.1L22 12l-4.9 4.9-1.8-1.8 1.9-1.9H9v-2.4h8.2l-1.9-1.9 1.8-1.8Z',
  cards: 'M9 2h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm5 5-3 4 3 4 3-4-3-4ZM3 6h2v13a3 3 0 0 0 3 3h8v1H5a3 3 0 0 1-3-3V7a1 1 0 0 1 1-1Z',
  rules: 'M6 2h7v6a2 2 0 0 0 2 2h5v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm9 .6L20 8h-5V2.6ZM8 13a1 1 0 0 0 0 2h8a1 1 0 0 0 0-2H8Zm0 4a1 1 0 0 0 0 2h5a1 1 0 0 0 0-2H8Z',
  send: 'M21.5 2.2a1 1 0 0 1 1.3 1.3l-6 18a1 1 0 0 1-1.8.1l-4.2-7.8 6.8-7.4-7.4 6.8-7.8-4.2a1 1 0 0 1 .1-1.8l19-5Z',
  smile: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM8.5 7.5a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Zm7 0a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6ZM7 13.5a5 5 0 0 0 10 0h-2a3 3 0 0 1-6 0H7Z',
  edit: 'm15 4 5 5-11.3 11.3-6 1 1-6L15 4Zm1.5-1.5 1-1a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8l-1 1-5-5Z',
  search: 'M10.5 2a8.5 8.5 0 1 0 5.1 15.3l4.8 4.8 1.7-1.7-4.8-4.8A8.5 8.5 0 0 0 10.5 2Zm0 2.5a6 6 0 1 1 0 12 6 6 0 0 1 0-12Z',
  eye: 'M12 4C6 4 2.5 9 1 12c1.5 3 5 8 11 8s9.5-5 11-8C21.5 9 18 4 12 4Zm0 3.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Zm0 2.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',
  'eye-off': 'm3.3 1.7 19 19-1.6 1.6-19-19 1.6-1.6ZM12 4c6 0 9.5 5 11 8-.6 1.3-1.7 2.9-3.1 4.4l-3.5-3.5a4.5 4.5 0 0 0-5.3-5.3L7.9 4.4A12 12 0 0 1 12 4ZM4.1 7.6l3.5 3.5a4.5 4.5 0 0 0 5.3 5.3l3.2 3.2c-1.3.3-2.6.4-4.1.4-6 0-9.5-5-11-8 .6-1.3 1.7-2.9 3.1-4.4Z',
  theater: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm1 5v6h14V9H5Z',
  fullscreen: 'M3 3h7v2.5H5.5V10H3V3Zm11 0h7v7h-2.5V5.5H14V3ZM3 14h2.5v4.5H10V21H3v-7Zm15.5 0H21v7h-7v-2.5h4.5V14Z',
  info: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM12 6a1.4 1.4 0 1 0 0 2.8A1.4 1.4 0 0 0 12 6Zm-1.2 5v7h2.4v-7h-2.4Z',
  close: 'm6.4 4.8 5.6 5.6 5.6-5.6 1.6 1.6-5.6 5.6 5.6 5.6-1.6 1.6-5.6-5.6-5.6 5.6-1.6-1.6 5.6-5.6-5.6-5.6 1.6-1.6Z',
  down: 'm5 8 7 7 7-7-1.8-1.8-5.2 5.2-5.2-5.2L5 8Z',
  left: 'm15 3-9 9 9 9 1.8-1.8L9.6 12l7.2-7.2L15 3Z',
  right: 'm9 3 9 9-9 9-1.8-1.8 7.2-7.2-7.2-7.2L9 3Z',
  'arrow-right': 'm14 4-1.8 1.8 4.9 4.9H3v2.6h14.1l-4.9 4.9L14 20l8-8-8-8Z',
  'arrow-up': 'm12 2-8 8 1.8 1.8 4.9-4.9V21h2.6V6.9l4.9 4.9L20 10l-8-8Z',
  check: 'm20.1 5.1-11 11-5.2-5.2-1.8 1.8 7 7 12.8-12.8-1.8-1.8Z',
};
const SVG_NS = 'http://www.w3.org/2000/svg';

function paintIcon(svg, name) {
  if (!Object.hasOwn(paths, name)) throw new Error(`Unknown UI icon: ${name}`);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', paths[name]);
  path.setAttribute('fill-rule', 'evenodd');
  path.setAttribute('clip-rule', 'evenodd');
  svg.replaceChildren(path);
  return svg;
}

export function createUiIcon(name, className = '') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '24');
  return paintIcon(svg, name);
}

// Only named, authored paths enter the chat's static template.
export function uiIconMarkup(name) {
  if (!Object.hasOwn(paths, name)) throw new Error(`Unknown UI icon: ${name}`);
  return `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path fill-rule="evenodd" clip-rule="evenodd" d="${paths[name]}"/></svg>`;
}

export function initUiIcons() {
  for (const svg of document.querySelectorAll('svg[data-ui-icon]')) paintIcon(svg, svg.dataset.uiIcon);
}
