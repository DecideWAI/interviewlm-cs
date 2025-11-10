/**
 * S3 Storage Service
 *
 * Handles storage of session recordings and large files to AWS S3.
 * Includes compression, presigned URLs, and efficient retrieval.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import * as pako from "pako";
import { z } from "zod";

// Configuration
const S3_BUCKET = process.env.AWS_S3_BUCKET || "interviewlm-sessions";
const S3_REGION = process.env.AWS_REGION || "us-east-1";
const PRESIGNED_URL_EXPIRY = 3600; // 1 hour in seconds

// Validation schemas
const sessionEventSchema = z.object({
  timestamp: z.string(),
  type: z.string(),
  fileId: z.string().optional(),
  data: z.any(),
  checkpoint: z.boolean().optional(),
});

type SessionEvent = z.infer<typeof sessionEventSchema>;

/**
 * Upload result metadata
 */
export interface UploadResult {
  bucket: string;
  key: string;
  size: number; // bytes
  compressedSize: number; // bytes
  compressionRatio: number;
  url: string;
  etag?: string;
}

/**
 * Download result with decompressed data
 */
export interface DownloadResult {
  events: SessionEvent[];
  size: number; // original size
  compressedSize: number; // downloaded size
  metadata?: Record<string, string>;
}

/**
 * Initialize S3 client with credentials
 */
function getS3Client(): S3Client {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set");
  }

  return new S3Client({
    region: S3_REGION,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

/**
 * Generate S3 key for session recording
 *
 * @param sessionId - Session identifier
 * @param type - File type (e.g., 'events', 'snapshots')
 * @returns S3 object key
 */
function generateS3Key(sessionId: string, type: string = "events"): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  // Path structure: sessions/YYYY/MM/DD/sessionId/type.json.gz
  return `sessions/${year}/${month}/${day}/${sessionId}/${type}.json.gz`;
}

/**
 * Compress data using gzip
 *
 * @param data - Data to compress
 * @returns Compressed buffer
 */
function compressData(data: any): Buffer {
  const jsonString = JSON.stringify(data);
  const compressed = pako.gzip(jsonString, { level: 9 }); // Maximum compression
  return Buffer.from(compressed);
}

/**
 * Decompress gzipped data
 *
 * @param buffer - Compressed buffer
 * @returns Decompressed JSON data
 */
function decompressData(buffer: Buffer): any {
  const decompressed = pako.ungzip(buffer, { to: "string" });
  return JSON.parse(decompressed);
}

/**
 * Upload session recording to S3 with gzip compression
 *
 * @param sessionId - Unique session identifier
 * @param events - Array of session events to store
 * @param metadata - Optional metadata to attach
 * @returns Upload result with size and compression info
 *
 * @example
 * ```typescript
 * const result = await uploadSessionRecording(sessionId, events, {
 *   candidateId: "cand_123",
 *   duration: "1800"
 * });
 * console.log(`Compressed ${result.size} bytes to ${result.compressedSize} bytes`);
 * ```
 */
export async function uploadSessionRecording(
  sessionId: string,
  events: SessionEvent[],
  metadata?: Record<string, string>
): Promise<UploadResult> {
  try {
    // Validate events
    events.forEach((event) => sessionEventSchema.parse(event));

    const client = getS3Client();
    const key = generateS3Key(sessionId, "events");

    // Calculate original size
    const originalSize = Buffer.byteLength(JSON.stringify(events), "utf8");

    // Compress data
    const compressedBuffer = compressData(events);
    const compressedSize = compressedBuffer.length;

    // Prepare upload command
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: compressedBuffer,
      ContentType: "application/json",
      ContentEncoding: "gzip",
      Metadata: {
        sessionId,
        eventCount: String(events.length),
        originalSize: String(originalSize),
        ...metadata,
      },
    });

    // Upload to S3
    const response = await client.send(command);

    return {
      bucket: S3_BUCKET,
      key,
      size: originalSize,
      compressedSize,
      compressionRatio: originalSize / compressedSize,
      url: `s3://${S3_BUCKET}/${key}`,
      etag: response.ETag,
    };

  } catch (error) {
    console.error("Error uploading session recording to S3:", error);
    throw new Error(
      `S3 upload failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Download and decompress session recording from S3
 *
 * @param sessionId - Session identifier
 * @returns Decompressed session events
 *
 * @example
 * ```typescript
 * const { events, size } = await downloadSessionRecording(sessionId);
 * console.log(`Retrieved ${events.length} events (${size} bytes)`);
 * ```
 */
export async function downloadSessionRecording(
  sessionId: string
): Promise<DownloadResult> {
  try {
    const client = getS3Client();
    const key = generateS3Key(sessionId, "events");

    // Download from S3
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    });

    const response = await client.send(command);

    if (!response.Body) {
      throw new Error("No data received from S3");
    }

    // Read stream to buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as any) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    // Decompress data
    const events = decompressData(buffer);

    return {
      events,
      size: parseInt(response.Metadata?.originalSize || "0", 10),
      compressedSize: buffer.length,
      metadata: response.Metadata,
    };

  } catch (error) {
    console.error("Error downloading session recording from S3:", error);
    throw new Error(
      `S3 download failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Generate presigned URL for direct download access
 * Useful for giving temporary access to clients without exposing credentials
 *
 * @param sessionId - Session identifier
 * @param expiresIn - URL expiry time in seconds (default: 1 hour)
 * @returns Presigned download URL
 *
 * @example
 * ```typescript
 * const url = await generatePresignedUrl(sessionId, 3600);
 * // Share URL with client for temporary access
 * ```
 */
export async function generatePresignedUrl(
  sessionId: string,
  expiresIn: number = PRESIGNED_URL_EXPIRY
): Promise<string> {
  try {
    const client = getS3Client();
    const key = generateS3Key(sessionId, "events");

    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    });

    const url = await getSignedUrl(client, command, { expiresIn });

    return url;

  } catch (error) {
    console.error("Error generating presigned URL:", error);
    throw new Error(
      `Presigned URL generation failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Generate presigned upload URL for direct client uploads
 *
 * @param sessionId - Session identifier
 * @param expiresIn - URL expiry time in seconds (default: 1 hour)
 * @returns Presigned upload URL
 */
export async function generatePresignedUploadUrl(
  sessionId: string,
  expiresIn: number = PRESIGNED_URL_EXPIRY
): Promise<string> {
  try {
    const client = getS3Client();
    const key = generateS3Key(sessionId, "events");

    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      ContentType: "application/json",
      ContentEncoding: "gzip",
    });

    const url = await getSignedUrl(client, command, { expiresIn });

    return url;

  } catch (error) {
    console.error("Error generating presigned upload URL:", error);
    throw new Error(
      `Presigned upload URL generation failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Check if session recording exists in S3
 *
 * @param sessionId - Session identifier
 * @returns True if file exists, false otherwise
 */
export async function sessionRecordingExists(sessionId: string): Promise<boolean> {
  try {
    const client = getS3Client();
    const key = generateS3Key(sessionId, "events");

    const command = new HeadObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    });

    await client.send(command);
    return true;

  } catch (error: any) {
    if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

/**
 * Delete session recording from S3
 * Use with caution - this is irreversible
 *
 * @param sessionId - Session identifier
 */
export async function deleteSessionRecording(sessionId: string): Promise<void> {
  try {
    const client = getS3Client();
    const key = generateS3Key(sessionId, "events");

    const command = new DeleteObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    });

    await client.send(command);

  } catch (error) {
    console.error("Error deleting session recording from S3:", error);
    throw new Error(
      `S3 deletion failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Upload code snapshots separately for efficient access
 *
 * @param sessionId - Session identifier
 * @param snapshots - Array of code snapshots
 * @returns Upload result
 */
export async function uploadCodeSnapshots(
  sessionId: string,
  snapshots: any[]
): Promise<UploadResult> {
  try {
    const client = getS3Client();
    const key = generateS3Key(sessionId, "snapshots");

    const originalSize = Buffer.byteLength(JSON.stringify(snapshots), "utf8");
    const compressedBuffer = compressData(snapshots);
    const compressedSize = compressedBuffer.length;

    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: compressedBuffer,
      ContentType: "application/json",
      ContentEncoding: "gzip",
      Metadata: {
        sessionId,
        snapshotCount: String(snapshots.length),
        originalSize: String(originalSize),
      },
    });

    const response = await client.send(command);

    return {
      bucket: S3_BUCKET,
      key,
      size: originalSize,
      compressedSize,
      compressionRatio: originalSize / compressedSize,
      url: `s3://${S3_BUCKET}/${key}`,
      etag: response.ETag,
    };

  } catch (error) {
    console.error("Error uploading code snapshots to S3:", error);
    throw new Error(
      `Code snapshots upload failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Test S3 connection and permissions
 */
export async function testConnection(): Promise<boolean> {
  try {
    const client = getS3Client();
    const testKey = `health-check/${Date.now()}.txt`;

    // Try to upload a small test file
    await client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: testKey,
        Body: Buffer.from("health check"),
      })
    );

    // Clean up test file
    await client.send(
      new DeleteObjectCommand({
        Bucket: S3_BUCKET,
        Key: testKey,
      })
    );

    return true;
  } catch (error) {
    console.error("S3 connection test failed:", error);
    return false;
  }
}

/**
 * Get storage statistics for a session
 */
export async function getStorageStats(sessionId: string): Promise<{
  exists: boolean;
  size?: number;
  compressedSize?: number;
  lastModified?: Date;
}> {
  try {
    const client = getS3Client();
    const key = generateS3Key(sessionId, "events");

    const command = new HeadObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    });

    const response = await client.send(command);

    return {
      exists: true,
      size: parseInt(response.Metadata?.originalSize || "0", 10),
      compressedSize: response.ContentLength,
      lastModified: response.LastModified,
    };

  } catch (error: any) {
    if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
      return { exists: false };
    }
    throw error;
  }
}
