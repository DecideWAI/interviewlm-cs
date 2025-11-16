"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, UserPlus, X } from "lucide-react";
import { toast } from "sonner";

interface TeamInviteDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function TeamInviteDialog({ open, onClose, onSuccess }: TeamInviteDialogProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("MEMBER");
  const [loading, setLoading] = useState(false);

  const handleInvite = async () => {
    if (!email.trim()) {
      toast.error("Email is required");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(`Invitation sent to ${email}`);
        setEmail("");
        setRole("MEMBER");
        onClose();
        if (onSuccess) onSuccess();
      } else {
        toast.error(data.error || "Failed to send invitation");
      }
    } catch (error) {
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <div className="bg-background-secondary border border-border rounded-lg p-6 w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <UserPlus className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                Invite Team Member
              </h2>
              <p className="text-sm text-text-secondary">
                Send an invitation to join your organization
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-lg hover:bg-background-tertiary flex items-center justify-center transition"
          >
            <X className="h-4 w-4 text-text-tertiary" />
          </button>
        </div>

        {/* Form */}
        <div className="space-y-4">
          <div>
            <Label htmlFor="invite-email">Email Address</Label>
            <div className="relative mt-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
              <Input
                id="invite-email"
                type="email"
                placeholder="colleague@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10"
                autoFocus
              />
            </div>
          </div>

          <div>
            <Label htmlFor="invite-role">Role</Label>
            <Select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="mt-1"
            >
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
              <option value="OWNER">Owner</option>
            </Select>
            <p className="text-xs text-text-tertiary mt-1">
              {role === "OWNER" && "Full access to all features and settings"}
              {role === "ADMIN" && "Can manage team and settings, but not billing"}
              {role === "MEMBER" && "Can create assessments and view candidates"}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={loading}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleInvite}
            disabled={loading || !email.trim()}
            className="flex-1"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Mail className="h-4 w-4 mr-2" />
                Send Invitation
              </>
            )}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
