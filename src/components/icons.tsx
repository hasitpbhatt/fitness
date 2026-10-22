// A small, hand-rolled icon set. Inline SVG keeps the bundle tiny and means
// the icons inherit `currentColor`, so a single class change re-colours them.
//
// Every path is drawn on a 24x24 grid with a 2px stroke so icons read at the
// same weight as the text around them.

export type IconName =
  | 'home'
  | 'chat'
  | 'plus-circle'
  | 'trophy'
  | 'bar-chart'
  | 'menu'
  | 'close'
  | 'bell'
  | 'camera'
  | 'image'
  | 'user'
  | 'logout'
  | 'chevron-right'
  | 'chevron-down'
  | 'chevron-left'
  | 'check'
  | 'alert'
  | 'info'
  | 'search'
  | 'trash'
  | 'edit'
  | 'sparkles'
  | 'target'
  | 'calendar'
  | 'clock'
  | 'scale'
  | 'utensils'
  | 'flame'
  | 'droplet'
  | 'moon'
  | 'dumbbell'
  | 'book'
  | 'refresh'
  | 'lock'
  | 'help'
  | 'download'
  | 'printer'

const PATHS: Record<IconName, string[]> = {
  home: ['M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z'],
  chat: [
    'M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z',
  ],
  'plus-circle': ['M12 8v8M8 12h8', 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z'],
  trophy: [
    'M6 9H4.5a2.5 2.5 0 0 1 0-5H6',
    'M18 9h1.5a2.5 2.5 0 0 0 0-5H18',
    'M4 22h16',
    'M10 14.7V17c0 .6-.5 1-1 1.2C7.9 18.8 7 20.2 7 22',
    'M14 14.7V17c0 .6.5 1 1 1.2 1.1.6 2 2 2 3.8',
    'M18 2H6v7a6 6 0 0 0 12 0V2z',
  ],
  'bar-chart': ['M12 20V10', 'M18 20V4', 'M6 20v-4'],
  menu: ['M3 12h18', 'M3 6h18', 'M3 18h18'],
  close: ['M18 6 6 18', 'M6 6l12 12'],
  bell: [
    'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9',
    'M13.7 21a2 2 0 0 1-3.4 0',
  ],
  camera: [
    'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z',
    'M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  ],
  image: [
    'M3 3h18v18H3z',
    'M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
    'M21 15l-5-5L5 21',
  ],
  user: [
    'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2',
    'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  ],
  logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  'chevron-right': ['M9 18l6-6-6-6'],
  'chevron-down': ['M6 9l6 6 6-6'],
  'chevron-left': ['M15 18l-6-6 6-6'],
  check: ['M20 6 9 17l-5-5'],
  alert: [
    'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
    'M12 9v4',
    'M12 17h.01',
  ],
  info: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 16v-4', 'M12 8h.01'],
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.4-4.4'],
  trash: ['M3 6h18', 'M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2', 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6'],
  edit: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
  sparkles: [
    'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z',
    'M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z',
  ],
  target: [
    'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
    'M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z',
    'M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  ],
  calendar: ['M3 5h18v16H3z', 'M16 3v4', 'M8 3v4', 'M3 11h18'],
  clock: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 6v6l4 2'],
  scale: ['M12 3v18', 'M7 21h10', 'M5 7h14', 'M5 7l-3 7h6z', 'M19 7l-3 7h6z'],
  utensils: ['M4 3v7a3 3 0 0 0 6 0V3', 'M7 10v11', 'M17 3c-1.5 2-2 4-2 6v3h2v9'],
  flame: [
    'M12 22a7 7 0 0 0 7-7c0-5-4-6-4-11 0 0-3 2-3 6 0 2-1 3-1 3s-1-1-1-3c-2 2-3 4-3 7a7 7 0 0 0 5 5z',
  ],
  droplet: ['M12 2.7 6.3 8.4a8 8 0 1 0 11.4 0z'],
  moon: ['M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'],
  dumbbell: ['M6.5 6.5v11', 'M3.5 9v6', 'M17.5 6.5v11', 'M20.5 9v6', 'M6.5 12h11'],
  book: [
    'M4 19.5A2.5 2.5 0 0 1 6.5 17H20',
    'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z',
  ],
  refresh: ['M23 4v6h-6', 'M1 20v-6h6', 'M3.5 9a9 9 0 0 1 14.9-3.4L23 10', 'M1 14l4.6 4.4A9 9 0 0 0 20.5 15'],
  lock: ['M5 11h14v10H5z', 'M8 11V7a4 4 0 1 1 8 0v4'],
  help: [
    'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
    'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3',
    'M12 17h.01',
  ],
  download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
  printer: [
    'M6 9V2h12v7',
    'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2',
    'M6 14h12v8H6z',
  ],
}

export type IconProps = {
  name: IconName
  className?: string
  size?: number
  strokeWidth?: number
  title?: string
}

export function Icon({ name, className = '', size = 20, strokeWidth = 1.8, title }: IconProps) {
  const paths = PATHS[name]
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {paths.map((d, index) => (
        <path key={index} d={d} />
      ))}
    </svg>
  )
}
