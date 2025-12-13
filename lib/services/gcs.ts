/**
 * Google Cloud Storage Service
 *
 * Handles storage and retrieval of file content for session replay.
 * Uses content-addressed storage (checksum-based paths) for deduplication.
 *
 * Features:
 * - Content-addressed storage: same content = same checksum = stored once
 * - Gzip compression for efficient storage
 * - Signed URLs for direct browser access
 * - Batch operations for multiple files
 */

import { Storage } from "@google-cloud/storage";
import * as pako from "pako";
import * as crypto from "crypto";

// Configuration
const GCS_BUCKET = process.env.GCS_BUCKET || "interviewlm-sessions";
const SIGNED_URL_EXPIRY = 3600; // 1 hour in seconds

// Storage instance (lazy initialization)
let storage: Storage | null = null;

/**
 * Get or create Storage instance
 * Uses GOOGLE_APPLICATION_CREDENTIALS env var for authentication
 */
function getStorage(): Storage {
  if (!storage) {
    storage = new Storage({
      projectId: process.env.GOOGLE_CLOUD_PROJECT,
      // In GCP environments, credentials are auto-detected
      // Locally, set GOOGLE_APPLICATION_CREDENTIALS env var
    });
  }
  return storage;
}

/**
 * Generate content-addressed file path
 * Format: sessions/{candidateId}/files/{checksum}.gz
 */
function getFilePath(candidateId: string, checksum: string): string {
  return `sessions/${candidateId}/files/${checksum}.gz`;
}

/**
 * Calculate SHA-256 checksum of content
 */
export function calculateChecksum(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * Upload result metadata
 */
export interface UploadResult {
  checksum: string;
  size: number;
  compressedSize: number;
  path: string;
  alreadyExists: boolean;
}

/**
 * Upload file content to GCS with gzip compression
 *
 * Uses content-addressed storage: if the same content exists, skips upload.
 * Returns the checksum that can be used to retrieve the content later.
 *
 * @param candidateId - Candidate identifier for path organization
 * @param content - File content to store
 * @returns Upload result with checksum and size info
 *
 * @example
 * ```typescript
 * const result = await uploadFileContent("cand_123", "function hello() {}");
 * console.log(`Stored with checksum: ${result.checksum}`);
 * ```
 */
export async function uploadFileContent(
  candidateId: string,
  content: string
): Promise<UploadResult> {
  const checksum = calculateChecksum(content);
  const path = getFilePath(candidateId, checksum);

  try {
    const bucket = getStorage().bucket(GCS_BUCKET);
    const file = bucket.file(path);

    // Check if already exists (deduplication)
    const [exists] = await file.exists();
    if (exists) {
      return {
        checksum,
        size: content.length,
        compressedSize: 0,
        path,
        alreadyExists: true,
      };
    }

    // Compress content
    const compressed = pako.gzip(content, { level: 9 });
    const compressedBuffer = Buffer.from(compressed);

    // Upload to GCS
    await file.save(compressedBuffer, {
      contentType: "application/gzip",
      metadata: {
        originalSize: String(content.length),
        checksum,
      },
    });

    return {
      checksum,
      size: content.length,
      compressedSize: compressedBuffer.length,
      path,
      alreadyExists: false,
    };
  } catch (error) {
    console.error("[GCS] Error uploading file content:", error);
    throw new Error(
      `GCS upload failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Download and decompress file content from GCS
 *
 * @param candidateId - Candidate identifier
 * @param checksum - Content checksum
 * @returns Decompressed file content
 *
 * @example
 * ```typescript
 * const content = await downloadFileContent("cand_123", "abc123...");
 * ```
 */
export async function downloadFileContent(
  candidateId: string,
  checksum: string
): Promise<string> {
  const path = getFilePath(candidateId, checksum);

  try {
    const bucket = getStorage().bucket(GCS_BUCKET);
    const file = bucket.file(path);

    const [buffer] = await file.download();
    const decompressed = pako.ungzip(buffer, { to: "string" });

    return decompressed;
  } catch (error) {
    console.error("[GCS] Error downloading file content:", error);
    throw new Error(
      `GCS download failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Generate a signed URL for direct browser download
 *
 * Signed URLs allow the browser to fetch directly from GCS
 * without proxying through the API server (faster).
 *
 * @param candidateId - Candidate identifier
 * @param checksum - Content checksum
 * @param expiresIn - URL expiry time in seconds (default: 1 hour)
 * @returns Signed download URL
 */
export async function getSignedDownloadUrl(
  candidateId: string,
  checksum: string,
  expiresIn: number = SIGNED_URL_EXPIRY
): Promise<string> {
  const path = getFilePath(candidateId, checksum);

  try {
    const bucket = getStorage().bucket(GCS_BUCKET);
    const file = bucket.file(path);

    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + expiresIn * 1000,
    });

    return url;
  } catch (error) {
    console.error("[GCS] Error generating signed URL:", error);
    throw new Error(
      `Signed URL generation failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Batch get signed URLs for multiple files
 *
 * Efficiently fetches signed URLs for multiple checksums in parallel.
 *
 * @param candidateId - Candidate identifier
 * @param checksums - Array of content checksums
 * @returns Map of checksum to signed URL
 *
 * @example
 * ```typescript
 * const urls = await getBatchSignedUrls("cand_123", ["abc...", "def..."]);
 * const url1 = urls.get("abc...");
 * ```
 */
export async function getBatchSignedUrls(
  candidateId: string,
  checksums: string[]
): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  // Fetch in parallel for efficiency
  await Promise.all(
    checksums.map(async (checksum) => {
      try {
        const url = await getSignedDownloadUrl(candidateId, checksum);
        results.set(checksum, url);
      } catch (error) {
        console.error(`[GCS] Failed to get signed URL for ${checksum}:`, error);
        // Don't add to results, let caller handle missing entries
      }
    })
  );

  return results;
}

/**
 * Check if file content exists in GCS
 *
 * @param candidateId - Candidate identifier
 * @param checksum - Content checksum
 * @returns True if file exists
 */
export async function fileContentExists(
  candidateId: string,
  checksum: string
): Promise<boolean> {
  const path = getFilePath(candidateId, checksum);

  try {
    const bucket = getStorage().bucket(GCS_BUCKET);
    const file = bucket.file(path);
    const [exists] = await file.exists();
    return exists;
  } catch (error) {
    console.error("[GCS] Error checking file existence:", error);
    return false;
  }
}

/**
 * Delete file content from GCS
 *
 * Use with caution - this is typically not needed due to content addressing.
 * If multiple files share the same content, deleting breaks all references.
 *
 * @param candidateId - Candidate identifier
 * @param checksum - Content checksum
 */
export async function deleteFileContent(
  candidateId: string,
  checksum: string
): Promise<void> {
  const path = getFilePath(candidateId, checksum);

  try {
    const bucket = getStorage().bucket(GCS_BUCKET);
    const file = bucket.file(path);
    await file.delete();
  } catch (error) {
    console.error("[GCS] Error deleting file content:", error);
    throw new Error(
      `GCS deletion failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Upload multiple files in parallel
 *
 * @param candidateId - Candidate identifier
 * @param files - Array of {fileName, content} objects
 * @returns Map of fileName to upload result
 */
export async function uploadMultipleFiles(
  candidateId: string,
  files: Array<{ fileName: string; content: string }>
): Promise<Map<string, UploadResult>> {
  const results = new Map<string, UploadResult>();

  await Promise.all(
    files.map(async ({ fileName, content }) => {
      try {
        const result = await uploadFileContent(candidateId, content);
        results.set(fileName, result);
      } catch (error) {
        console.error(`[GCS] Failed to upload ${fileName}:`, error);
      }
    })
  );

  return results;
}

/**
 * Get storage bucket name (for debugging/monitoring)
 */
export function getBucketName(): string {
  return GCS_BUCKET;
}

/**
 * Test GCS connection and permissions
 */
export async function testConnection(): Promise<boolean> {
  try {
    const bucket = getStorage().bucket(GCS_BUCKET);
    const [exists] = await bucket.exists();

    if (!exists) {
      console.error(`[GCS] Bucket ${GCS_BUCKET} does not exist`);
      return false;
    }

    // Try to list files (requires storage.objects.list permission)
    await bucket.getFiles({ maxResults: 1 });

    return true;
  } catch (error) {
    console.error("[GCS] Connection test failed:", error);
    return false;
  }
}
