"use client";

import { TechViolation } from "@/types/assessment";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, XCircle, AlertCircle } from "lucide-react";

interface TechViolationModalProps {
  violation: TechViolation | null;
  isOpen: boolean;
  onClose: () => void;
  onCreateCorrectFile?: (tech: string) => void;
  onExitAssessment?: () => void;
}

export function TechViolationModal({
  violation,
  isOpen,
  onClose,
  onCreateCorrectFile,
  onExitAssessment,
}: TechViolationModalProps) {
  if (!violation) return null;

  const isRequired = violation.priority === "required";
  const isBlocking = violation.blocking;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        // Only allow closing if not blocking
        if (!isBlocking && !open) {
          onClose();
        }
      }}
    >
      <DialogContent
        className="max-w-2xl"
        showClose={!isBlocking}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {isRequired ? (
              <>
                <AlertTriangle className="h-6 w-6 text-warning" />
                <span className="text-warning">Required Technology Issue</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-6 w-6 text-info" />
                <span className="text-info">Optional Technology Missing</span>
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Violation Message */}
          <div className="p-4 bg-background-secondary border border-border-secondary rounded-lg">
            <p className="text-text-primary">{violation.message}</p>

            {violation.detectedAlternative && (
              <p className="text-sm text-text-secondary mt-2">
                We detected <strong>{violation.detectedAlternative.name}</strong> code instead.
              </p>
            )}
          </div>

          {/* Priority Badge */}
          <div className="flex items-center gap-2">
            <span className="text-2xl">
              {isRequired ? "🔴" : "🟢"}
            </span>
            <div>
              <p className="text-sm font-medium text-text-primary">
                {isRequired
                  ? "REQUIRED technologies must be present in your solution."
                  : "OPTIONAL technologies are nice-to-have but not required."}
              </p>
              <p className="text-xs text-text-tertiary mt-1">
                {isRequired
                  ? "Your score will be affected if required technologies are missing."
                  : "Consider using this technology for bonus points."}
              </p>
            </div>
          </div>

          {/* Suggestions */}
          {violation.suggestions && violation.suggestions.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-text-primary">Suggestions:</p>
              <ul className="space-y-1 list-disc list-inside text-sm text-text-secondary">
                {violation.suggestions.map((suggestion, index) => (
                  <li key={index}>{suggestion}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            {isRequired ? (
              // Required violation - should fix
              <Button variant="outline" onClick={onClose}>
                I'll Fix This
              </Button>
            ) : (
              // Optional violation - can dismiss
              <>
                <Button variant="ghost" onClick={onClose}>
                  Skip for Now
                </Button>
                {onCreateCorrectFile && (
                  <Button
                    variant="primary"
                    onClick={() => {
                      onCreateCorrectFile(violation.tech.name);
                      onClose();
                    }}
                  >
                    Add {violation.tech.name}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
