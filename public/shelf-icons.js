const SVG_NS = 'http://www.w3.org/2000/svg';

function shape(tag, attributes) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

export function createShelfIcon(id) {
  const svg = shape('svg', {
    class: 'game-shelf__icon', 'aria-hidden': 'true', focusable: 'false',
    viewBox: '0 0 24 24', width: '24', height: '24', fill: 'currentColor',
  });
  const path = d => shape('path', { d, 'fill-rule': 'evenodd', 'clip-rule': 'evenodd' });
  switch (id) {
    case 'all':
      svg.append(path('M12 2.5 2 10.8V13h2v6.8c0 .7.5 1.2 1.2 1.2H9v-6h6v6h3.8c.7 0 1.2-.5 1.2-1.2V13h2v-2.2L12 2.5Z'));
      break;
    case 'slots':
      svg.append(path('M4 3h16v3.6L10.1 21H4.7l9.7-13.8H8.2v2.3H4V3Z'));
      break;
    case 'tap':
      svg.append(path('M10 2a1.8 1.8 0 0 1 1.8 1.8v6.9l.5-.5a1.7 1.7 0 0 1 2.7.6 1.7 1.7 0 0 1 2.9.9 1.6 1.6 0 0 1 2.3 1.8l-1 4.1c-.7 2.6-2.2 4.4-5 4.4h-2.6c-1.8 0-3.1-.8-4.2-2.5l-3.8-6a1.8 1.8 0 0 1 2.8-2.2l1.8 1.9V3.8A1.8 1.8 0 0 1 10 2Z'));
      svg.append(path('M3.1 3.3 6 5.8 4.8 7.2 1.9 4.7l1.2-1.4ZM17.7 3.3l1.2 1.4L16 7.2l-1.2-1.4 2.9-2.5Z'));
      break;
    case 'popular':
      svg.append(path('M13.5 2c.9 1.5 1.6 3.6 1 6.5.9-.5 2-1.5 2.5-3.5.4 2.8 4 5.2 4 10 0 4.7-3.8 8-9 8-5.5 0-9-2.6-9-7 0-2.9 2.7-6.2 6-9-.2 1.9.1 3 1 4 2.4-2.5 4.2-4.5 3.5-9Zm-1.1 11c.6 2.1-1.4 3.2-1.9 4.4-.3.6-.1 2.6 1.7 2.6 1.9 0 2.8-1.3 2.6-2.7-.2-1.7-1.8-2.8-2.4-4.3Z'));
      break;
    case 'picks':
      svg.append(path('m12 2.5 3 6 6.6 1-4.8 4.7 1.1 6.6-5.9-3.1-5.9 3.1 1.1-6.6L2.4 9.5l6.6-1 3-6Z'));
      break;
    case 'spooky':
      svg.append(path('M11 6V2.4c1.8.6 3.2.2 4.2-.9l1.1 1.4c-1 1.1-2 1.6-3.3 1.7V6h-2Z'));
      svg.append(path('M12 7C8.7 4.1 3.7 6.3 2.7 10.4c-1.4 5.7 2.3 11.1 7.1 10.1 1.1.8 3.3.8 4.4 0 4.8 1 8.5-4.4 7.1-10.1C20.3 6.3 15.3 4.1 12 7ZM6 10l4 2H6v-2Zm12 0v2h-4l4-2ZM6.5 14.5l2.5.8 1-.8 2 1.5 2-1.5 1 .8 2.5-.8L16 18H8l-1.5-3.5Z'));
      break;
    case 'megaways':
      svg.append(path('M13.5 2 4 14h6l-1 8L20 9h-6.3l-.2-7Z'));
      break;
    case 'jackpot':
      svg.append(path('M7 2h10v3h4v3c0 3-1.8 5-4.8 5.5-.7 1.3-1.8 2.2-3.2 2.5v3h4v3H7v-3h4v-3c-1.4-.3-2.5-1.2-3.2-2.5C4.8 13 3 11 3 8V5h4V2ZM5 7v1c0 1.7.8 2.8 2.1 3.3L7 7H5Zm12 0-.1 4.3C18.2 10.8 19 9.7 19 8V7h-2Z'));
      break;
    case 'fruit':
      svg.append(
        path('M15.2 3.1c-4.9 1.9-8 5.6-8.5 10.2l1.8.2c.4-3.6 2.7-6.6 6.1-8.3.2 2.8 1 5.8 2.2 8l1.6-.8c-1.3-2.5-2-5.5-1.9-8.6l-1.3-.7Z'),
        path('M15.5 3.1C11.5.7 8 2 6.5 5.8c4.4.9 7.5-.1 9-2.7Z'),
        shape('circle', { cx: '7', cy: '17', r: '4.5' }),
        shape('circle', { cx: '17', cy: '16', r: '4.5' }),
      );
      break;
    case 'adventure':
      svg.append(path('M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm5 5-7 3-3 7 7-3 3-7Z'));
      svg.append(path('m17 7-7 3 4 4 3-7Z'));
      break;
    case 'providers':
    default:
      for (const [x, y] of [[3, 3], [14, 3], [3, 14], [14, 14]]) {
        svg.append(shape('rect', { x, y, width: '7', height: '7', rx: '1.5' }));
      }
  }
  return svg;
}
