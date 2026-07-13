import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Emma · 毒舌英语搭子",
  description: "和 Emma 练口语：毒舌纠错、暧昧 banter、话题够猛",
  applicationName: "Emma AI 英语老师",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Emma英语",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f766e",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full font-sans text-zinc-900">{children}</body>
    </html>
  );
}
