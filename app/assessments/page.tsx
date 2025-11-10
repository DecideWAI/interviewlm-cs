"use client";

import Link from "next/link";
import { useState } from "react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Plus,
  Search,
  Filter,
  MoreVertical,
  Eye,
  Edit,
  Copy,
  Trash2,
  Users,
  Clock,
  Calendar,
} from "lucide-react";

export default function AssessmentsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  return (
    <DashboardLayout
      headerTitle="Assessments"
      headerSubtitle="Manage and track all your technical assessments"
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
        {/* Filters */}
        <Card className="border-border-secondary mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                <Input
                  placeholder="Search assessments..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">All Status</option>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </Select>
              <Button variant="outline">
                <Filter className="h-4 w-4 mr-2" />
                More Filters
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">All Assessments</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="draft">Drafts</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            <Card className="border-border-secondary">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Assessment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Candidates</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Completion</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assessments.map((assessment) => (
                    <TableRow key={assessment.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium text-text-primary">{assessment.title}</div>
                          <div className="text-sm text-text-secondary">{assessment.problems.length} problems</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={
                          assessment.status === "active" ? "success" :
                          assessment.status === "draft" ? "default" :
                          assessment.status === "completed" ? "primary" :
                          "default"
                        }>
                          {assessment.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-text-secondary">
                          <Users className="h-4 w-4" />
                          <span>{assessment.candidates.total}</span>
                          <span className="text-text-tertiary">
                            ({assessment.candidates.completed} completed)
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-text-secondary">
                          <Clock className="h-4 w-4" />
                          <span>{assessment.duration} min</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-text-secondary">
                          <Calendar className="h-4 w-4" />
                          <span>{assessment.created}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-24 bg-background-tertiary rounded-full h-2">
                            <div
                              className="bg-primary h-2 rounded-full transition-all"
                              style={{ width: `${assessment.completionRate}%` }}
                            />
                          </div>
                          <span className="text-sm text-text-secondary">{assessment.completionRate}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link href={`/assessments/${assessment.id}`}>
                            <Button variant="ghost" size="icon">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>
                          <Link href={`/assessments/${assessment.id}/edit`}>
                            <Button variant="ghost" size="icon">
                              <Edit className="h-4 w-4" />
                            </Button>
                          </Link>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="active">
            <Card className="border-border-secondary p-12 text-center">
              <div className="text-text-secondary">
                <Users className="h-12 w-12 mx-auto mb-4 text-text-muted" />
                <h3 className="text-lg font-semibold text-text-primary mb-2">Active Assessments</h3>
                <p className="text-sm mb-4">Assessments currently accepting candidates</p>
                <Link href="/assessments/new">
                  <Button variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Assessment
                  </Button>
                </Link>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="draft">
            <Card className="border-border-secondary p-12 text-center">
              <div className="text-text-secondary">
                <Edit className="h-12 w-12 mx-auto mb-4 text-text-muted" />
                <h3 className="text-lg font-semibold text-text-primary mb-2">Draft Assessments</h3>
                <p className="text-sm mb-4">Assessments not yet published</p>
                <Link href="/assessments/new">
                  <Button variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Draft
                  </Button>
                </Link>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="completed">
            <Card className="border-border-secondary p-12 text-center">
              <div className="text-text-secondary">
                <Calendar className="h-12 w-12 mx-auto mb-4 text-text-muted" />
                <h3 className="text-lg font-semibold text-text-primary mb-2">Completed Assessments</h3>
                <p className="text-sm mb-4">All candidates have finished</p>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </Container>
    </DashboardLayout>
  );
}

const assessments = [
  {
    id: "1",
    title: "Frontend Engineer - React",
    status: "active",
    problems: ["Build Todo App", "Fix React Bugs", "Optimize Performance"],
    candidates: { total: 8, completed: 5 },
    duration: 90,
    created: "Jan 15, 2025",
    completionRate: 65,
  },
  {
    id: "2",
    title: "Backend Engineer - Node.js",
    status: "completed",
    problems: ["REST API", "Database Design", "Authentication"],
    candidates: { total: 12, completed: 12 },
    duration: 60,
    created: "Jan 10, 2025",
    completionRate: 100,
  },
  {
    id: "3",
    title: "Full-Stack Developer",
    status: "draft",
    problems: ["E-commerce Cart", "User Dashboard"],
    candidates: { total: 0, completed: 0 },
    duration: 120,
    created: "Jan 18, 2025",
    completionRate: 0,
  },
  {
    id: "4",
    title: "DevOps Engineer",
    status: "active",
    problems: ["CI/CD Pipeline", "Container Orchestration"],
    candidates: { total: 6, completed: 2 },
    duration: 75,
    created: "Jan 12, 2025",
    completionRate: 33,
  },
  {
    id: "5",
    title: "Senior Frontend - Vue.js",
    status: "active",
    problems: ["Component Library", "State Management"],
    candidates: { total: 4, completed: 4 },
    duration: 90,
    created: "Jan 8, 2025",
    completionRate: 100,
  },
];
