import * as React from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";

export interface DashboardLayoutProps {
  children: React.ReactNode;
  headerTitle?: string;
  headerSubtitle?: string;
  headerActions?: React.ReactNode;
}

export function DashboardLayout({
  children,
  headerTitle,
  headerSubtitle,
  headerActions,
}: DashboardLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          title={headerTitle}
          subtitle={headerSubtitle}
          actions={headerActions}
        />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
