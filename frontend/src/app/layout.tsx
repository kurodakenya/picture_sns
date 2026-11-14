import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AmplifyProvider from "@/components/AmplifyProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "写真SNS",
  description: "承認制の写真共有SNS",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AmplifyProvider>{children}</AmplifyProvider>
      </body>
    </html>
  );
}
