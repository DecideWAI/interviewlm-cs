import type { Metadata } from "next";
import { Toaster } from "sonner";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "InterviewLM - AI-Powered Interview & Talent Hiring Platform",
  description: "InterviewLM uses AI to recreate work-like interviews and measure skill levels accurately. Modern talent hiring platform coming soon.",
  keywords: ["AI interviews", "talent hiring", "skill assessment", "recruitment", "InterviewLM"],
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Providers>
          {children}
          <Toaster
            theme="dark"
            position="top-right"
            toastOptions={{
              style: {
                background: '#0A0A0A',
                border: '1px solid #1A1A1A',
                color: '#FFFFFF',
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
