"use client";

import Link from "next/link";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar } from "@/components/ui/avatar";
import {
  FileText,
  Users,
  TrendingUp,
  Clock,
  Plus,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Timer,
} from "lucide-react";

export default function DashboardPage() {
  return (
    <DashboardLayout
      headerTitle="Dashboard"
      headerSubtitle="Welcome back, John"
      headerActions={
        <Link href="/assessments/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Assessment
          </Button>
        </Link>
      }
    >
      <Container>
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="border-border-secondary hover:border-primary/40 transition-all cursor-pointer">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-secondary">Total Assessments</p>
                  <p className="text-3xl font-bold text-text-primary mt-1">24</p>
                  <p className="text-xs text-success mt-2 flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    +12% from last month
                  </p>
                </div>
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FileText className="h-6 w-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border-secondary hover:border-primary/40 transition-all cursor-pointer">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-secondary">Candidates Tested</p>
                  <p className="text-3xl font-bold text-text-primary mt-1">142</p>
                  <p className="text-xs text-success mt-2 flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    +24% from last month
                  </p>
                </div>
                <div className="h-12 w-12 rounded-lg bg-success/10 flex items-center justify-center">
                  <Users className="h-6 w-6 text-success" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border-secondary hover:border-primary/40 transition-all cursor-pointer">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-secondary">Avg. Score</p>
                  <p className="text-3xl font-bold text-text-primary mt-1">78%</p>
                  <p className="text-xs text-text-tertiary mt-2 flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    +3% from last month
                  </p>
                </div>
                <div className="h-12 w-12 rounded-lg bg-info/10 flex items-center justify-center">
                  <TrendingUp className="h-6 w-6 text-info" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border-secondary hover:border-primary/40 transition-all cursor-pointer">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-secondary">Avg. Duration</p>
                  <p className="text-3xl font-bold text-text-primary mt-1">42m</p>
                  <p className="text-xs text-text-tertiary mt-2 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Per assessment
                  </p>
                </div>
                <div className="h-12 w-12 rounded-lg bg-warning/10 flex items-center justify-center">
                  <Clock className="h-6 w-6 text-warning" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Assessments */}
          <div className="lg:col-span-2">
            <Card className="border-border-secondary">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Recent Assessments</CardTitle>
                    <CardDescription>Track ongoing and completed assessments</CardDescription>
                  </div>
                  <Link href="/assessments">
                    <Button variant="ghost" size="sm">
                      View all
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentAssessments.map((assessment, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-4 rounded-lg border border-border hover:border-border-hover hover:bg-background-hover transition-all cursor-pointer"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="font-medium text-text-primary">{assessment.title}</h4>
                          <Badge variant={
                            assessment.status === "active" ? "success" :
                            assessment.status === "draft" ? "default" :
                            "primary"
                          }>
                            {assessment.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-text-secondary">
                          <span className="flex items-center gap-1">
                            <Users className="h-4 w-4" />
                            {assessment.candidates} candidates
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {assessment.duration}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-text-secondary mb-1">{assessment.date}</div>
                        <Progress value={assessment.completion} className="w-24" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Activity */}
          <div>
            <Card className="border-border-secondary">
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Latest candidate submissions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentActivity.map((activity, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <Avatar
                        size="sm"
                        fallback={activity.candidate.split(" ").map(n => n[0]).join("")}
                        src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${activity.candidate}`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">
                          {activity.candidate}
                        </p>
                        <p className="text-xs text-text-secondary truncate">
                          {activity.action}
                        </p>
                        <p className="text-xs text-text-tertiary mt-1">{activity.time}</p>
                      </div>
                      <div>
                        {activity.score ? (
                          <div className="flex items-center gap-1">
                            <CheckCircle2 className="h-4 w-4 text-success" />
                            <span className="text-sm font-medium text-success">{activity.score}%</span>
                          </div>
                        ) : activity.status === "in-progress" ? (
                          <Timer className="h-4 w-4 text-warning animate-pulse-subtle" />
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card className="border-border-secondary mt-6">
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Link href="/assessments/new">
                  <Button variant="outline" className="w-full justify-start" size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Assessment
                  </Button>
                </Link>
                <Link href="/candidates/invite">
                  <Button variant="outline" className="w-full justify-start" size="sm">
                    <Users className="h-4 w-4 mr-2" />
                    Invite Candidates
                  </Button>
                </Link>
                <Link href="/problems">
                  <Button variant="outline" className="w-full justify-start" size="sm">
                    <FileText className="h-4 w-4 mr-2" />
                    Browse Problems
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </Container>
    </DashboardLayout>
  );
}

const recentAssessments = [
  {
    title: "Frontend Engineer - React",
    status: "active",
    candidates: 8,
    duration: "90 min",
    date: "2 days ago",
    completion: 65,
  },
  {
    title: "Backend Engineer - Node.js",
    status: "completed",
    candidates: 12,
    duration: "60 min",
    date: "5 days ago",
    completion: 100,
  },
  {
    title: "Full-Stack Developer",
    status: "draft",
    candidates: 0,
    duration: "120 min",
    date: "Just now",
    completion: 0,
  },
];

const recentActivity = [
  {
    candidate: "Sarah Chen",
    action: "Completed Frontend Engineer assessment",
    time: "5 minutes ago",
    score: 92,
  },
  {
    candidate: "Michael Rodriguez",
    action: "Started Backend Engineer assessment",
    time: "23 minutes ago",
    status: "in-progress",
  },
  {
    candidate: "Emily Watson",
    action: "Completed Full-Stack assessment",
    time: "1 hour ago",
    score: 78,
  },
  {
    candidate: "David Kim",
    action: "Submitted Frontend Engineer assessment",
    time: "2 hours ago",
    score: 85,
  },
  {
    candidate: "Jessica Taylor",
    action: "Started DevOps Engineer assessment",
    time: "3 hours ago",
    status: "in-progress",
  },
];
