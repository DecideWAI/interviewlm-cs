"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  Scale,
  BarChart3,
  Users,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";

/**
 * Admin Dashboard Index
 *
 * Provides quick access to admin tools and key metrics overview
 */

export default function AdminDashboard() {
  // Mock stats - would come from API
  const stats = {
    pendingReviews: 5,
    fairnessScore: 92,
    totalEvaluations: 1250,
    biasesThisWeek: 12,
  };

  const adminTools = [
    {
      title: "Fairness Dashboard",
      description: "Monitor bias detection metrics and audit logs",
      href: "/admin/fairness",
      icon: Shield,
      badge: stats.fairnessScore >= 90 ? "Healthy" : "Needs Attention",
      badgeVariant: stats.fairnessScore >= 90 ? "success" : "warning",
      metric: `${stats.fairnessScore}% Fairness`,
    },
    {
      title: "Review Queue",
      description: "Review high-risk cases requiring human verification",
      href: "/admin/review-queue",
      icon: Scale,
      badge: stats.pendingReviews > 0 ? `${stats.pendingReviews} Pending` : "Clear",
      badgeVariant: stats.pendingReviews > 0 ? "warning" : "success",
      metric: `${stats.pendingReviews} cases`,
    },
    {
      title: "Question Pool Stats",
      description: "View question generation and uniqueness metrics",
      href: "/api/stats/question-pool",
      icon: BarChart3,
      badge: "API",
      badgeVariant: "default",
      metric: `${stats.totalEvaluations} questions`,
    },
    {
      title: "Candidate Analytics",
      description: "Aggregate performance insights across candidates",
      href: "/analytics",
      icon: Users,
      badge: "Coming Soon",
      badgeVariant: "default",
      metric: `${stats.totalEvaluations} evaluations`,
    },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-text-primary mb-2">Admin Dashboard</h1>
        <p className="text-text-secondary">
          Platform management and fairness monitoring tools
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card className="border-border-secondary">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-success/10">
              <CheckCircle2 className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold text-text-primary">{stats.fairnessScore}%</p>
              <p className="text-xs text-text-tertiary">Fairness Score</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border-secondary">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-warning/10">
              <AlertTriangle className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold text-text-primary">{stats.pendingReviews}</p>
              <p className="text-xs text-text-tertiary">Pending Reviews</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border-secondary">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-info/10">
              <Users className="h-5 w-5 text-info" />
            </div>
            <div>
              <p className="text-2xl font-bold text-text-primary">{stats.totalEvaluations.toLocaleString()}</p>
              <p className="text-xs text-text-tertiary">Total Evaluations</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border-secondary">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-primary/10">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-text-primary">{stats.biasesThisWeek}</p>
              <p className="text-xs text-text-tertiary">Biases This Week</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Admin Tools Grid */}
      <h2 className="text-lg font-semibold text-text-primary mb-4">Admin Tools</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {adminTools.map((tool) => {
          const Icon = tool.icon;
          return (
            <Link key={tool.href} href={tool.href}>
              <Card className="border-border-secondary hover:border-primary/30 transition-all cursor-pointer group">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="p-3 rounded-xl bg-background-tertiary group-hover:bg-primary/10 transition-colors">
                      <Icon className="h-6 w-6 text-text-secondary group-hover:text-primary transition-colors" />
                    </div>
                    <Badge
                      variant={tool.badgeVariant as "default" | "success" | "warning"}
                      className="text-xs"
                    >
                      {tool.badge}
                    </Badge>
                  </div>
                  <h3 className="text-lg font-semibold text-text-primary mb-1 group-hover:text-primary transition-colors">
                    {tool.title}
                  </h3>
                  <p className="text-sm text-text-tertiary mb-4">{tool.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-secondary">{tool.metric}</span>
                    <ArrowRight className="h-4 w-4 text-text-tertiary group-hover:text-primary group-hover:translate-x-1 transition-all" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
