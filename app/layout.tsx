import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kayak Polo Bellingham",
  description: "Game signup and attendance tracker",
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
