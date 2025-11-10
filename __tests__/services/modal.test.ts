/**
 * Unit Tests for Modal AI Sandbox Service
 * Tests sandbox creation, code execution, file operations, and cleanup
 */

import {
  executeCode,
  createSandbox,
  destroySandbox,
  getSandboxStatus,
  runCommand,
  testConnection,
  listActiveSandboxes,
  getTerminalConnectionUrl,
} from "@/lib/services/modal";

// Mock fetch globally
global.fetch = jest.fn();

describe("Modal AI Sandbox Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Set up mock environment
    process.env.MODAL_TOKEN_ID = "test-token-id";
    process.env.MODAL_TOKEN_SECRET = "test-token-secret";
    process.env.MODAL_API_URL = "https://modal.com/api/v1";
    process.env.MODAL_WORKSPACE = "test-workspace";
  });

  afterEach(() => {
    delete process.env.MODAL_TOKEN_ID;
    delete process.env.MODAL_TOKEN_SECRET;
    delete process.env.MODAL_API_URL;
    delete process.env.MODAL_WORKSPACE;
  });

  describe("executeCode", () => {
    const mockTestCases = [
      {
        name: "test_add",
        input: [2, 3],
        expected: 5,
        hidden: false,
      },
      {
        name: "test_add_negative",
        input: [-1, 1],
        expected: 0,
        hidden: false,
      },
    ];

    it("should execute code successfully with all tests passing", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          success: true,
          testResults: [
            {
              name: "test_add",
              passed: true,
              output: "5",
              duration: 10,
              hidden: false,
            },
            {
              name: "test_add_negative",
              passed: true,
              output: "0",
              duration: 8,
              hidden: false,
            },
          ],
          stdout: "",
          stderr: "",
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await executeCode(
        "function add(a, b) { return a + b; }",
        "javascript",
        mockTestCases
      );

      expect(result).toMatchObject({
        success: true,
        totalTests: 2,
        passedTests: 2,
        failedTests: 0,
        testResults: expect.arrayContaining([
          expect.objectContaining({
            name: "test_add",
            passed: true,
          }),
          expect.objectContaining({
            name: "test_add_negative",
            passed: true,
          }),
        ]),
        executionTime: expect.any(Number),
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "https://modal.com/api/v1/execute",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer test-token-id:test-token-secret",
            "Content-Type": "application/json",
          }),
          body: expect.stringContaining("javascript"),
        })
      );
    });

    it("should handle test failures correctly", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          success: false,
          testResults: [
            {
              name: "test_add",
              passed: true,
              output: "5",
              duration: 10,
              hidden: false,
            },
            {
              name: "test_add_negative",
              passed: false,
              output: "2",
              error: "Expected 0, got 2",
              duration: 8,
              hidden: false,
            },
          ],
          stdout: "",
          stderr: "AssertionError",
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await executeCode(
        "function add(a, b) { return a + b + 1; }",
        "javascript",
        mockTestCases
      );

      expect(result).toMatchObject({
        success: false,
        totalTests: 2,
        passedTests: 1,
        failedTests: 1,
        testResults: expect.arrayContaining([
          expect.objectContaining({
            name: "test_add_negative",
            passed: false,
            error: "Expected 0, got 2",
          }),
        ]),
      });
    });

    it("should validate language parameter", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ success: true, testResults: [] }),
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      // Valid languages
      await expect(
        executeCode("code", "javascript", mockTestCases)
      ).resolves.toBeDefined();

      await expect(
        executeCode("code", "typescript", mockTestCases)
      ).resolves.toBeDefined();

      await expect(
        executeCode("code", "python", mockTestCases)
      ).resolves.toBeDefined();

      // Invalid language
      await expect(
        executeCode("code", "invalid" as any, mockTestCases)
      ).rejects.toThrow();
    });

    it("should handle API errors gracefully", async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        text: async () => "Internal server error",
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await executeCode(
        "function add(a, b) { return a + b; }",
        "javascript",
        mockTestCases
      );

      expect(result).toMatchObject({
        success: false,
        passedTests: 0,
        failedTests: 2,
        error: expect.stringContaining("Modal API error (500)"),
      });
    });

    it("should handle network errors", async () => {
      (global.fetch as jest.Mock).mockRejectedValue(
        new Error("Network error")
      );

      const result = await executeCode(
        "function add(a, b) { return a + b; }",
        "javascript",
        mockTestCases
      );

      expect(result).toMatchObject({
        success: false,
        error: "Network error",
      });
    });

    it("should throw error if credentials are missing", async () => {
      delete process.env.MODAL_TOKEN_ID;

      await expect(
        executeCode("code", "javascript", mockTestCases)
      ).rejects.toThrow("MODAL_TOKEN_ID and MODAL_TOKEN_SECRET must be set");
    });
  });

  describe("createSandbox", () => {
    it("should create sandbox successfully", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          id: "sandbox-123",
          status: "initializing",
          createdAt: "2025-01-01T00:00:00Z",
          wsUrl: "wss://modal.com/ws/sandbox-123",
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await createSandbox("session-1", "python");

      expect(result).toMatchObject({
        id: "sandbox-123",
        sessionId: "session-1",
        status: "initializing",
        language: "python",
        wsUrl: "wss://modal.com/ws/sandbox-123",
        createdAt: expect.any(Date),
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "https://modal.com/api/v1/sandboxes",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("session-1"),
        })
      );
    });

    it("should handle creation errors", async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        text: async () => "Invalid session ID",
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await expect(
        createSandbox("invalid-session", "python")
      ).rejects.toThrow("Failed to create sandbox (400): Invalid session ID");
    });
  });

  describe("destroySandbox", () => {
    it("should destroy sandbox successfully", async () => {
      const mockResponse = {
        ok: true,
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await expect(destroySandbox("sandbox-123")).resolves.toBeUndefined();

      expect(global.fetch).toHaveBeenCalledWith(
        "https://modal.com/api/v1/sandboxes/sandbox-123",
        expect.objectContaining({
          method: "DELETE",
        })
      );
    });

    it("should not throw on cleanup failures", async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        text: async () => "Sandbox not found",
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      // Should not throw
      await expect(destroySandbox("sandbox-123")).resolves.toBeUndefined();
    });
  });

  describe("getSandboxStatus", () => {
    it("should get sandbox status successfully", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          status: "ready",
          uptime: 1234,
          memoryUsage: 256,
          cpuUsage: 0.5,
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await getSandboxStatus("sandbox-123");

      expect(result).toMatchObject({
        status: "ready",
        uptime: 1234,
        memoryUsage: 256,
        cpuUsage: 0.5,
      });
    });

    it("should handle status check errors", async () => {
      const mockResponse = {
        ok: false,
        status: 404,
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await expect(getSandboxStatus("sandbox-123")).rejects.toThrow(
        "Sandbox status check failed"
      );
    });
  });

  describe("runCommand", () => {
    it("should run command successfully", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          stdout: "Hello, World!\n",
          stderr: "",
          exitCode: 0,
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await runCommand("sandbox-123", "echo 'Hello, World!'");

      expect(result).toMatchObject({
        stdout: "Hello, World!\n",
        stderr: "",
        exitCode: 0,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "https://modal.com/api/v1/sandboxes/sandbox-123/exec",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("echo 'Hello, World!'"),
        })
      );
    });

    it("should handle command errors", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          stdout: "",
          stderr: "command not found: invalid-command\n",
          exitCode: 127,
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await runCommand("sandbox-123", "invalid-command");

      expect(result.exitCode).toBe(127);
      expect(result.stderr).toContain("command not found");
    });
  });

  describe("testConnection", () => {
    it("should return true on successful health check", async () => {
      const mockResponse = {
        ok: true,
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await testConnection();

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://modal.com/api/v1/health",
        expect.objectContaining({
          method: "GET",
        })
      );
    });

    it("should return false on connection failure", async () => {
      (global.fetch as jest.Mock).mockRejectedValue(
        new Error("Network error")
      );

      const result = await testConnection();

      expect(result).toBe(false);
    });
  });

  describe("listActiveSandboxes", () => {
    it("should list active sandboxes successfully", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          sandboxes: [
            {
              id: "sandbox-1",
              sessionId: "session-1",
              status: "ready",
              createdAt: "2025-01-01T00:00:00Z",
              language: "python",
              wsUrl: "wss://modal.com/ws/sandbox-1",
            },
            {
              id: "sandbox-2",
              sessionId: "session-2",
              status: "running",
              createdAt: "2025-01-01T01:00:00Z",
              language: "javascript",
              wsUrl: "wss://modal.com/ws/sandbox-2",
            },
          ],
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await listActiveSandboxes();

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: "sandbox-1",
        sessionId: "session-1",
        status: "ready",
        language: "python",
      });
    });

    it("should return empty array on error", async () => {
      (global.fetch as jest.Mock).mockRejectedValue(
        new Error("Network error")
      );

      const result = await listActiveSandboxes();

      expect(result).toEqual([]);
    });
  });

  describe("getTerminalConnectionUrl", () => {
    it("should generate terminal WebSocket URL", () => {
      const url = getTerminalConnectionUrl("session-123");

      expect(url).toContain("wss://modal.com/api/v1/ws/terminal");
      expect(url).toContain("session=session-123");
      expect(url).toContain("workspace=test-workspace");
      expect(url).toContain("token=test-token-id");
    });

    it("should throw error if token ID is missing", () => {
      delete process.env.MODAL_TOKEN_ID;

      expect(() => getTerminalConnectionUrl("session-123")).toThrow(
        "MODAL_TOKEN_ID must be set"
      );
    });

    it("should use default workspace if not set", () => {
      delete process.env.MODAL_WORKSPACE;

      const url = getTerminalConnectionUrl("session-123");

      expect(url).toContain("workspace=default");
    });
  });

  describe("Authentication Headers", () => {
    it("should include correct authentication headers", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ success: true, testResults: [] }),
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await executeCode("code", "javascript", []);

      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const headers = callArgs[1].headers;

      expect(headers.Authorization).toBe(
        "Bearer test-token-id:test-token-secret"
      );
      expect(headers["Content-Type"]).toBe("application/json");
    });
  });

  describe("Timeout and Resource Limits", () => {
    it("should include execution timeout in request", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ success: true, testResults: [] }),
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await executeCode("code", "javascript", []);

      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body.timeout).toBe(30000); // 30 seconds
      expect(body.memoryLimit).toBe(512); // 512 MB
      expect(body.cpuLimit).toBe(1.0);
    });
  });
});
