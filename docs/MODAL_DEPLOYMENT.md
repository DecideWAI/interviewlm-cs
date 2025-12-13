# Modal Deployment Guide

## Prerequisites

1. Install Modal CLI:
```bash
pip install modal
```

2. Create Modal account and authenticate:
```bash
modal setup
```

## Deployment Steps

### 1. Deploy the Modal Function

```bash
modal deploy modal_executor.py
```

This will output URLs for the endpoints. You'll see something like:
```
✓ Created web function execute => https://your-username--interviewlm-executor-execute.modal.run
✓ Created web function write_file => https://your-username--interviewlm-executor-write-file.modal.run
✓ Created web function read_file => https://your-username--interviewlm-executor-read-file.modal.run
✓ Created web function list_files => https://your-username--interviewlm-executor-list-files.modal.run
```

### 2. Update Environment Variables

Add these to your `.env` file:

```bash
# Modal Code Execution
MODAL_EXECUTE_URL="https://your-username--interviewlm-executor-execute.modal.run"
MODAL_WRITE_FILE_URL="https://your-username--interviewlm-executor-write-file.modal.run"
MODAL_READ_FILE_URL="https://your-username--interviewlm-executor-read-file.modal.run"
MODAL_LIST_FILES_URL="https://your-username--interviewlm-executor-list-files.modal.run"
```

### 3. Test the Deployment

Run the integration test:

```bash
npm run test:modal
```

Or test manually:

```bash
curl -X POST https://your-username--interviewlm-executor-execute.modal.run \
  -H "Content-Type: application/json" \
  -d '{
    "code": "def solution(x):\n    return x * 2",
    "testCases": [
      {"name": "test_double", "input": {"x": 5}, "expected": 10, "hidden": false}
    ],
    "language": "python"
  }'
```

Expected response:
```json
{
  "success": true,
  "testResults": [
    {
      "name": "test_double",
      "passed": true,
      "output": "",
      "error": null,
      "duration": 50,
      "hidden": false
    }
  ],
  "totalTests": 1,
  "passedTests": 1,
  "failedTests": 0,
  "executionTime": 150
}
```

## Monitoring

View logs:
```bash
modal logs interviewlm-executor
```

View app status:
```bash
modal app list
```

## Cost Optimization

Modal charges for:
- Compute time (pay-per-use)
- Storage (Modal Volumes)

To optimize costs:
1. Set appropriate timeouts (currently 30s for execution, 10s for file ops)
2. Use volume compression for large file storage
3. Clean up old session files periodically

## Production Considerations

1. **Secrets Management**: Store API keys in Modal Secrets
2. **Rate Limiting**: Implement request rate limiting
3. **Monitoring**: Set up alerts for failures
4. **Backups**: Regular backups of Modal Volume data
5. **Auto-scaling**: Modal handles this automatically

## Troubleshooting

### "Module not found" errors
- Redeploy with updated dependencies in `modal_executor.py`

### Timeout errors
- Increase timeout limits in the `@app.function()` decorator
- Optimize test code execution

### Volume permission errors
- Ensure volume is created: `modal volume create interviewlm-sessions`
- Check volume status: `modal volume list`

## Security

The Modal sandbox provides:
- ✅ Network isolation
- ✅ File system isolation per session
- ✅ Resource limits (CPU, memory, time)
- ✅ Automatic cleanup after execution

**DO NOT** store sensitive data in Modal Volumes without encryption.
