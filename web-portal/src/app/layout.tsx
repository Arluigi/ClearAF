import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";

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
    <html lang="en">
      <body
        className="antialiased min-h-screen bg-background text-foreground"
      >
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
