import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "V-TAPP Dashboard",
  description:
    "Registration, inventory and merchandise distribution dashboard for V-TAPP.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
