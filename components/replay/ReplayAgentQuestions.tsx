"use client";

import React from "react";
import { MessageCircleQuestion, Check, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentQuestion, AgentQuestionAnswer } from "./types";

export interface ReplayAgentQuestionsProps {
  questions: AgentQuestion[];
  answers?: AgentQuestionAnswer[];
  className?: string;
}

/**
 * Read-only display of agent questions and answers for session replay.
 * Shows the questions that were asked and the answers that were given.
 */
export function ReplayAgentQuestions({
  questions,
  answers = [],
  className,
}: ReplayAgentQuestionsProps) {
  // Build a map of answers by questionId for easy lookup
  const answerMap = new Map<string, AgentQuestionAnswer>();
  answers.forEach((answer) => {
    answerMap.set(answer.questionId, answer);
  });

  const hasAnswers = answers.length > 0;

  return (
    <div
      className={cn(
        "rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-4",
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
            Clarifying Questions
          </p>
          <p className="text-xs text-text-tertiary">
            {questions.length} question{questions.length !== 1 ? "s" : ""} asked
            {hasAnswers && " • Answered"}
          </p>
        </div>
        {hasAnswers && (
          <div className="flex items-center gap-1 text-success">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-xs font-medium">Answered</span>
          </div>
        )}
      </div>

      {/* Questions */}
      <div className="space-y-4 pl-11">
        {questions.map((question, index) => {
          const answer = answerMap.get(question.questionId);
          const isMultiSelect = question.multiSelect;

          // Determine which options were selected
          const selectedOptions: string[] = [];
          if (answer) {
            if (answer.selectedOptions && answer.selectedOptions.length > 0) {
              selectedOptions.push(...answer.selectedOptions);
            } else if (answer.selectedOption) {
              selectedOptions.push(answer.selectedOption);
            }
          }

          return (
            <div key={question.questionId} className="space-y-2">
              {/* Question text */}
              <div className="flex items-start gap-2">
                <span className="text-sm font-medium text-text-primary min-w-[20px]">
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
              <div className="space-y-1.5 ml-6">
                {question.options.map((option, optIndex) => {
                  const isSelected = selectedOptions.includes(option);

                  return (
                    <div
                      key={`${question.questionId}-opt-${optIndex}`}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-md text-sm border",
                        isSelected
                          ? "border-primary bg-primary/10 text-text-primary"
                          : "border-border bg-background-secondary/50 text-text-tertiary"
                      )}
                    >
                      {/* Checkbox/Radio indicator */}
                      <div
                        className={cn(
                          "w-4 h-4 border-2 flex items-center justify-center flex-shrink-0",
                          isMultiSelect ? "rounded" : "rounded-full",
                          isSelected
                            ? "border-primary bg-primary"
                            : "border-border"
                        )}
                      >
                        {isSelected && (
                          <Check className="w-2.5 h-2.5 text-white" />
                        )}
                      </div>
                      <span>{option}</span>
                    </div>
                  );
                })}

                {/* Custom answer if provided */}
                {answer?.customAnswer && (
                  <div className="flex items-start gap-3 px-3 py-2 rounded-md text-sm border border-primary bg-primary/10 text-text-primary">
                    <div
                      className={cn(
                        "w-4 h-4 border-2 flex items-center justify-center flex-shrink-0 mt-0.5",
                        isMultiSelect ? "rounded" : "rounded-full",
                        "border-primary bg-primary"
                      )}
                    >
                      <Check className="w-2.5 h-2.5 text-white" />
                    </div>
                    <div className="flex-1">
                      <span className="text-text-tertiary text-xs">Custom response:</span>
                      <p className="text-text-primary">{answer.customAnswer}</p>
                    </div>
                  </div>
                )}

                {/* No answer indicator */}
                {!answer && (
                  <p className="text-xs text-text-tertiary italic mt-1">
                    Not yet answered at this point
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ReplayAgentQuestions;
