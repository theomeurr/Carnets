/** Jeu d'icônes maison : des traits de 1,6px, dessinés sur une grille de 24. */
type IconProps = { className?: string }

const base = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export const IconPlus = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const IconSearch = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-3.6-3.6" />
  </svg>
)

export const IconMore = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <circle cx="5" cy="12" r="1.2" fill="currentColor" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    <circle cx="19" cy="12" r="1.2" fill="currentColor" />
  </svg>
)

export const IconPencil = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" />
  </svg>
)

export const IconTrash = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M4 7h16M10 7V5h4v2M6 7l1 13h10l1-13M10 11v5M14 11v5" />
  </svg>
)

export const IconPalette = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.9 1.8-1.8 0-1.5 1-2.2 2.4-2.2H18a3 3 0 0 0 3-3c0-5-4-11-9-11Z" />
    <circle cx="8" cy="10" r="1" fill="currentColor" />
    <circle cx="12" cy="7.5" r="1" fill="currentColor" />
    <circle cx="16" cy="10" r="1" fill="currentColor" />
  </svg>
)

export const IconChevron = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="m9 6 6 6-6 6" />
  </svg>
)

export const IconClose = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
)

export const IconCheck = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </svg>
)

export const IconCloud = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M7 18h10a3.5 3.5 0 0 0 .4-7A5.5 5.5 0 0 0 6.6 9.6 3.7 3.7 0 0 0 7 18Z" />
  </svg>
)

export const IconLock = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <rect x="5" y="10.5" width="14" height="10" rx="2" />
    <path d="M8.2 10.5V7.8a3.8 3.8 0 0 1 7.6 0v2.7" />
    <circle cx="12" cy="15.5" r="1.1" fill="currentColor" stroke="none" />
  </svg>
)

export const IconUnlock = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <rect x="5" y="10.5" width="14" height="10" rx="2" />
    <path d="M8.2 10.5V7.8a3.8 3.8 0 0 1 7.2-1.7" />
    <circle cx="12" cy="15.5" r="1.1" fill="currentColor" stroke="none" />
  </svg>
)

export const IconAlert = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M12 4.5 2.8 20h18.4zM12 10v4.5" />
    <circle cx="12" cy="17.4" r="1" fill="currentColor" stroke="none" />
  </svg>
)

export const IconNotebook = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M7 4h11a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
    <path d="M5 9H3M5 13H3M9 4v16" />
  </svg>
)

export const IconPage = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M6 3h7l5 5v13H6z" />
    <path d="M13 3v5h5M9 13h6M9 17h4" />
  </svg>
)

export const IconPrinter = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2M7 14h10v6H7z" />
  </svg>
)

export const IconArrow = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M4 12h15M13 6l6 6-6 6" />
  </svg>
)
