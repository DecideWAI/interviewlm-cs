output "recordings_bucket_id" {
  description = "ID of the session recordings bucket"
  value       = aws_s3_bucket.recordings.id
}

output "recordings_bucket_arn" {
  description = "ARN of the session recordings bucket"
  value       = aws_s3_bucket.recordings.arn
}

output "recordings_bucket_domain_name" {
  description = "Domain name of the recordings bucket"
  value       = aws_s3_bucket.recordings.bucket_domain_name
}

output "uploads_bucket_id" {
  description = "ID of the user uploads bucket"
  value       = aws_s3_bucket.uploads.id
}

output "uploads_bucket_arn" {
  description = "ARN of the user uploads bucket"
  value       = aws_s3_bucket.uploads.arn
}

output "uploads_bucket_domain_name" {
  description = "Domain name of the uploads bucket"
  value       = aws_s3_bucket.uploads.bucket_domain_name
}

output "kms_key_id" {
  description = "ID of the KMS key used for S3 encryption"
  value       = aws_kms_key.s3.key_id
}

output "kms_key_arn" {
  description = "ARN of the KMS key used for S3 encryption"
  value       = aws_kms_key.s3.arn
}

output "s3_access_policy_arn" {
  description = "ARN of the IAM policy for S3 access"
  value       = aws_iam_policy.s3_access.arn
}

output "bucket_names" {
  description = "Map of bucket names"
  value = {
    recordings = aws_s3_bucket.recordings.id
    uploads    = aws_s3_bucket.uploads.id
  }
}
