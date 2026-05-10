# Sprint 2 - File Search Feature Test Script

## Setup
```bash
cd C:\Users\adith\dev\loop-ai\worktrees\sprint2-file-search
# Ensure backend is running
cd backend
uvicorn app.main:app --reload --port 4000
```

## Prerequisites: Create test files first
```
Send: "create finance_report.md with # Q1 Financial Report\nRevenue: $100K"
Send: "create meeting_notes.txt with Meeting about budget"
Send: "create project_plan.json with {"project": "LoopAI", "status": "active"}"
```

## Test 1: Keyword search in UI
1. Open Inspector Panel → Files tab
2. Type "finance" in search bar
3. Expected: finance_report.md appears at top

## Test 2: Multi-word search
1. Type "financial report"
2. Expected: finance_report.md ranked high

## Test 3: Partial match
1. Type "fin" or "repo"
2. Expected: finance_report.md appears (partial matching)

## Test 4: Tag-based search
1. Search for a tag that exists in your files
2. Expected: Files with matching tags ranked high

## Test 5: AI-powered search (toggle)
1. Click "AI" toggle in search bar
2. Type "find the document about finances"
3. Expected: LLM interprets intent and returns relevant files

## Test 6: Empty results
1. Search for something random like "xyzabc123"
2. Expected: Empty results message, no error

## Test 7: Verify scoring ranks correctly
1. Search for "meeting"
2. Create another file named "meeting_notes.txt" with different content
3. Search again - name matches should rank higher

## Test API directly
```bash
curl -X POST http://localhost:4000/api/files/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "workspace_id": "your-workspace-id",
    "query": "finance"
  }'
```

## Expected Results
- [ ] Keyword search returns relevant files
- [ ] AI toggle enables natural language understanding
- [ ] Results ranked by relevance (name > tag > summary > context)
- [ ] Empty query shows all files
