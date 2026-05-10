# Sprint 2 - File Creation Feature Test Script

## Setup
```bash
cd C:\Users\adith\dev\loop-ai\worktrees\sprint2-file-creation
# Ensure backend is running
cd backend
uvicorn app.main:app --reload --port 4000
```

## Test 1: Create file via AI prompt (basic)
```
Send in chat: "create a file called hello.py with def hello: print('hello world')"
```

## Test 2: Create file without content (should fail gracefully)
```
Send: "make a new file config.yaml"
Expected: Error message saying no content provided
```

## Test 3: Create different file types
```
"create notes.txt with some random notes"
"create data.json with {"key": "value"}"
"create style.css with body { margin: 0; }"
"create readme.md with # My Project"
```

## Test 4: Verify files in Supabase
```sql
SELECT id, name, content_type, source, metadata_status 
FROM files 
WHERE source = 'generated' 
ORDER BY created_at DESC;
```

## Test 5: Test append endpoint directly
```bash
# Get a file ID from Test 4
curl -X POST http://localhost:4000/api/files/{file_id}/append \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "section_title": "New Section",
    "section_content": "This is appended content",
    "workspace_id": "your-workspace-id"
  }'
```

## Test 6: Duplicate filename handling
```
Send: "create test.txt with content A"
Send: "create test.txt with content B"
Expected: Both created with different IDs
```

## Expected Results
- [ ] Files created via prompt appear in Supabase `files` table
- [ ] MIME types are correct (.py = text/x-python, .json = application/json, etc.)
- [ ] Empty content returns error gracefully
- [ ] Append works via REST API
