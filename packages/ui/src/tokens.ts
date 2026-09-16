export const colors = {
  paper: "#f8f7f3",
  ink: "#242521",
  muted: "#75756d",
  orange: "#e65c32",
  line: "#e4e3dc",
} as const;

export const radius = {
  sm: "6px",
  md: "10px",
  lg: "16px",
  pill: "999px",
} as const;

export const fonts = {
  sans: '"DM Sans", ui-sans-serif, system-ui, sans-serif',
  serif: '"Instrument Serif", Georgia, serif',
} as const;

export const tokens = { colors, radius, fonts } as const;
export type Tokens = typeof tokens;
