"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
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
  Loader2,
  Archive,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface Assessment {
  id: string;
  title: string;
  status: string;
  role: string;
  seniority: string;
  duration: number;
  createdAt: string;
  publishedAt?: string;
  statistics: {
    totalCandidates: number;
    completedCandidates: number;
    avgScore: number | null;
    completionRate: number;
  };
}

export default function AssessmentsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAssessments();
  }, [statusFilter]);

  const fetchAssessments = async () => {
    setLoading(true);
    setError(null);

    try {
      let url = "/api/assessments";
      const params = new URLSearchParams();

      if (statusFilter !== "all") {
        params.append("status", statusFilter.toUpperCase());
      }

      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error("Failed to fetch assessments");
      }

      const data = await response.json();
      // API returns 'stats' but frontend expects 'statistics', so map the data
      const mappedAssessments = (data.assessments || []).map((assessment: any) => ({
        ...assessment,
        statistics: {
          totalCandidates: assessment.stats?.candidateCount || 0,
          completedCandidates: assessment.stats?.completedCount || 0,
          avgScore: assessment.stats?.avgScore || null,
          completionRate: assessment.stats?.completionRate || 0,
        },
      }));
      setAssessments(mappedAssessments);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      console.error("Error fetching assessments:", err);
    } finally {
      setLoading(false);
    }
  };

  const filteredAssessments = assessments.filter((assessment) =>
    assessment.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    assessment.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : error ? (
                <div className="text-center py-12">
                  <p className="text-error mb-4">{error}</p>
                  <Button variant="outline" onClick={fetchAssessments}>
                    Retry
                  </Button>
                </div>
              ) : filteredAssessments.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="h-12 w-12 text-text-muted mx-auto mb-3 opacity-50" />
                  <p className="text-text-secondary mb-1">No assessments found</p>
                  <p className="text-sm text-text-tertiary mb-4">
                    {searchQuery ? "Try adjusting your search" : "Create your first assessment to get started"}
                  </p>
                  {!searchQuery && (
                    <Link href="/assessments/new">
                      <Button variant="primary">
                        <Plus className="h-4 w-4 mr-2" />
                        New Assessment
                      </Button>
                    </Link>
                  )}
                </div>
              ) : (
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
                    {filteredAssessments.map((assessment) => (
                      <TableRow key={assessment.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium text-text-primary">{assessment.title}</div>
                            <div className="text-sm text-text-secondary capitalize">
                              {assessment.role} • {assessment.seniority}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={
                            assessment.status === "PUBLISHED" ? "success" :
                            assessment.status === "DRAFT" ? "default" :
                            assessment.status === "ARCHIVED" ? "default" :
                            "default"
                          }>
                            {assessment.status.toLowerCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-text-secondary">
                            <Users className="h-4 w-4" />
                            <span>{assessment.statistics.totalCandidates}</span>
                            <span className="text-text-tertiary">
                              ({assessment.statistics.completedCandidates} completed)
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
                            <span>{new Date(assessment.createdAt).toLocaleDateString()}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-24 bg-background-tertiary rounded-full h-2">
                              <div
                                className="bg-primary h-2 rounded-full transition-all"
                                style={{ width: `${Math.round(assessment.statistics.completionRate * 100)}%` }}
                              />
                            </div>
                            <span className="text-sm text-text-secondary">
                              {Math.round(assessment.statistics.completionRate * 100)}%
                            </span>
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
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem>
                                  <Copy className="h-4 w-4" />
                                  Duplicate
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                  <Archive className="h-4 w-4" />
                                  Archive
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem destructive>
                                  <Trash2 className="h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
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
