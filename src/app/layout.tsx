import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Porter Voice Agent | AI Intra-City Moving & Logistics",
  description:
    "Voice-based AI booking agent for Porter intra-city moving and logistics with real-time state extraction, ambiguity resolution, and contradiction handling.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
