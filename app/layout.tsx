import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "InterviewLM - AI-Powered Interview & Talent Hiring Platform",
  description: "InterviewLM uses AI to recreate work-like interviews and measure skill levels accurately. Modern talent hiring platform coming soon.",
  keywords: ["AI interviews", "talent hiring", "skill assessment", "recruitment", "InterviewLM"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
