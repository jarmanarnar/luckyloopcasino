const SVG_NS = 'http://www.w3.org/2000/svg';

function shape(tag, attributes) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

export function createShelfIcon(id) {
  const svg = shape('svg', {
    class: 'game-shelf__icon', 'aria-hidden': 'true', focusable: 'false',
    viewBox: '0 0 24 24', width: '24', height: '24', fill: 'none',
    stroke: 'currentColor', 'stroke-width': '1.7',
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  });
  const path = (d, attributes = {}) => shape('path', { d, ...attributes });
  switch (id) {
    case 'all':
      svg.append(path('m3 11 9-8 9 8M5 9v11h5v-6h4v6h5V9'));
      break;
    case 'slots':
      for (const x of [3, 9, 15]) svg.append(shape('rect', { x, y: '5', width: '6', height: '14', rx: '1.5' }));
      svg.append(path('M3 12h18'));
      break;
    case 'tap':
      svg.append(path('M10 11V5a2 2 0 0 1 4 0v7l2-3a2 2 0 0 1 3 2l-2 7c-.5 2-2 3-4 3h-2c-2 0-3-1-4-3l-3-5a2 2 0 0 1 3-2l3 3M4 4l2 2m13-2-2 2'));
      break;
    case 'table':
      svg.append(path('M12 3c-2 4-8 7-8 11a4 4 0 0 0 7 2l-2 5h6l-2-5a4 4 0 0 0 7-2c0-4-6-7-8-11Z', { fill: 'currentColor', stroke: 'none' }));
      break;
    case 'video-poker':
      svg.append(shape('rect', { x: '6', y: '3', width: '13', height: '17', rx: '2' }),
        path('M3 7v13a2 2 0 0 0 2 2h10m-3-15 4 5-4 5-4-5Z'));
      break;
    case 'picks':
      svg.append(path('m12 2.8 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3L2.9 9.4l6.3-.9Z',
        { fill: 'currentColor', stroke: 'none' }));
      break;
    case 'spooky':
      svg.append(
        path('M12 6V3m0 0c1.5.2 2.5-.4 3-1'),
        path('M12 7C9 4.2 4.4 6.3 3.5 10c-1.3 5.1 2 10 6.4 9.1.9.8 3.3.8 4.2 0 4.4.9 7.7-4 6.4-9.1C19.6 6.3 15 4.2 12 7Z'),
        path('m7 11 3 1H7Zm10 0-3 1h3Z', { fill: 'currentColor', 'stroke-width': '1' }),
        path('m7 15 2 1 1-1 2 2 2-2 1 1 2-1'),
      );
      break;
    case 'megaways':
      svg.append(path('m13.5 2-9 12h6l-1 8 10-13h-6Z', { fill: 'currentColor', stroke: 'none' }));
      break;
    case 'jackpot':
      svg.append(path('M8 3h8v6a4 4 0 0 1-8 0Zm0 2H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4m-4 1v6m-4 2h8m-7-2h6'));
      break;
    case 'fruit':
      svg.append(
        path('M7 13c0-4 4-8 9-10m0 0c1 4 2 7 2 9'),
        path('M16 3c-4-1.3-7 .2-8 3 3.7 1 6.4-.3 8-3Z', { fill: 'currentColor', 'fill-opacity': '.2' }),
        shape('circle', { cx: '7', cy: '17', r: '4', fill: 'currentColor', 'fill-opacity': '.16' }),
        shape('circle', { cx: '17', cy: '16', r: '4', fill: 'currentColor', 'fill-opacity': '.16' }),
      );
      break;
    case 'adventure':
      svg.append(
        shape('circle', { cx: '12', cy: '12', r: '9' }),
        path('m16 8-2.5 5.5L8 16l2.5-5.5Z', { fill: 'currentColor', 'fill-opacity': '.25' }),
        path('m10.5 10.5 3 3'),
      );
      break;
    default:
      for (const [x, y] of [[3, 3], [14, 3], [3, 14], [14, 14]]) {
        svg.append(shape('rect', { x, y, width: '7', height: '7', rx: '1.5' }));
      }
  }
  return svg;
}
