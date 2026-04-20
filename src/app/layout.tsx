import { Analytics } from "@vercel/analytics/react";
import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Navigation } from "@/components/Navigation";
import "./globals.css";

export const metadata: Metadata = {
  title: "Apollo Meta - Brawl Stars Intelligence Platform",
  description:
    "Competitive Brawl Stars analytics: map meta, counter system, draft simulator, and player lookup.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased min-h-screen`}
      >
        <Navigation />
        <main className="max-w-5xl mx-auto px-4 pb-16">{children}

	</main>
	<Analytics />
      </body>
    </html>
  );
}
