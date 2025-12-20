"use client";

import React, { useState } from "react";
import { MessageCircleQuestion, Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface AgentQuestionProps {
  questionId: string;
  questionText: string;
  options: string[];
  allowCustomAnswer?: boolean;
  onAnswer: (answer: { selectedOption?: string; customAnswer?: string }) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * AgentQuestion component displays a clarifying question from the AI agent
 * with multiple-choice options and an optional custom answer field.
 *
 * Used for the question-first approach where the agent asks for clarification
 * before taking action.
 */
export function AgentQuestion({
  questionId,
  questionText,
  options,
  allowCustomAnswer = true,
  onAnswer,
  disabled = false,
  className,
}: AgentQuestionProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customAnswer, setCustomAnswer] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleOptionClick = (option: string) => {
    if (disabled || isSubmitted) return;
    setSelectedOption(option);
    setShowCustomInput(false);
    setCustomAnswer("");
  };

  const handleCustomClick = () => {
    if (disabled || isSubmitted) return;
    setSelectedOption(null);
    setShowCustomInput(true);
  };

  const handleSubmit = async () => {
    if (disabled || isSubmitting || isSubmitted) return;
    if (!selectedOption && !customAnswer.trim()) return;

    setIsSubmitting(true);
    try {
      await onAnswer({
        selectedOption: selectedOption || undefined,
        customAnswer: customAnswer.trim() || undefined,
      });
      setIsSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit = (selectedOption || customAnswer.trim()) && !disabled && !isSubmitting && !isSubmitted;

  return (
    <div
      className={cn(
        "rounded-lg border border-primary/30 bg-primary/5 p-4",
        "animate-fade-in",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
          <MessageCircleQuestion className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-text-primary mb-1">
            Quick question before I proceed:
          </p>
          <p className="text-sm text-text-secondary">{questionText}</p>
        </div>
      </div>

      {/* Options */}
      {!isSubmitted && (
        <div className="space-y-2 mb-4">
          {options.map((option, index) => (
            <button
              key={`${questionId}-option-${index}`}
              onClick={() => handleOptionClick(option)}
              disabled={disabled}
              className={cn(
                "w-full text-left px-4 py-3 rounded-md text-sm transition-all",
                "border",
                selectedOption === option
                  ? "border-primary bg-primary/10 text-text-primary"
                  : "border-border bg-background-secondary text-text-secondary hover:border-border-hover hover:bg-background-tertiary",
                disabled && "opacity-50 cursor-not-allowed"
              )}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                    selectedOption === option
                      ? "border-primary bg-primary"
                      : "border-border"
                  )}
                >
                  {selectedOption === option && (
                    <Check className="w-3 h-3 text-white" />
                  )}
                </div>
                <span>{option}</span>
              </div>
            </button>
          ))}

          {/* Custom answer option */}
          {allowCustomAnswer && (
            <button
              onClick={handleCustomClick}
              disabled={disabled}
              className={cn(
                "w-full text-left px-4 py-3 rounded-md text-sm transition-all",
                "border",
                showCustomInput
                  ? "border-primary bg-primary/10 text-text-primary"
                  : "border-border bg-background-secondary text-text-secondary hover:border-border-hover hover:bg-background-tertiary",
                disabled && "opacity-50 cursor-not-allowed"
              )}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                    showCustomInput
                      ? "border-primary bg-primary"
                      : "border-border"
                  )}
                >
                  {showCustomInput && <Pencil className="w-3 h-3 text-white" />}
                </div>
                <span>Other (type your own response)</span>
              </div>
            </button>
          )}
        </div>
      )}

      {/* Custom answer input */}
      {showCustomInput && !isSubmitted && (
        <div className="mb-4">
          <Textarea
            value={customAnswer}
            onChange={(e) => setCustomAnswer(e.target.value)}
            placeholder="Type your response..."
            className="min-h-[80px] bg-background-secondary border-border focus:border-primary resize-none"
            disabled={disabled}
          />
        </div>
      )}

      {/* Submit button */}
      {!isSubmitted && (
        <div className="flex justify-end">
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            loading={isSubmitting}
            size="sm"
            variant="primary"
          >
            {isSubmitting ? "Sending..." : "Send Response"}
          </Button>
        </div>
      )}

      {/* Submitted state */}
      {isSubmitted && (
        <div className="flex items-center gap-2 text-sm text-success">
          <Check className="w-4 h-4" />
          <span>
            Response sent: {selectedOption || `"${customAnswer}"`}
          </span>
        </div>
      )}
    </div>
  );
}

export default AgentQuestion;
