export const colors = {
  paper: "#f8f7f3",
  ink: "#242521",
  muted: "#75756d",
  orange: "#e65c32",
  line: "#e4e3dc",
  surface: "#ffffff",
  well: "#f4f5f0",
} as const;

export const darkColors = {
  paper: "#14130f",
  ink: "#f2efe6",
  muted: "#a39e90",
  orange: "#e65c32",
  line: "#2e2b24",
  surface: "#1c1b16",
  well: "#221f19",
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

export const tokens = { colors, darkColors, radius, fonts } as const;
export type Tokens = typeof tokens;
export type ThemeName = "light" | "dark";
