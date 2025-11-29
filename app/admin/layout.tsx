import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin Dashboard | InterviewLM",
  description: "Administrative tools for InterviewLM platform management",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      {/* Admin Navigation Bar */}
      <nav className="bg-background-secondary border-b border-border px-6 py-3">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-6">
            <a href="/admin" className="text-lg font-bold text-text-primary">
              Admin
            </a>
            <div className="flex items-center gap-4">
              <a
                href="/admin/fairness"
                className="text-sm text-text-secondary hover:text-text-primary transition-colors"
              >
                Fairness Dashboard
              </a>
              <a
                href="/admin/review-queue"
                className="text-sm text-text-secondary hover:text-text-primary transition-colors"
              >
                Review Queue
              </a>
            </div>
          </div>
          <a
            href="/dashboard"
            className="text-sm text-text-tertiary hover:text-text-secondary transition-colors"
          >
            Back to Dashboard
          </a>
        </div>
      </nav>
      {children}
    </div>
  );
}
