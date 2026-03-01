import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin Portal - Kayak Polo Bellingham",
  description: "Manage games and player signups",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
