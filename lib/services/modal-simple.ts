/**
 * Modal Service (Backward Compatibility Layer)
 *
 * DEPRECATED: This file is kept for backward compatibility.
 * Use lib/services/modal.production.ts for new code.
 *
 * This re-exports the production Modal service to maintain API compatibility
 * with existing code while providing full functionality.
 */

import { z } from "zod";
import {
  modalService as productionModalService,
  type TestCase as ProductionTestCase,
  type ExecutionResult as ProductionExecutionResult,
} from "./modal.production";

// Re-export types for backward compatibility
export type TestCase = ProductionTestCase;
export type ExecutionResult = ProductionExecutionResult;

// Re-export all functions from production service
export const executeCode = productionModalService.executeCode;
export const createVolume = productionModalService.createVolume;
export const writeFile = productionModalService.writeFile;
export const readFile = productionModalService.readFile;
export const getFileSystem = productionModalService.getFileSystem;
export const listFiles = productionModalService.listFiles;
export const executeCommand = productionModalService.executeCommand;
export const testConnection = productionModalService.testConnection;
export const healthCheck = productionModalService.healthCheck;

// Export as modalService for drop-in replacement
export const modalService = productionModalService;
