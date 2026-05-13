import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Claude Poker",
  description: "Claude agents playing Texas Hold'em",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-green-950 text-white min-h-screen">{children}</body>
    </html>
  );
}
