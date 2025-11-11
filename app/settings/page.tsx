"use client";

import { useState } from "react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Settings as SettingsIcon,
  User,
  CreditCard,
  Target,
  Bell,
  Users,
  Zap,
  Shield,
  Palette,
  Save,
  CheckCircle2,
  AlertCircle,
  Crown,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TIER_LIMITS, TIER_INFO } from "@/lib/assessment-config";

type SettingsSection =
  | "account"
  | "billing"
  | "assessment"
  | "scoring"
  | "notifications"
  | "team"
  | "integrations"
  | "security";

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<SettingsSection>("account");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Mock current user tier
  const currentTier = "medium";
  const tierLimits = TIER_LIMITS[currentTier];
  const tierInfo = TIER_INFO[currentTier];

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));

    setIsSaving(false);
    setSaveSuccess(true);

    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const sections = [
    { id: "account" as const, label: "Account", icon: User },
    { id: "billing" as const, label: "Billing & Plan", icon: CreditCard },
    { id: "assessment" as const, label: "Assessment Defaults", icon: Target },
    { id: "scoring" as const, label: "Scoring & Thresholds", icon: Sparkles },
    { id: "notifications" as const, label: "Notifications", icon: Bell },
    { id: "team" as const, label: "Team & Permissions", icon: Users },
    { id: "integrations" as const, label: "Integrations", icon: Zap },
    { id: "security" as const, label: "Security & Privacy", icon: Shield },
  ];

  return (
    <DashboardLayout>
      <div className="p-8">
        <PageHeader
          title="Settings"
          description="Manage your account, billing, and preferences"
        />

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar Navigation */}
          <div className="lg:col-span-1">
            <Card className="bg-background-secondary border-border p-4 sticky top-8">
              <nav className="space-y-1">
                {sections.map((section) => {
                  const Icon = section.icon;
                  const isActive = activeSection === section.id;

                  return (
                    <button
                      key={section.id}
                      onClick={() => setActiveSection(section.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all",
                        isActive
                          ? "bg-primary text-white"
                          : "text-text-secondary hover:bg-background-tertiary hover:text-text-primary"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{section.label}</span>
                    </button>
                  );
                })}
              </nav>
            </Card>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3 space-y-6">
            {activeSection === "account" && <AccountSection />}
            {activeSection === "billing" && <BillingSection currentTier={currentTier} tierLimits={tierLimits} tierInfo={tierInfo} />}
            {activeSection === "assessment" && <AssessmentDefaultsSection />}
            {activeSection === "scoring" && <ScoringSection />}
            {activeSection === "notifications" && <NotificationsSection />}
            {activeSection === "team" && <TeamSection tierLimits={tierLimits} />}
            {activeSection === "integrations" && <IntegrationsSection />}
            {activeSection === "security" && <SecuritySection />}

            {/* Save Bar */}
            <div className="sticky bottom-4 bg-background-secondary border border-border rounded-lg p-4 flex items-center justify-between shadow-lg">
              <div className="flex items-center gap-2">
                {saveSuccess ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-success" />
                    <span className="text-sm text-success font-medium">Settings saved successfully</span>
                  </>
                ) : (
                  <span className="text-sm text-text-tertiary">Changes will be saved to your account</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" disabled={isSaving}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" onClick={handleSave} disabled={isSaving}>
                  <Save className="h-4 w-4 mr-2" />
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

// Account Section
function AccountSection() {
  return (
    <div className="space-y-6">
      <Card className="bg-background-secondary border-border p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Profile Information</h3>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-text-secondary mb-2 block">First Name</label>
              <Input defaultValue="Alex" />
            </div>
            <div>
              <label className="text-sm text-text-secondary mb-2 block">Last Name</label>
              <Input defaultValue="Johnson" />
            </div>
          </div>

          <div>
            <label className="text-sm text-text-secondary mb-2 block">Email</label>
            <Input type="email" defaultValue="alex.johnson@company.com" />
          </div>

          <div>
            <label className="text-sm text-text-secondary mb-2 block">Company Name</label>
            <Input defaultValue="TechCorp Inc" />
          </div>

          <div>
            <label className="text-sm text-text-secondary mb-2 block">Job Title</label>
            <Input defaultValue="Head of Engineering" />
          </div>
        </div>
      </Card>

      <Card className="bg-background-secondary border-border p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Password</h3>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-text-secondary mb-2 block">Current Password</label>
            <Input type="password" placeholder="Enter current password" />
          </div>

          <div>
            <label className="text-sm text-text-secondary mb-2 block">New Password</label>
            <Input type="password" placeholder="Enter new password" />
          </div>

          <div>
            <label className="text-sm text-text-secondary mb-2 block">Confirm New Password</label>
            <Input type="password" placeholder="Confirm new password" />
          </div>

          <Button variant="outline" size="sm">
            Update Password
          </Button>
        </div>
      </Card>
    </div>
  );
}

// Billing Section
function BillingSection({ currentTier, tierLimits, tierInfo }: any) {
  return (
    <div className="space-y-6">
      <Card className="bg-background-secondary border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-text-primary">Current Plan</h3>
          <Badge variant="primary" className="gap-1">
            <Crown className="h-3 w-3" />
            {tierInfo.name}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-background-tertiary rounded-lg p-4">
            <p className="text-sm text-text-tertiary mb-1">Price per Assessment</p>
            <p className="text-2xl font-bold text-text-primary">${tierInfo.price}</p>
          </div>
          <div className="bg-background-tertiary rounded-lg p-4">
            <p className="text-sm text-text-tertiary mb-1">Credits Remaining</p>
            <p className="text-2xl font-bold text-text-primary">142</p>
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-text-secondary">Custom Questions</span>
            <span className="text-text-primary font-medium">
              {typeof tierLimits.maxCustomQuestions === "number"
                ? tierLimits.maxCustomQuestions
                : "Unlimited"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-text-secondary">Team Members</span>
            <span className="text-text-primary font-medium">
              {typeof tierLimits.maxTeamMembers === "number"
                ? tierLimits.maxTeamMembers
                : "Unlimited"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-text-secondary">Preview Test Runs</span>
            <span className="text-text-primary font-medium">
              {typeof tierLimits.previewTestRuns === "number"
                ? `${tierLimits.previewTestRuns}/month`
                : "Unlimited"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-text-secondary">Advanced Analytics</span>
            <span className="text-text-primary font-medium">
              {tierLimits.advancedAnalytics ? "Enabled" : "Disabled"}
            </span>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-border">
          <Button variant="primary" size="sm">
            Upgrade Plan
          </Button>
        </div>
      </Card>

      <Card className="bg-background-secondary border-border p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Payment Method</h3>

        <div className="flex items-center gap-3 p-3 bg-background-tertiary rounded-lg mb-4">
          <CreditCard className="h-5 w-5 text-text-tertiary" />
          <div className="flex-1">
            <p className="text-sm font-medium text-text-primary">•••• •••• •••• 4242</p>
            <p className="text-xs text-text-tertiary">Expires 12/2025</p>
          </div>
          <Button variant="ghost" size="sm">Edit</Button>
        </div>

        <Button variant="outline" size="sm">
          Add Payment Method
        </Button>
      </Card>

      <Card className="bg-background-secondary border-border p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Usage This Month</h3>

        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-text-secondary">Assessments Used</span>
              <span className="text-text-primary font-medium">45 / 50</span>
            </div>
            <div className="h-2 bg-background-tertiary rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: "90%" }} />
            </div>
          </div>

          <div className="pt-3 border-t border-border">
            <p className="text-sm text-text-tertiary">Next billing date: February 1, 2025</p>
            <p className="text-sm text-text-tertiary">Estimated charge: $750</p>
          </div>
        </div>
      </Card>
    </div>
  );
}

// Assessment Defaults Section
function AssessmentDefaultsSection() {
  return (
    <div className="space-y-6">
      <Card className="bg-background-secondary border-border p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Default Assessment Settings</h3>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-text-secondary mb-2 block">
                Default Duration (Junior)
              </label>
              <Input type="number" defaultValue="40" />
              <p className="text-xs text-text-muted mt-1">minutes</p>
            </div>
            <div>
              <label className="text-sm text-text-secondary mb-2 block">
                Default Duration (Mid)
              </label>
              <Input type="number" defaultValue="60" />
              <p className="text-xs text-text-muted mt-1">minutes</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-text-secondary mb-2 block">
                Default Duration (Senior)
              </label>
              <Input type="number" defaultValue="75" />
              <p className="text-xs text-text-muted mt-1">minutes</p>
            </div>
            <div>
              <label className="text-sm text-text-secondary mb-2 block">
                Default Duration (Staff+)
              </label>
              <Input type="number" defaultValue="90" />
              <p className="text-xs text-text-muted mt-1">minutes</p>
            </div>
          </div>

          <div className="pt-4 border-t border-border">
            <label className="flex items-center gap-2">
              <input type="checkbox" defaultChecked className="rounded" />
              <span className="text-sm text-text-primary">Enable AI assistance by default</span>
            </label>
            <p className="text-xs text-text-muted ml-6">Candidates can use Claude Code during assessments</p>
          </div>

          <div>
            <label className="flex items-center gap-2">
              <input type="checkbox" defaultChecked className="rounded" />
              <span className="text-sm text-text-primary">Enable AI monitoring by default</span>
            </label>
            <p className="text-xs text-text-muted ml-6">Track AI usage patterns and collaboration quality</p>
          </div>

          <div>
            <label className="flex items-center gap-2">
              <input type="checkbox" defaultChecked className="rounded" />
              <span className="text-sm text-text-primary">Auto-save assessment drafts</span>
            </label>
            <p className="text-xs text-text-muted ml-6">Automatically save assessment progress every 30 seconds</p>
          </div>
        </div>
      </Card>

      <Card className="bg-background-secondary border-border p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Invitation Settings</h3>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-text-secondary mb-2 block">
              Default Invitation Expiry
            </label>
            <Select defaultValue="7">
              <option value="3">3 days</option>
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
            </Select>
          </div>

          <div>
            <label className="text-sm text-text-secondary mb-2 block">
              Reminder Email Schedule
            </label>
            <Select defaultValue="24">
              <option value="24">24 hours before expiry</option>
              <option value="48">48 hours before expiry</option>
              <option value="72">72 hours before expiry</option>
              <option value="none">No reminders</option>
            </Select>
          </div>

          <div>
            <label className="text-sm text-text-secondary mb-2 block">
              Custom Invitation Message (Optional)
            </label>
            <Textarea
              rows={3}
              placeholder="Add a personal message to assessment invitations..."
              defaultValue="We're excited to have you complete this technical assessment. Take your time and feel free to use any resources available to you, including AI coding assistants."
            />
          </div>
        </div>
      </Card>
    </div>
  );
}

// Scoring Section
function ScoringSection() {
  return (
    <div className="space-y-6">
      <Card className="bg-background-secondary border-border p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Score Component Weights</h3>
        <p className="text-sm text-text-tertiary mb-4">
          Adjust how different factors contribute to the overall candidate score
        </p>

        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-text-secondary">Technical Score</label>
              <span className="text-sm font-medium text-text-primary">40%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              defaultValue="40"
              className="w-full"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-text-secondary">AI Collaboration</label>
              <span className="text-sm font-medium text-text-primary">20%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              defaultValue="20"
              className="w-full"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-text-secondary">Code Quality</label>
              <span className="text-sm font-medium text-text-primary">25%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              defaultValue="25"
              className="w-full"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-text-secondary">Problem Solving</label>
              <span className="text-sm font-medium text-text-primary">15%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              defaultValue="15"
              className="w-full"
            />
          </div>

          <div className="pt-3 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-text-primary">Total</span>
              <span className="text-lg font-bold text-primary">100%</span>
            </div>
          </div>
        </div>
      </Card>

      <Card className="bg-background-secondary border-border p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Pass/Fail Thresholds</h3>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-text-secondary mb-2 block">
              Minimum Passing Score
            </label>
            <Input type="number" defaultValue="70" />
            <p className="text-xs text-text-muted mt-1">Candidates must score at least this to pass (0-100)</p>
          </div>

          <div className="pt-3 border-t border-border grid grid-cols-3 gap-4">
            <div className="bg-success/10 border border-success/30 rounded-lg p-3">
              <p className="text-xs text-success mb-1">Strong Yes</p>
              <p className="text-sm font-medium text-text-primary">85-100</p>
            </div>
            <div className="bg-info/10 border border-info/30 rounded-lg p-3">
              <p className="text-xs text-info mb-1">Yes</p>
              <p className="text-sm font-medium text-text-primary">70-84</p>
            </div>
            <div className="bg-error/10 border border-error/30 rounded-lg p-3">
              <p className="text-xs text-error mb-1">No</p>
              <p className="text-sm font-medium text-text-primary">0-69</p>
            </div>
          </div>
        </div>
      </Card>

      <Card className="bg-background-secondary border-border p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Flag Detection Sensitivity</h3>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-text-secondary mb-2 block">
              Red Flag Sensitivity
            </label>
            <Select defaultValue="medium">
              <option value="low">Low - Only critical issues</option>
              <option value="medium">Medium - Balanced detection</option>
              <option value="high">High - Detect all potential issues</option>
            </Select>
            <p className="text-xs text-text-muted mt-1">
              Higher sensitivity may produce more false positives
            </p>
          </div>

          <div>
            <label className="text-sm text-text-secondary mb-2 block">
              Green Flag Detection
            </label>
            <Select defaultValue="medium">
              <option value="low">Low - Only exceptional performance</option>
              <option value="medium">Medium - Strong performance</option>
              <option value="high">High - Any positive signals</option>
            </Select>
          </div>
        </div>
      </Card>
    </div>
  );
}

// Notifications Section
function NotificationsSection() {
  return (
    <div className="space-y-6">
      <Card className="bg-background-secondary border-border p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Email Notifications</h3>

        <div className="space-y-3">
          <label className="flex items-center justify-between">
            <div>
              <p className="text-sm text-text-primary">Candidate completed assessment</p>
              <p className="text-xs text-text-muted">Instant notification when a candidate finishes</p>
            </div>
            <input type="checkbox" defaultChecked className="rounded" />
          </label>

          <label className="flex items-center justify-between">
            <div>
              <p className="text-sm text-text-primary">Strong candidate detected</p>
              <p className="text-xs text-text-muted">Alert when predicted score is &gt;85</p>
            </div>
            <input type="checkbox" defaultChecked className="rounded" />
          </label>

          <label className="flex items-center justify-between">
            <div>
              <p className="text-sm text-text-primary">Assessment pending review (&gt;48 hours)</p>
              <p className="text-xs text-text-muted">Reminder for unreviewed assessments</p>
            </div>
            <input type="checkbox" defaultChecked className="rounded" />
          </label>

          <label className="flex items-center justify-between">
            <div>
              <p className="text-sm text-text-primary">Credits running low</p>
              <p className="text-xs text-text-muted">Alert when fewer than 10 credits remain</p>
            </div>
            <input type="checkbox" defaultChecked className="rounded" />
          </label>

          <label className="flex items-center justify-between">
            <div>
              <p className="text-sm text-text-primary">Weekly analytics digest</p>
              <p className="text-xs text-text-muted">Summary of key metrics every Monday</p>
            </div>
            <input type="checkbox" defaultChecked className="rounded" />
          </label>
        </div>
      </Card>

      <Card className="bg-background-secondary border-border p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Alert Thresholds</h3>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-text-secondary mb-2 block">
              Completion Rate Alert (below %)
            </label>
            <Input type="number" defaultValue="65" />
            <p className="text-xs text-text-muted mt-1">Alert when completion rate drops below this threshold</p>
          </div>

          <div>
            <label className="text-sm text-text-secondary mb-2 block">
              Pass Rate Alert (below %)
            </label>
            <Input type="number" defaultValue="15" />
            <p className="text-xs text-text-muted mt-1">Alert when pass rate drops below this threshold</p>
          </div>

          <div>
            <label className="text-sm text-text-secondary mb-2 block">
              Time-to-Review Alert (hours)
            </label>
            <Input type="number" defaultValue="48" />
            <p className="text-xs text-text-muted mt-1">Alert when assessments await review longer than this</p>
          </div>
        </div>
      </Card>

      <Card className="bg-background-secondary border-border p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Digest Preferences</h3>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-text-secondary mb-2 block">
              Daily Digest Time
            </label>
            <Select defaultValue="09:00">
              <option value="08:00">8:00 AM</option>
              <option value="09:00">9:00 AM</option>
              <option value="12:00">12:00 PM</option>
              <option value="none">Disabled</option>
            </Select>
          </div>

          <div>
            <label className="text-sm text-text-secondary mb-2 block">
              Weekly Digest Day
            </label>
            <Select defaultValue="monday">
              <option value="monday">Monday</option>
              <option value="friday">Friday</option>
              <option value="none">Disabled</option>
            </Select>
          </div>
        </div>
      </Card>
    </div>
  );
}

// Team Section
function TeamSection({ tierLimits }: any) {
  const mockTeamMembers = [
    { id: "1", name: "Alex Johnson", email: "alex@company.com", role: "Admin", status: "Active" },
    { id: "2", name: "Sarah Chen", email: "sarah@company.com", role: "Hiring Manager", status: "Active" },
    { id: "3", name: "Mike Williams", email: "mike@company.com", role: "HR", status: "Active" },
  ];

  const currentMembers = mockTeamMembers.length;
  const maxMembers = tierLimits.maxTeamMembers;
  const canAddMore = typeof maxMembers === "string" || currentMembers < maxMembers;

  return (
    <div className="space-y-6">
      <Card className="bg-background-secondary border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-text-primary">Team Members</h3>
          <Badge variant="default">
            {currentMembers} / {typeof maxMembers === "number" ? maxMembers : "∞"}
          </Badge>
        </div>

        <div className="space-y-3 mb-4">
          {mockTeamMembers.map((member) => (
            <div key={member.id} className="flex items-center justify-between p-3 bg-background-tertiary rounded-lg">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <span className="text-sm font-medium text-primary">
                    {member.name.split(" ").map(n => n[0]).join("")}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">{member.name}</p>
                  <p className="text-xs text-text-tertiary">{member.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="default" className="text-xs">{member.role}</Badge>
                <Button variant="ghost" size="sm">Edit</Button>
              </div>
            </div>
          ))}
        </div>

        {canAddMore ? (
          <Button variant="outline" size="sm">
            <Users className="h-4 w-4 mr-2" />
            Invite Team Member
          </Button>
        ) : (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-warning font-medium">Team member limit reached</p>
              <p className="text-xs text-text-tertiary mt-1">
                Upgrade to add more team members. Current limit: {maxMembers}
              </p>
            </div>
          </div>
        )}
      </Card>

      <Card className="bg-background-secondary border-border p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Role Permissions</h3>

        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-text-primary mb-2">Admin</p>
            <ul className="text-xs text-text-secondary space-y-1 ml-4">
              <li>• Full access to all settings and billing</li>
              <li>• Create and manage assessments</li>
              <li>• View all candidates and analytics</li>
              <li>• Manage team members</li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-medium text-text-primary mb-2">Hiring Manager</p>
            <ul className="text-xs text-text-secondary space-y-1 ml-4">
              <li>• Create and manage assessments</li>
              <li>• View candidates and analytics</li>
              <li>• Cannot access billing or team settings</li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-medium text-text-primary mb-2">HR</p>
            <ul className="text-xs text-text-secondary space-y-1 ml-4">
              <li>• View all candidates and analytics</li>
              <li>• Send assessment invitations</li>
              <li>• Cannot create or modify assessments</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}

// Integrations Section
function IntegrationsSection() {
  return (
    <div className="space-y-6">
      <Card className="bg-background-secondary border-border p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Available Integrations</h3>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 bg-background-tertiary rounded-lg">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">Slack</p>
                <p className="text-xs text-text-tertiary">Get notifications in Slack</p>
              </div>
            </div>
            <Button variant="outline" size="sm">
              Connect
            </Button>
          </div>

          <div className="flex items-center justify-between p-4 bg-background-tertiary rounded-lg">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-success/20 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">Google Calendar</p>
                <p className="text-xs text-text-tertiary">Sync interview schedules</p>
              </div>
            </div>
            <Badge variant="success">Connected</Badge>
          </div>

          <div className="flex items-center justify-between p-4 bg-background-tertiary rounded-lg">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-info/20 flex items-center justify-center">
                <Users className="h-5 w-5 text-info" />
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">Greenhouse ATS</p>
                <p className="text-xs text-text-tertiary">Sync candidates with Greenhouse</p>
              </div>
            </div>
            <Badge variant="default">Coming Soon</Badge>
          </div>
        </div>
      </Card>

      <Card className="bg-background-secondary border-border p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">API Access</h3>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-text-secondary mb-2 block">API Key</label>
            <div className="flex gap-2">
              <Input
                type="password"
                defaultValue="sk_live_1234567890abcdef"
                readOnly
              />
              <Button variant="outline" size="sm">
                Copy
              </Button>
            </div>
            <p className="text-xs text-text-muted mt-1">Keep your API key secret. Do not share it publicly.</p>
          </div>

          <div>
            <Button variant="outline" size="sm">
              Generate New API Key
            </Button>
          </div>

          <div className="pt-3 border-t border-border">
            <a
              href="#"
              className="text-sm text-primary hover:underline"
            >
              View API Documentation →
            </a>
          </div>
        </div>
      </Card>
    </div>
  );
}

// Security Section
function SecuritySection() {
  return (
    <div className="space-y-6">
      <Card className="bg-background-secondary border-border p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Two-Factor Authentication</h3>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-text-primary mb-1">2FA Status</p>
            <p className="text-xs text-text-tertiary">Add an extra layer of security to your account</p>
          </div>
          <Badge variant="default">Disabled</Badge>
        </div>

        <div className="mt-4">
          <Button variant="primary" size="sm">
            Enable 2FA
          </Button>
        </div>
      </Card>

      <Card className="bg-background-secondary border-border p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Session Recording</h3>

        <div className="space-y-3">
          <label className="flex items-center justify-between">
            <div>
              <p className="text-sm text-text-primary">Record candidate sessions</p>
              <p className="text-xs text-text-muted">Save full session replays for review</p>
            </div>
            <input type="checkbox" defaultChecked className="rounded" />
          </label>

          <label className="flex items-center justify-between">
            <div>
              <p className="text-sm text-text-primary">Track AI interactions</p>
              <p className="text-xs text-text-muted">Record all Claude Code conversations</p>
            </div>
            <input type="checkbox" defaultChecked className="rounded" />
          </label>
        </div>
      </Card>

      <Card className="bg-background-secondary border-border p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Data Retention</h3>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-text-secondary mb-2 block">
              Candidate Data Retention
            </label>
            <Select defaultValue="365">
              <option value="90">90 days</option>
              <option value="180">180 days</option>
              <option value="365">1 year</option>
              <option value="730">2 years</option>
              <option value="indefinite">Indefinitely</option>
            </Select>
            <p className="text-xs text-text-muted mt-1">
              How long to keep candidate data after assessment completion
            </p>
          </div>

          <div>
            <label className="text-sm text-text-secondary mb-2 block">
              Session Recording Retention
            </label>
            <Select defaultValue="90">
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="180">180 days</option>
              <option value="365">1 year</option>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="bg-error/10 border-error/30 p-6">
        <h3 className="text-lg font-semibold text-error mb-4">Danger Zone</h3>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-text-primary mb-1">Delete all candidate data</p>
              <p className="text-xs text-text-tertiary">Permanently remove all assessment results</p>
            </div>
            <Button variant="outline" size="sm">
              Delete Data
            </Button>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-error/20">
            <div>
              <p className="text-sm text-text-primary mb-1">Close account</p>
              <p className="text-xs text-text-tertiary">Permanently delete your account and all data</p>
            </div>
            <Button variant="outline" size="sm" className="border-error text-error hover:bg-error hover:text-white">
              Close Account
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
