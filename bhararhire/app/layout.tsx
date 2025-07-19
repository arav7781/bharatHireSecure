import "@livekit/components-styles";
import { Metadata } from "next";
import { Public_Sans } from "next/font/google";
import "./globals.css";
import React from "react";

const publicSans400 = Public_Sans({
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BharatHire-AI Interview Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full ${publicSans400.className}`}>
      <body className="h-full">{children}</body>
    </html>
  );
}
