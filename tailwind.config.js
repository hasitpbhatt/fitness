/**
 * A token colour that supports Tailwind's opacity modifier.
 *
 * The palette is a set of raw CSS variables, so `bg-loss/10` used to be
 * dropped from the build entirely - every tinted error, success and warning
 * surface in the app rendered with no background and no border. Mixing the
 * variable with `color-mix` keeps the runtime theming (and the print
 * stylesheet) working while making the alpha modifier real.
 */
const token = (variable) => ({ opacityValue }) => {
  // Tailwind passes the modifier as a number for most utilities but as the
  // string '1' for text colours, and omits it entirely when there is no
  // modifier. Anything that is not a usable alpha falls back to the plain
  // variable.
  const alpha = typeof opacityValue === 'number' ? opacityValue : Number(opacityValue)
  if (!Number.isFinite(alpha) || alpha >= 1) return `var(${variable})`
  return `color-mix(in srgb, var(${variable}) ${Math.round(alpha * 100)}%, transparent)`
}

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: token('--bg'),
        surface: token('--surface'),
        'surface-2': token('--surface-2'),
        'surface-3': token('--surface-3'),
        line: token('--border'),
        content: token('--text'),
        muted: token('--text-muted'),
        accent: {
          DEFAULT: token('--accent'),
          hover: token('--accent-hover'),
        },
        gain: token('--green'),
        loss: token('--red'),
        warn: token('--amber'),
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        base: ['13px', '1.55'],
      },
    },
  },
  plugins: [],
}
