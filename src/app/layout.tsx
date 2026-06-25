import type { Metadata } from "next";
import { Encode_Sans } from "next/font/google";
import "./globals.css";

const encodeSans = Encode_Sans({
  variable: "--font-encode-sans",
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "600"],
});

export const metadata: Metadata = {
  title: "Avatar Studio — HYPERVSN",
  description: "Image & video generation for HYPERVSN Avatars",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${encodeSans.variable} h-full`}>
      <body className="h-full font-[family-name:var(--font-encode-sans)]">
        {children}
      </body>
    </html>
  );
}
