/**
 * Generated problem types for problem seeds
 */

export type DifficultyLevel = "easy" | "medium" | "hard";

export interface TestCase {
  name: string;
  input: string;
  expectedOutput: string;
  hidden?: boolean;
}

export interface StarterFile {
  fileName: string;
  content: string;
}

export interface GeneratedProblem {
  id: string;
  seedId: string;
  title: string;
  description: string;
  requirements: string[];
  difficulty: DifficultyLevel;
  estimatedTime: number; // minutes
  language: "typescript" | "javascript" | "python" | "go";
  starterCode: StarterFile[];
  testCases: TestCase[];
  generatedAt: string;
  generatedBy: string; // "llm" | user ID
  score?: number; // If used in assessment and scored
}
