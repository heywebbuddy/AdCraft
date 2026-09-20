import type { Metadata } from "next";
import { DM_Sans, Instrument_Serif } from "next/font/google";
import { THEME_BOOT } from "@/lib/theme";
import { SkewGuard } from "@/components/skew-guard";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const viewport = {
  themeColor: "#f8f7f3",
};

export const metadata: Metadata = {
  title: "Adcraft",
  description: "AI ad creation for growth teams.",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }, { url: "/favicon-32.png", type: "image/png", sizes: "32x32" }],
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${instrumentSerif.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <SkewGuard />
        {children}
      </body>
    </html>
  );
}
