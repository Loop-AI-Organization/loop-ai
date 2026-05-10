# Sprint 2 - File Query Feature Test Script

## Setup
```bash
cd C:\Users\adith\dev\loop-ai\worktrees\sprint2-file-query
cd backend
uvicorn app.main:app --reload --port 4000
```

## Prerequisites: Create test files with known content
```
Send: "create python_hints.py with 
def hello():
    return 'Hello World'
    
def goodbye():
    return 'Goodbye World'"

Send: "create facts.txt with 
- The sun is a star
- Water is H2O
- Python is a programming language"
```

## Test 1: Query single file via UI
1. Go to Inspector → Files tab
2. Check the checkbox for python_hints.py
3. Type in query bar: "what function returns Hello World?"
4. Expected: Answer correctly identifies `hello()` function

## Test 2: Query with exact content match
1. Select facts.txt
2. Query: "what is water?"
3. Expected: "H2O" in response

## Test 3: Query with negation
1. Select facts.txt
2. Query: "which is NOT a programming language"
3. Expected: Response correctly identifies non-programming items

## Test 4: Query multiple files
1. Select both python_hints.py and facts.txt
2. Query: "tell me about functions and facts"
3. Expected: Responses from both files

## Test 5: Edge case - query about non-existent info
1. Select python_hints.py
2. Query: "who is the president of France?"
3. Expected: Graceful response saying file doesn't contain this info

## Test 6: Long content handling
1. Create a file with 1000+ words
2. Query about something in the middle
3. Expected: Correctly finds and references content

## Test 7: Streaming endpoint
```bash
curl -X POST http://localhost:4000/api/files/query/stream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "file_ids": ["file-uuid-here"],
    "question": "what functions are defined?"
  }'
```
Expected: SSE streaming response

## Test 8: Error handling
- [ ] Empty file_ids → error message
- [ ] Empty question → error message
- [ ] Non-existent file → skipped gracefully

## Expected Results
- [ ] Answers are contextually accurate to file content
- [ ] Streaming works for long responses
- [ ] Errors logged properly in backend console
- [ ] Multi-file query aggregates context correctly
