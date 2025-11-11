/**
 * Agent Tools Index
 * Exports all custom tools for Claude Agent
 */

export { readFileTool, executeReadFile } from "./read-file";
export { writeFileTool, executeWriteFile } from "./write-file";
export { runTestsTool, executeRunTests } from "./run-tests";
export { executeBashTool, executeExecuteBash } from "./execute-bash";

export type {
  ReadFileToolInput,
  ReadFileToolOutput,
} from "./read-file";

export type {
  WriteFileToolInput,
  WriteFileToolOutput,
} from "./write-file";

export type {
  RunTestsToolInput,
  RunTestsToolOutput,
  TestResult,
} from "./run-tests";

export type {
  ExecuteBashToolInput,
  ExecuteBashToolOutput,
} from "./execute-bash";
