/**
 * Unit Tests for S3 Storage Service
 * Tests file upload/download, compression, presigned URLs, and error handling
 */

import {
  uploadSessionRecording,
  downloadSessionRecording,
  generatePresignedUrl,
  generatePresignedUploadUrl,
  sessionRecordingExists,
  deleteSessionRecording,
  uploadCodeSnapshots,
  testConnection,
  getStorageStats,
} from "@/lib/services/s3";
import { S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Mock AWS SDK
jest.mock("@aws-sdk/client-s3");
jest.mock("@aws-sdk/s3-request-presigner");

describe("S3 Storage Service", () => {
  let mockS3Client: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Set up mock environment
    process.env.AWS_ACCESS_KEY_ID = "test-access-key";
    process.env.AWS_SECRET_ACCESS_KEY = "test-secret-key";
    process.env.AWS_S3_BUCKET = "test-bucket";
    process.env.AWS_REGION = "us-east-1";

    // Create mock S3 client
    mockS3Client = {
      send: jest.fn(),
    };

    (S3Client as jest.MockedClass<typeof S3Client>).mockImplementation(
      () => mockS3Client
    );
  });

  afterEach(() => {
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_S3_BUCKET;
    delete process.env.AWS_REGION;
  });

  describe("uploadSessionRecording", () => {
    const mockEvents = [
      {
        timestamp: "2025-01-01T00:00:00Z",
        type: "keystroke",
        fileId: "file-1",
        data: { key: "a" },
        checkpoint: false,
      },
      {
        timestamp: "2025-01-01T00:00:01Z",
        type: "test_result",
        data: { passed: true },
        checkpoint: true,
      },
    ];

    it("should upload session recording successfully", async () => {
      mockS3Client.send.mockResolvedValue({
        ETag: '"abc123"',
      });

      const result = await uploadSessionRecording(
        "session-123",
        mockEvents,
        { candidateId: "cand-1" }
      );

      expect(result).toMatchObject({
        bucket: "test-bucket",
        key: expect.stringContaining("session-123/events.json.gz"),
        size: expect.any(Number),
        compressedSize: expect.any(Number),
        compressionRatio: expect.any(Number),
        url: expect.stringContaining("s3://test-bucket"),
        etag: '"abc123"',
      });

      // Should achieve compression
      expect(result.compressionRatio).toBeGreaterThan(1);

      expect(mockS3Client.send).toHaveBeenCalledTimes(1);
    });

    it("should include metadata in upload", async () => {
      mockS3Client.send.mockResolvedValue({
        ETag: '"abc123"',
      });

      const metadata = {
        candidateId: "cand-1",
        duration: "1800",
      };

      await uploadSessionRecording("session-123", mockEvents, metadata);

      const commandArg = mockS3Client.send.mock.calls[0][0];
      const input = commandArg.input;

      expect(input.Metadata).toMatchObject({
        sessionId: "session-123",
        eventCount: "2",
        candidateId: "cand-1",
        duration: "1800",
        originalSize: expect.any(String),
      });
    });

    it("should use gzip compression", async () => {
      mockS3Client.send.mockResolvedValue({
        ETag: '"abc123"',
      });

      await uploadSessionRecording("session-123", mockEvents);

      const commandArg = mockS3Client.send.mock.calls[0][0];
      const input = commandArg.input;

      expect(input.ContentEncoding).toBe("gzip");
      expect(input.ContentType).toBe("application/json");
    });

    it("should generate correct S3 key structure", async () => {
      mockS3Client.send.mockResolvedValue({
        ETag: '"abc123"',
      });

      const result = await uploadSessionRecording("session-123", mockEvents);

      // Key should follow pattern: sessions/YYYY/MM/DD/sessionId/events.json.gz
      expect(result.key).toMatch(
        /^sessions\/\d{4}\/\d{2}\/\d{2}\/session-123\/events\.json\.gz$/
      );
    });

    it("should validate event schema", async () => {
      const invalidEvents = [
        {
          // Missing required fields
          type: "invalid",
        },
      ];

      await expect(
        uploadSessionRecording("session-123", invalidEvents as any)
      ).rejects.toThrow();
    });

    it("should handle upload errors", async () => {
      mockS3Client.send.mockRejectedValue(
        new Error("Access denied")
      );

      await expect(
        uploadSessionRecording("session-123", mockEvents)
      ).rejects.toThrow("S3 upload failed: Access denied");
    });

    it("should throw error if credentials are missing", async () => {
      delete process.env.AWS_ACCESS_KEY_ID;

      await expect(
        uploadSessionRecording("session-123", mockEvents)
      ).rejects.toThrow("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set");
    });
  });

  describe("downloadSessionRecording", () => {
    it("should download and decompress session recording", async () => {
      const mockEvents = [
        {
          timestamp: "2025-01-01T00:00:00Z",
          type: "keystroke",
          data: { key: "a" },
        },
      ];

      // Mock compressed data
      const pako = require("pako");
      const compressedData = pako.gzip(JSON.stringify(mockEvents));

      mockS3Client.send.mockResolvedValue({
        Body: {
          async *[Symbol.asyncIterator]() {
            yield compressedData;
          },
        },
        Metadata: {
          originalSize: "100",
          sessionId: "session-123",
        },
      });

      const result = await downloadSessionRecording("session-123");

      expect(result).toMatchObject({
        events: mockEvents,
        size: 100,
        compressedSize: expect.any(Number),
        metadata: expect.objectContaining({
          sessionId: "session-123",
        }),
      });
    });

    it("should handle missing data", async () => {
      mockS3Client.send.mockResolvedValue({
        Body: null,
      });

      await expect(
        downloadSessionRecording("session-123")
      ).rejects.toThrow("No data received from S3");
    });

    it("should handle download errors", async () => {
      mockS3Client.send.mockRejectedValue(
        new Error("Object not found")
      );

      await expect(
        downloadSessionRecording("session-123")
      ).rejects.toThrow("S3 download failed: Object not found");
    });
  });

  describe("generatePresignedUrl", () => {
    it("should generate presigned download URL", async () => {
      (getSignedUrl as jest.Mock).mockResolvedValue(
        "https://s3.amazonaws.com/test-bucket/sessions/session-123/events.json.gz?signature=xyz"
      );

      const url = await generatePresignedUrl("session-123", 3600);

      expect(url).toContain("https://s3.amazonaws.com");
      expect(url).toContain("session-123");
      expect(url).toContain("signature=");

      expect(getSignedUrl).toHaveBeenCalledWith(
        mockS3Client,
        expect.any(Object),
        { expiresIn: 3600 }
      );
    });

    it("should use default expiry if not specified", async () => {
      (getSignedUrl as jest.Mock).mockResolvedValue("https://url");

      await generatePresignedUrl("session-123");

      expect(getSignedUrl).toHaveBeenCalledWith(
        mockS3Client,
        expect.any(Object),
        { expiresIn: 3600 } // Default 1 hour
      );
    });

    it("should handle URL generation errors", async () => {
      (getSignedUrl as jest.Mock).mockRejectedValue(
        new Error("Invalid bucket")
      );

      await expect(
        generatePresignedUrl("session-123")
      ).rejects.toThrow("Presigned URL generation failed: Invalid bucket");
    });
  });

  describe("generatePresignedUploadUrl", () => {
    it("should generate presigned upload URL", async () => {
      (getSignedUrl as jest.Mock).mockResolvedValue(
        "https://s3.amazonaws.com/test-bucket/upload?signature=xyz"
      );

      const url = await generatePresignedUploadUrl("session-123", 1800);

      expect(url).toContain("https://s3.amazonaws.com");
      expect(getSignedUrl).toHaveBeenCalledWith(
        mockS3Client,
        expect.any(Object),
        { expiresIn: 1800 }
      );
    });
  });

  describe("sessionRecordingExists", () => {
    it("should return true if recording exists", async () => {
      mockS3Client.send.mockResolvedValue({
        ContentLength: 1024,
        LastModified: new Date(),
      });

      const exists = await sessionRecordingExists("session-123");

      expect(exists).toBe(true);
    });

    it("should return false if recording does not exist", async () => {
      const error: any = new Error("NotFound");
      error.name = "NotFound";
      mockS3Client.send.mockRejectedValue(error);

      const exists = await sessionRecordingExists("session-123");

      expect(exists).toBe(false);
    });

    it("should return false for 404 errors", async () => {
      const error: any = new Error("Not found");
      error.$metadata = { httpStatusCode: 404 };
      mockS3Client.send.mockRejectedValue(error);

      const exists = await sessionRecordingExists("session-123");

      expect(exists).toBe(false);
    });

    it("should throw on other errors", async () => {
      mockS3Client.send.mockRejectedValue(
        new Error("Access denied")
      );

      await expect(
        sessionRecordingExists("session-123")
      ).rejects.toThrow("Access denied");
    });
  });

  describe("deleteSessionRecording", () => {
    it("should delete session recording", async () => {
      mockS3Client.send.mockResolvedValue({});

      await expect(
        deleteSessionRecording("session-123")
      ).resolves.toBeUndefined();

      expect(mockS3Client.send).toHaveBeenCalledTimes(1);
    });

    it("should handle deletion errors", async () => {
      mockS3Client.send.mockRejectedValue(
        new Error("Access denied")
      );

      await expect(
        deleteSessionRecording("session-123")
      ).rejects.toThrow("S3 deletion failed: Access denied");
    });
  });

  describe("uploadCodeSnapshots", () => {
    const mockSnapshots = [
      {
        fileId: "file-1",
        fileName: "solution.js",
        content: "function add(a, b) { return a + b; }",
        timestamp: new Date(),
      },
    ];

    it("should upload code snapshots with compression", async () => {
      mockS3Client.send.mockResolvedValue({
        ETag: '"xyz789"',
      });

      const result = await uploadCodeSnapshots("session-123", mockSnapshots);

      expect(result).toMatchObject({
        bucket: "test-bucket",
        key: expect.stringContaining("session-123/snapshots.json.gz"),
        size: expect.any(Number),
        compressedSize: expect.any(Number),
        compressionRatio: expect.any(Number),
        etag: '"xyz789"',
      });

      const commandArg = mockS3Client.send.mock.calls[0][0];
      const input = commandArg.input;

      expect(input.Metadata.snapshotCount).toBe("1");
    });
  });

  describe("testConnection", () => {
    it("should return true on successful connection", async () => {
      mockS3Client.send
        .mockResolvedValueOnce({}) // Upload
        .mockResolvedValueOnce({}); // Delete

      const result = await testConnection();

      expect(result).toBe(true);
      expect(mockS3Client.send).toHaveBeenCalledTimes(2);
    });

    it("should return false on connection failure", async () => {
      mockS3Client.send.mockRejectedValue(
        new Error("Connection failed")
      );

      const result = await testConnection();

      expect(result).toBe(false);
    });
  });

  describe("getStorageStats", () => {
    it("should get storage statistics", async () => {
      const mockLastModified = new Date();

      mockS3Client.send.mockResolvedValue({
        ContentLength: 2048,
        LastModified: mockLastModified,
        Metadata: {
          originalSize: "10240",
        },
      });

      const result = await getStorageStats("session-123");

      expect(result).toMatchObject({
        exists: true,
        size: 10240,
        compressedSize: 2048,
        lastModified: mockLastModified,
      });
    });

    it("should return exists false if not found", async () => {
      const error: any = new Error("NotFound");
      error.name = "NotFound";
      mockS3Client.send.mockRejectedValue(error);

      const result = await getStorageStats("session-123");

      expect(result).toEqual({ exists: false });
    });

    it("should throw on other errors", async () => {
      mockS3Client.send.mockRejectedValue(
        new Error("Access denied")
      );

      await expect(
        getStorageStats("session-123")
      ).rejects.toThrow("Access denied");
    });
  });

  describe("Compression", () => {
    it("should compress large event arrays effectively", async () => {
      // Create a large array of similar events (should compress well)
      const largeEventArray = Array(1000).fill(null).map((_, i) => ({
        timestamp: `2025-01-01T00:${String(i).padStart(2, "0")}:00Z`,
        type: "keystroke",
        data: { key: "a" },
      }));

      mockS3Client.send.mockResolvedValue({
        ETag: '"abc"',
      });

      const result = await uploadSessionRecording("session-123", largeEventArray);

      // With 1000 similar events, compression ratio should be significant
      expect(result.compressionRatio).toBeGreaterThan(5);
    });
  });

  describe("S3 Client Configuration", () => {
    it("should configure S3 client with correct credentials", async () => {
      mockS3Client.send.mockResolvedValue({
        ETag: '"abc"',
      });

      await uploadSessionRecording("session-123", [
        {
          timestamp: "2025-01-01T00:00:00Z",
          type: "test",
          data: {},
        },
      ]);

      expect(S3Client).toHaveBeenCalledWith({
        region: "us-east-1",
        credentials: {
          accessKeyId: "test-access-key",
          secretAccessKey: "test-secret-key",
        },
      });
    });
  });
});
