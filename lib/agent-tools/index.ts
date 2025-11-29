/**
 * Agent Tools Index
 * Exports all custom tools for Claude Agent
 */

// Core file operations
export { readFileTool, executeReadFile } from "./read-file";
export { writeFileTool, executeWriteFile } from "./write-file";
export { editFileTool, executeEditFile } from "./edit-file";

// File search and discovery
export { globTool, executeGlob } from "./glob";
export { grepTool, executeGrep } from "./grep";
export { listFilesTool, executeListFiles } from "./list-files";

// Command execution
export { bashTool, executeBash } from "./bash";
export { executeBashTool, executeExecuteBash } from "./execute-bash";

// Testing and questions
export { runTestsTool, executeRunTests } from "./run-tests";
export { suggestNextQuestionTool, executeSuggestNextQuestion } from "./suggest-next-question";

// Types - File operations
export type {
  ReadFileToolInput,
  ReadFileToolOutput,
} from "./read-file";

export type {
  WriteFileToolInput,
  WriteFileToolOutput,
} from "./write-file";

export type {
  EditFileToolOutput,
} from "./edit-file";

// Types - Search
export type {
  GlobToolOutput,
} from "./glob";

export type {
  GrepMatch,
  GrepToolOutput,
} from "./grep";

export type {
  FileEntry,
  ListFilesToolOutput,
} from "./list-files";

// Types - Execution
export type {
  BashToolOutput,
} from "./bash";

export type {
  ExecuteBashToolInput,
  ExecuteBashToolOutput,
} from "./execute-bash";

export type {
  RunTestsToolInput,
  RunTestsToolOutput,
  TestResult,
} from "./run-tests";

export type {
  SuggestNextQuestionToolInput,
  SuggestNextQuestionToolOutput,
} from "./suggest-next-question";
