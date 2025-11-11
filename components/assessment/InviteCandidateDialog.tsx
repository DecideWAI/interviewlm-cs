"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Mail, Plus, X, Loader2, CheckCircle2 } from "lucide-react";

interface InviteCandidateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assessmentId: string;
  assessmentTitle: string;
  onSuccess?: () => void;
}

interface CandidateForm {
  name: string;
  email: string;
  phone?: string;
}

export function InviteCandidateDialog({
  open,
  onOpenChange,
  assessmentId,
  assessmentTitle,
  onSuccess,
}: InviteCandidateDialogProps) {
  const [candidates, setCandidates] = useState<CandidateForm[]>([
    { name: "", email: "", phone: "" },
  ]);
  const [message, setMessage] = useState("");
  const [deadline, setDeadline] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const addCandidate = () => {
    setCandidates([...candidates, { name: "", email: "", phone: "" }]);
  };

  const removeCandidate = (index: number) => {
    if (candidates.length > 1) {
      setCandidates(candidates.filter((_, i) => i !== index));
    }
  };

  const updateCandidate = (index: number, field: keyof CandidateForm, value: string) => {
    const updated = [...candidates];
    updated[index][field] = value;
    setCandidates(updated);
  };

  const validateForm = (): string | null => {
    for (const candidate of candidates) {
      if (!candidate.name.trim()) {
        return "All candidates must have a name";
      }
      if (!candidate.email.trim()) {
        return "All candidates must have an email";
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate.email)) {
        return `Invalid email: ${candidate.email}`;
      }
    }
    return null;
  };

  const handleSubmit = async () => {
    const validationError = validateForm();
    if (validationError) {
      setResult({ success: false, message: validationError });
      return;
    }

    setSending(true);
    setResult(null);

    try {
      const isBulk = candidates.length > 1;
      const body = isBulk
        ? {
            candidates: candidates.map((c) => ({
              name: c.name.trim(),
              email: c.email.trim(),
              phone: c.phone?.trim() || undefined,
            })),
            message: message.trim() || undefined,
            deadline: deadline || undefined,
          }
        : {
            name: candidates[0].name.trim(),
            email: candidates[0].email.trim(),
            phone: candidates[0].phone?.trim() || undefined,
            message: message.trim() || undefined,
            deadline: deadline || undefined,
          };

      const response = await fetch(`/api/assessments/${assessmentId}/candidates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to send invitations");
      }

      const successCount = data.summary?.successful || data.invited?.length || 1;
      const failedCount = data.summary?.failed || 0;

      setResult({
        success: true,
        message:
          failedCount > 0
            ? `Sent ${successCount} invitation(s). ${failedCount} failed.`
            : `Successfully sent ${successCount} invitation(s)!`,
      });

      // Reset form after success
      setTimeout(() => {
        setCandidates([{ name: "", email: "", phone: "" }]);
        setMessage("");
        setDeadline("");
        setResult(null);
        onSuccess?.();
        onOpenChange(false);
      }, 2000);
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : "Failed to send invitations",
      });
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    if (!sending) {
      setCandidates([{ name: "", email: "", phone: "" }]);
      setMessage("");
      setDeadline("");
      setResult(null);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invite Candidates</DialogTitle>
          <DialogDescription>
            Send email invitations to candidates for "{assessmentTitle}"
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Candidates */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Candidates</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={addCandidate}
                disabled={sending}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Another
              </Button>
            </div>

            {candidates.map((candidate, index) => (
              <div
                key={index}
                className="p-4 bg-background-tertiary border border-border rounded-lg space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-text-primary">
                    Candidate {index + 1}
                  </span>
                  {candidates.length > 1 && (
                    <button
                      onClick={() => removeCandidate(index)}
                      disabled={sending}
                      className="text-text-tertiary hover:text-error transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor={`name-${index}`} className="text-xs">
                      Name *
                    </Label>
                    <Input
                      id={`name-${index}`}
                      value={candidate.name}
                      onChange={(e) => updateCandidate(index, "name", e.target.value)}
                      placeholder="John Doe"
                      disabled={sending}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor={`email-${index}`} className="text-xs">
                      Email *
                    </Label>
                    <Input
                      id={`email-${index}`}
                      type="email"
                      value={candidate.email}
                      onChange={(e) => updateCandidate(index, "email", e.target.value)}
                      placeholder="john@example.com"
                      disabled={sending}
                      className="mt-1"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor={`phone-${index}`} className="text-xs">
                    Phone (optional)
                  </Label>
                  <Input
                    id={`phone-${index}`}
                    type="tel"
                    value={candidate.phone}
                    onChange={(e) => updateCandidate(index, "phone", e.target.value)}
                    placeholder="+1 (555) 123-4567"
                    disabled={sending}
                    className="mt-1"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Custom Message */}
          <div>
            <Label htmlFor="message">Custom Message (optional)</Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add a personal message that will be included in the invitation email..."
              rows={3}
              disabled={sending}
              className="mt-1"
            />
            <p className="text-xs text-text-tertiary mt-1">
              This message will be included in the email invitation
            </p>
          </div>

          {/* Deadline */}
          <div>
            <Label htmlFor="deadline">Deadline (optional)</Label>
            <Input
              id="deadline"
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              disabled={sending}
              className="mt-1"
            />
            <p className="text-xs text-text-tertiary mt-1">
              Default: 30 days from now
            </p>
          </div>

          {/* Result Message */}
          {result && (
            <div
              className={`p-4 rounded-lg border ${
                result.success
                  ? "bg-success/10 border-success/20 text-success"
                  : "bg-error/10 border-error/20 text-error"
              }`}
            >
              <div className="flex items-center gap-2">
                {result.success && <CheckCircle2 className="h-5 w-5" />}
                <span className="text-sm font-medium">{result.message}</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={sending}>
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Mail className="h-4 w-4 mr-2" />
                Send {candidates.length > 1 ? `${candidates.length} ` : ""}Invitation
                {candidates.length > 1 ? "s" : ""}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
