"use client";

import React, { useState } from "react";
import { MessageCircleQuestion, Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface Question {
  questionId: string;
  questionText: string;
  options: string[];
  multiSelect?: boolean;
  allowCustomAnswer?: boolean;
}

export interface AgentQuestionsProps {
  batchId: string;
  questions: Question[];
  onSubmit: (answers: Record<string, { selectedOption?: string; selectedOptions?: string[]; customAnswer?: string }>) => void;
  disabled?: boolean;
  className?: string;
}

interface QuestionState {
  // For single-select questions
  selectedOption: string | null;
  // For multi-select questions
  selectedOptions: string[];
  showCustomInput: boolean;
  customAnswer: string;
}

/**
 * AgentQuestions component displays multiple clarifying questions from the AI agent
 * with multiple-choice options and optional custom answer fields for each.
 *
 * Supports both single-select (radio) and multi-select (checkbox) questions.
 * All questions must be answered before the "Submit All" button is enabled.
 */
export function AgentQuestions({
  batchId,
  questions,
  onSubmit,
  disabled = false,
  className,
}: AgentQuestionsProps) {
  // Track state for each question
  const [questionStates, setQuestionStates] = useState<Record<string, QuestionState>>(
    Object.fromEntries(
      questions.map((q) => [
        q.questionId,
        { selectedOption: null, selectedOptions: [], showCustomInput: false, customAnswer: "" },
      ])
    )
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const updateQuestionState = (questionId: string, updates: Partial<QuestionState>) => {
    setQuestionStates((prev) => ({
      ...prev,
      [questionId]: { ...prev[questionId], ...updates },
    }));
  };

  // Toggle an option for multi-select questions
  const toggleMultiSelectOption = (questionId: string, option: string) => {
    setQuestionStates((prev) => {
      const current = prev[questionId];
      const newSelected = current.selectedOptions.includes(option)
        ? current.selectedOptions.filter((o) => o !== option)
        : [...current.selectedOptions, option];
      return {
        ...prev,
        [questionId]: {
          ...current,
          selectedOptions: newSelected,
          // Clear custom input if selecting options
          showCustomInput: false,
          customAnswer: "",
        },
      };
    });
  };

  // Check if a question has been answered
  const isQuestionAnswered = (question: Question): boolean => {
    const state = questionStates[question.questionId];
    if (question.multiSelect) {
      return state?.selectedOptions?.length > 0 || !!state?.customAnswer?.trim();
    }
    return !!state?.selectedOption || !!state?.customAnswer?.trim();
  };

  // Check if all questions have answers
  const answeredCount = questions.filter(isQuestionAnswered).length;
  const allAnswered = answeredCount === questions.length;

  const handleSubmit = async () => {
    if (!allAnswered || isSubmitting || isSubmitted) return;

    setIsSubmitting(true);
    try {
      const answers: Record<string, { selectedOption?: string; selectedOptions?: string[]; customAnswer?: string }> = {};
      for (const q of questions) {
        const state = questionStates[q.questionId];
        if (q.multiSelect) {
          answers[q.questionId] = {
            selectedOptions: state.selectedOptions.length > 0 ? state.selectedOptions : undefined,
            customAnswer: state.customAnswer?.trim() || undefined,
          };
        } else {
          answers[q.questionId] = {
            selectedOption: state.selectedOption || undefined,
            customAnswer: state.customAnswer?.trim() || undefined,
          };
        }
      }
      await onSubmit(answers);
      setIsSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit = allAnswered && !disabled && !isSubmitting && !isSubmitted;

  return (
    <div
      className={cn(
        "rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-5",
        "animate-fade-in",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
          <MessageCircleQuestion className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-text-primary mb-1">
            A few questions before I proceed:
          </p>
          <p className="text-xs text-text-tertiary">
            Please answer all {questions.length} questions below
          </p>
        </div>
      </div>

      {/* Questions */}
      {!isSubmitted && (
        <div className="space-y-5 pl-11">
          {questions.map((question, index) => {
            const state = questionStates[question.questionId];
            const isAnswered = isQuestionAnswered(question);
            const isMultiSelect = question.multiSelect;

            return (
              <div key={question.questionId} className="space-y-2">
                {/* Question text */}
                <div className="flex items-start gap-2">
                  <span
                    className={cn(
                      "text-sm font-medium min-w-[20px]",
                      isAnswered ? "text-success" : "text-text-primary"
                    )}
                  >
                    {index + 1}.
                  </span>
                  <div className="flex-1">
                    <p className="text-sm text-text-secondary">
                      {question.questionText}
                    </p>
                    {isMultiSelect && (
                      <p className="text-xs text-text-tertiary mt-0.5">
                        Select all that apply
                      </p>
                    )}
                  </div>
                </div>

                {/* Options */}
                <div className="space-y-2 ml-6">
                  {question.options.map((option, optIndex) => {
                    const isSelected = isMultiSelect
                      ? state?.selectedOptions?.includes(option)
                      : state?.selectedOption === option;

                    return (
                      <button
                        key={`${question.questionId}-opt-${optIndex}`}
                        onClick={() => {
                          if (isMultiSelect) {
                            toggleMultiSelectOption(question.questionId, option);
                          } else {
                            updateQuestionState(question.questionId, {
                              selectedOption: option,
                              showCustomInput: false,
                              customAnswer: "",
                            });
                          }
                        }}
                        disabled={disabled}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-md text-sm transition-all border",
                          isSelected
                            ? "border-primary bg-primary/10 text-text-primary"
                            : "border-border bg-background-secondary text-text-secondary hover:border-border-hover hover:bg-background-tertiary",
                          disabled && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          {/* Checkbox for multi-select, radio for single-select */}
                          <div
                            className={cn(
                              "w-4 h-4 border-2 flex items-center justify-center flex-shrink-0",
                              isMultiSelect ? "rounded" : "rounded-full",
                              isSelected ? "border-primary bg-primary" : "border-border"
                            )}
                          >
                            {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                          </div>
                          <span>{option}</span>
                        </div>
                      </button>
                    );
                  })}

                  {/* Custom answer option */}
                  {question.allowCustomAnswer !== false && (
                    <>
                      <button
                        onClick={() => {
                          if (isMultiSelect) {
                            // For multi-select, just toggle the custom input
                            updateQuestionState(question.questionId, {
                              showCustomInput: !state?.showCustomInput,
                            });
                          } else {
                            updateQuestionState(question.questionId, {
                              selectedOption: null,
                              selectedOptions: [],
                              showCustomInput: true,
                            });
                          }
                        }}
                        disabled={disabled}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-md text-sm transition-all border",
                          state?.showCustomInput
                            ? "border-primary bg-primary/10 text-text-primary"
                            : "border-border bg-background-secondary text-text-secondary hover:border-border-hover hover:bg-background-tertiary",
                          disabled && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "w-4 h-4 border-2 flex items-center justify-center flex-shrink-0",
                              isMultiSelect ? "rounded" : "rounded-full",
                              state?.showCustomInput
                                ? "border-primary bg-primary"
                                : "border-border"
                            )}
                          >
                            {state?.showCustomInput && (
                              <Pencil className="w-2.5 h-2.5 text-white" />
                            )}
                          </div>
                          <span>{isMultiSelect ? "Add custom response" : "Other (type your own response)"}</span>
                        </div>
                      </button>

                      {state?.showCustomInput && (
                        <Textarea
                          value={state?.customAnswer || ""}
                          onChange={(e) =>
                            updateQuestionState(question.questionId, {
                              customAnswer: e.target.value,
                            })
                          }
                          placeholder="Type your response..."
                          className="min-h-[60px] bg-background-secondary border-border focus:border-primary resize-none text-sm"
                          disabled={disabled}
                        />
                      )}
                    </>
                  )}

                  {/* Show selected count for multi-select */}
                  {isMultiSelect && state?.selectedOptions?.length > 0 && (
                    <p className="text-xs text-text-tertiary">
                      {state.selectedOptions.length} option{state.selectedOptions.length !== 1 ? "s" : ""} selected
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Progress indicator */}
      {!isSubmitted && (
        <div className="pl-11">
          <div className="flex items-center justify-between text-xs text-text-tertiary">
            <span>
              {answeredCount} of {questions.length} answered
            </span>
            {!allAnswered && (
              <span className="text-warning">
                Please answer all questions to continue
              </span>
            )}
          </div>
        </div>
      )}

      {/* Submit button */}
      {!isSubmitted && (
        <div className="flex justify-end pl-11">
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            loading={isSubmitting}
            size="sm"
            variant="primary"
          >
            {isSubmitting ? "Sending..." : "Submit All Responses"}
          </Button>
        </div>
      )}

      {/* Submitted state */}
      {isSubmitted && (
        <div className="flex items-center gap-2 text-sm text-success pl-11">
          <Check className="w-4 h-4" />
          <span>All {questions.length} responses sent</span>
        </div>
      )}
    </div>
  );
}

export default AgentQuestions;
