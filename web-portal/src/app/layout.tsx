import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";

const newsreader = Newsreader({ subsets: ["latin"], style: ["normal", "italic"], axes: ['opsz'], display: 'swap', variable: "--font-newsreader" });
const plexSans = IBM_Plex_Sans({ subsets: ["latin"], display: 'swap', variable: "--font-plex-sans" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], display: 'swap', variable: "--font-plex-mono" });

export const metadata: Metadata = {
  title: "Clear AF - Dermatologist Portal",
  description: "Professional dermatology platform for patient management and care",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${newsreader.variable} ${plexSans.variable} ${plexMono.variable}`}>
      <body
        className="antialiased min-h-screen bg-canvas text-ink"
      >
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
