"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table } from "@/components/ui/table";
import { Spinner } from "@/components/ui/spinner";
import {
  CreditCard,
  TrendingDown,
  TrendingUp,
  Calendar,
  DollarSign,
  FileText,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";

interface Transaction {
  id: string;
  type: "PURCHASE" | "DEDUCTION" | "REFUND" | "ADJUSTMENT";
  amount: number;
  balanceAfter: number;
  paddleOrderId?: string | null;
  paddlePaymentId?: string | null;
  amountPaid?: number | null;
  currency?: string | null;
  assessmentId?: string | null;
  candidateId?: string | null;
  description?: string | null;
  createdAt: string;
}

interface TransactionsData {
  transactions: Transaction[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  currentBalance: number;
}

export default function TransactionsPage() {
  const [data, setData] = useState<TransactionsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    try {
      const response = await fetch("/api/billing/transactions");
      if (response.ok) {
        const json = await response.json();
        setData(json);
      } else {
        toast.error("Failed to load transactions");
      }
    } catch (error) {
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case "PURCHASE":
        return <TrendingUp className="h-4 w-4 text-success" />;
      case "DEDUCTION":
        return <TrendingDown className="h-4 w-4 text-error" />;
      case "REFUND":
        return <TrendingUp className="h-4 w-4 text-info" />;
      default:
        return <FileText className="h-4 w-4 text-text-tertiary" />;
    }
  };

  const getTransactionBadgeVariant = (type: string) => {
    switch (type) {
      case "PURCHASE":
        return "success";
      case "DEDUCTION":
        return "error";
      case "REFUND":
        return "info";
      default:
        return "default";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <p className="text-text-secondary">Failed to load transactions</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-8">
          <Link href="/billing/credits" className="inline-flex items-center text-sm text-text-secondary hover:text-text-primary mb-4 transition">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Credits
          </Link>
          <h1 className="text-4xl font-bold text-text-primary mb-2">
            Transaction History
          </h1>
          <p className="text-lg text-text-secondary">
            View your credit purchases and assessment usage
          </p>
        </div>

        {/* Current Balance Card */}
        <Card className="mb-8 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <CardHeader>
            <CardTitle className="text-lg">Current Balance</CardTitle>
            <CardDescription>Available assessment credits</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-bold text-text-primary">
                {data.currentBalance}
              </span>
              <span className="text-text-secondary">
                {data.currentBalance === 1 ? "credit" : "credits"}
              </span>
            </div>
            <div className="mt-4">
              <Link href="/billing/credits">
                <Button variant="primary">
                  <CreditCard className="h-4 w-4 mr-2" />
                  Purchase More Credits
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Transactions Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Transactions</CardTitle>
            <CardDescription>
              Showing {data.transactions.length} of {data.pagination.total} transactions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.transactions.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-text-muted mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-text-primary mb-2">
                  No transactions yet
                </h3>
                <p className="text-text-secondary mb-6">
                  Purchase credits to start conducting interviews
                </p>
                <Link href="/billing/credits">
                  <Button variant="primary">
                    Purchase Credits
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">
                        Type
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">
                        Description
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-text-secondary">
                        Amount
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-text-secondary">
                        Balance After
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-text-secondary">
                        Paid
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.transactions.map((transaction) => (
                      <tr
                        key={transaction.id}
                        className="border-b border-border hover:bg-background-tertiary transition"
                      >
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-2">
                            {getTransactionIcon(transaction.type)}
                            <Badge variant={getTransactionBadgeVariant(transaction.type) as any}>
                              {transaction.type}
                            </Badge>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <p className="text-sm text-text-primary">
                            {transaction.description || "No description"}
                          </p>
                          {transaction.paddleOrderId && (
                            <p className="text-xs text-text-tertiary mt-1">
                              Order: {transaction.paddleOrderId}
                            </p>
                          )}
                        </td>
                        <td className="py-4 px-4 text-right">
                          <span
                            className={`text-sm font-medium ${
                              transaction.amount > 0
                                ? "text-success"
                                : "text-error"
                            }`}
                          >
                            {transaction.amount > 0 ? "+" : ""}
                            {transaction.amount}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-right">
                          <span className="text-sm text-text-primary font-medium">
                            {transaction.balanceAfter}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-right">
                          {transaction.amountPaid ? (
                            <span className="text-sm text-text-secondary">
                              {transaction.currency?.toUpperCase() || "$"}
                              {Number(transaction.amountPaid).toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-sm text-text-tertiary">—</span>
                          )}
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-2 text-sm text-text-secondary">
                            <Calendar className="h-3 w-3" />
                            {formatDate(transaction.createdAt)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {data.pagination.hasMore && (
              <div className="mt-6 text-center">
                <Button variant="outline" onClick={() => toast.info("Pagination coming soon")}>
                  Load More
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Summary Stats */}
        {data.transactions.length > 0 && (
          <div className="grid md:grid-cols-3 gap-6 mt-8">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-text-secondary">
                  Total Purchases
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-text-primary">
                  {data.transactions.filter((t) => t.type === "PURCHASE").length}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-text-secondary">
                  Credits Used
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-text-primary">
                  {Math.abs(
                    data.transactions
                      .filter((t) => t.type === "DEDUCTION")
                      .reduce((sum, t) => sum + t.amount, 0)
                  )}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-text-secondary">
                  Total Spent
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-text-primary">
                  $
                  {data.transactions
                    .filter((t) => t.type === "PURCHASE" && t.amountPaid)
                    .reduce((sum, t) => sum + Number(t.amountPaid || 0), 0)
                    .toFixed(2)}
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
