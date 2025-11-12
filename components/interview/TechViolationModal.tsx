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

  const isCritical = violation.priority === "critical";
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
            {isCritical && (
              <>
                <XCircle className="h-6 w-6 text-error" />
                <span className="text-error">CRITICAL: Incorrect Technology Detected</span>
              </>
            )}
            {isRequired && !isCritical && (
              <>
                <AlertTriangle className="h-6 w-6 text-warning" />
                <span className="text-warning">Required Technology Missing</span>
              </>
            )}
            {!isRequired && !isCritical && (
              <>
                <AlertCircle className="h-6 w-6 text-info" />
                <span className="text-info">Recommended Technology Missing</span>
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
              {isCritical && "🔴"}
              {isRequired && !isCritical && "🟠"}
              {!isRequired && !isCritical && "🟡"}
            </span>
            <div>
              <p className="text-sm font-medium text-text-primary">
                {isCritical && "CRITICAL technologies must be used exactly as specified."}
                {isRequired && !isCritical && "REQUIRED technologies must be present in your solution."}
                {!isRequired && !isCritical && "RECOMMENDED technologies are strongly encouraged."}
              </p>
              <p className="text-xs text-text-tertiary mt-1">
                {isCritical && "Using the wrong critical technology will stop your session immediately."}
                {isRequired && !isCritical && "Submission will be blocked if required technologies are missing."}
                {!isRequired && !isCritical && "Your score may be affected if recommended technologies are not used."}
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
          <div className="flex items-center justify-between gap-3 pt-4 border-t border-border">
            {isCritical ? (
              // Critical violation - must fix or exit
              <>
                <div className="text-sm text-text-tertiary">
                  ⏱️ Time is still running. Please decide quickly.
                </div>
                <div className="flex items-center gap-3">
                  {onCreateCorrectFile && (
                    <Button
                      variant="primary"
                      onClick={() => onCreateCorrectFile(violation.tech.name)}
                    >
                      Create {violation.tech.name} File
                    </Button>
                  )}
                  {onExitAssessment && (
                    <Button variant="ghost" onClick={onExitAssessment}>
                      Exit Assessment
                    </Button>
                  )}
                </div>
              </>
            ) : isRequired ? (
              // Required violation - can continue but must fix before submission
              <div className="flex items-center justify-end gap-3 w-full">
                <Button variant="outline" onClick={onClose}>
                  I'll Fix This
                </Button>
              </div>
            ) : (
              // Recommended violation - can dismiss
              <div className="flex items-center justify-end gap-3 w-full">
                <Button variant="ghost" onClick={onClose}>
                  I'll Add It Later
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
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
