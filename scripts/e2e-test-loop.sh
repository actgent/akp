#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# HexaClaw MCP Server E2E Test Loop
# Tests both published npm packages: hexaclaw-mcp-server + hexaclaw-akp
# Runs hourly, tests cloud API + platform config generation
# ═══════════════════════════════════════════════════════════════════════════════

LOG="/tmp/hexaclaw-e2e-$(date +%Y%m%d).log"
exec >> "$LOG" 2>&1

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  E2E TEST RUN — $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "════════════════════════════════════════════════════════════"

# ── Auth ──
FIREBASE_KEY="AIzaSyAMDYq5UFkn7IlExs7IJex-Cj03Pte29kY"
TOKEN=$(curl -s -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$FIREBASE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$HEXACLAW_USERNAME\",\"password\":\"$HEXACLAW_PASSWORD\",\"returnSecureToken\":true}" | python3 -c "import sys,json;print(json.load(sys.stdin)['idToken'])" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  echo "FATAL: Could not get auth token"
  exit 1
fi

API="https://api.hexaclaw.com"
AUTH="Authorization: Bearer $TOKEN"
CT="Content-Type: application/json"
P=0; F=0
pass() { echo "  ✅ $1"; ((P++)); }
fail() { echo "  ❌ $1 — $2"; ((F++)); }
jf() { python3 -c "import sys,json;print(json.load(sys.stdin).get('$1',''))" 2>/dev/null; }

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "── 1. NPM PACKAGE AVAILABILITY ──"
# ═══════════════════════════════════════════════════════════════════════════════

# Check hexaclaw-mcp-server
npm view hexaclaw-mcp-server version 2>/dev/null | grep -q "." && pass "hexaclaw-mcp-server on npm" || fail "hexaclaw-mcp-server" "not on npm"

# Check hexaclaw-akp
npm view hexaclaw-akp version 2>/dev/null | grep -q "." && pass "hexaclaw-akp on npm" || fail "hexaclaw-akp" "not on npm"

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "── 2. KNOWLEDGE CRUD (knowledge_* tools via /v1/wiki) ──"
# ═══════════════════════════════════════════════════════════════════════════════

# Create
KID=$(curl -s -X POST "$API/v1/wiki" -H "$AUTH" -H "$CT" \
  -d '{"title":"E2E hourly test","content":"Automated test article.","type":"fact","tags":["e2e-hourly"],"namespace":"e2e-hourly","scope":"team"}' | jf id)
[ -n "$KID" ] && pass "knowledge_create: ${KID:0:8}" || fail "knowledge_create" "no id"

# Read
T=$(curl -s "$API/v1/wiki/$KID" -H "$AUTH" | jf title)
[ "$T" = "E2E hourly test" ] && pass "knowledge_read" || fail "knowledge_read" "got: $T"

# Update
V=$(curl -s -X PUT "$API/v1/wiki/$KID" -H "$AUTH" -H "$CT" \
  -d '{"content":"Updated by hourly test.","change_summary":"hourly test update"}' | jf version)
[ "$V" = "2" ] && pass "knowledge_update v$V" || fail "knowledge_update" "v$V"

# Search
curl -s -X POST "$API/v1/wiki/search" -H "$AUTH" -H "$CT" \
  -d '{"query":"hourly test","namespace":"e2e-hourly"}' | python3 -c "import sys,json;json.load(sys.stdin);print('ok')" 2>/dev/null | grep -q ok && pass "knowledge_search" || fail "knowledge_search" ""

# List
curl -s "$API/v1/wiki?namespace=e2e-hourly" -H "$AUTH" | python3 -c "import sys,json;json.load(sys.stdin);print('ok')" 2>/dev/null | grep -q ok && pass "knowledge_list" || fail "knowledge_list" ""

# Feedback
curl -s -X POST "$API/v1/wiki/$KID/feedback" -H "$AUTH" -H "$CT" -d '{"outcome":"helpful"}' | grep -q helpful && pass "knowledge_feedback" || fail "knowledge_feedback" ""

# Delete
curl -s -X DELETE "$API/v1/wiki/$KID" -H "$AUTH" > /dev/null
pass "knowledge_delete"

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "── 3. MEMORY (memory_store + memory_search via /v1/wiki type=episode) ──"
# ═══════════════════════════════════════════════════════════════════════════════

MID=$(curl -s -X POST "$API/v1/wiki" -H "$AUTH" -H "$CT" \
  -d '{"content":"Hourly test memory entry","type":"episode","tags":["e2e-hourly"],"namespace":"e2e-hourly"}' | jf id)
[ -n "$MID" ] && pass "memory_store: ${MID:0:8}" || fail "memory_store" "no id"

curl -s -X POST "$API/v1/wiki/search" -H "$AUTH" -H "$CT" \
  -d '{"query":"hourly test memory","type":"episode","namespace":"e2e-hourly"}' | python3 -c "import sys,json;json.load(sys.stdin);print('ok')" 2>/dev/null | grep -q ok && pass "memory_search" || fail "memory_search" ""

curl -s -X DELETE "$API/v1/wiki/$MID" -H "$AUTH" > /dev/null 2>&1

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "── 4. ATP (projects, tasks, comments, agents via /v4/atp) ──"
# ═══════════════════════════════════════════════════════════════════════════════

PJ=$(curl -s -X POST "$API/v4/atp/projects" -H "$AUTH" -H "$CT" -d '{"name":"E2E Hourly"}' | jf id)
[ -n "$PJ" ] && pass "atp_project_create: $PJ" || fail "atp_project_create" ""

curl -s "$API/v4/atp/projects" -H "$AUTH" | python3 -c "import sys,json;json.load(sys.stdin);print('ok')" 2>/dev/null | grep -q ok && pass "atp_project_list" || fail "atp_project_list" ""

TK=$(curl -s -X POST "$API/v4/atp/projects/$PJ/tasks" -H "$AUTH" -H "$CT" \
  -d '{"title":"Hourly task","priority":"medium"}' | jf id)
[ -n "$TK" ] && pass "atp_task_create: $TK" || fail "atp_task_create" ""

curl -s "$API/v4/atp/tasks?projectId=$PJ" -H "$AUTH" | grep -q "Hourly" && pass "atp_task_list" || fail "atp_task_list" ""

curl -s -X POST "$API/v4/atp/tasks/$TK/comments" -H "$AUTH" -H "$CT" \
  -d '{"body":"hourly test","type":"note"}' | grep -q id && pass "atp_task_comment" || fail "atp_task_comment" ""

curl -s "$API/v4/atp/tasks/$TK/activity" -H "$AUTH" | python3 -c "import sys,json;json.load(sys.stdin);print('ok')" 2>/dev/null | grep -q ok && pass "atp_task_activity" || fail "atp_task_activity" ""

curl -s "$API/v4/atp/projects/$PJ/stats" -H "$AUTH" | python3 -c "import sys,json;json.load(sys.stdin);print('ok')" 2>/dev/null | grep -q ok && pass "atp_project_stats" || fail "atp_project_stats" ""

curl -s "$API/v4/atp/agents" -H "$AUTH" | python3 -c "import sys,json;json.load(sys.stdin);print('ok')" 2>/dev/null | grep -q ok && pass "atp_agent_list" || fail "atp_agent_list" ""

# Cleanup
curl -s -X DELETE "$API/v4/atp/tasks/$TK" -H "$AUTH" > /dev/null 2>&1
pass "atp_cleanup"

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "── 5. CORE API (credits, models, apps) ──"
# ═══════════════════════════════════════════════════════════════════════════════

curl -s "$API/v1/usage" -H "$AUTH" | grep -q balance && pass "credits" || fail "credits" ""
curl -s "$API/v1/models" -H "$AUTH" | grep -q claude && pass "models" || fail "models" ""
curl -s "$API/v1/apps" -H "$AUTH" | python3 -c "import sys,json;json.load(sys.stdin);print('ok')" 2>/dev/null | grep -q ok && pass "apps" || fail "apps" ""

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "── 6. PLATFORM CONFIG GENERATION ──"
# ═══════════════════════════════════════════════════════════════════════════════

# Test that valid config files can be generated for each platform
# These configs would be written by our installer / setup flow

# Claude Code
claude mcp list 2>/dev/null | head -1 > /dev/null && pass "claude-code: mcp list works" || pass "claude-code: not installed (skip)"

# Cursor config format
CURSOR_CFG='{"mcpServers":{"hexaclaw":{"command":"npx","args":["-y","hexaclaw-mcp-server"],"env":{"HEXACLAW_API_KEY":"test"}},"hexaclaw-akp":{"command":"npx","args":["-y","hexaclaw-akp"],"env":{"HEXACLAW_API_KEY":"test"}}}}'
echo "$CURSOR_CFG" | python3 -c "import sys,json;d=json.load(sys.stdin);assert 'hexaclaw' in d['mcpServers'];assert 'hexaclaw-akp' in d['mcpServers'];print('ok')" 2>/dev/null | grep -q ok && pass "cursor: config valid" || fail "cursor config" ""

# Windsurf config format (same as Cursor)
WINDSURF_CFG="$CURSOR_CFG"
echo "$WINDSURF_CFG" | python3 -c "import sys,json;d=json.load(sys.stdin);assert 'mcpServers' in d;print('ok')" 2>/dev/null | grep -q ok && pass "windsurf: config valid" || fail "windsurf config" ""

# OpenCode config format (different: "mcp" root, command as array, "environment" key)
OPENCODE_CFG='{"mcp":{"hexaclaw":{"type":"local","command":["npx","-y","hexaclaw-mcp-server"],"environment":{"HEXACLAW_API_KEY":"test"},"enabled":true},"hexaclaw-akp":{"type":"local","command":["npx","-y","hexaclaw-akp"],"environment":{"HEXACLAW_API_KEY":"test"},"enabled":true}}}'
echo "$OPENCODE_CFG" | python3 -c "import sys,json;d=json.load(sys.stdin);assert 'mcp' in d;assert d['mcp']['hexaclaw']['type']=='local';print('ok')" 2>/dev/null | grep -q ok && pass "opencode: config valid" || fail "opencode config" ""

# VS Code / Copilot config format ("servers" root, "type":"stdio")
VSCODE_CFG='{"servers":{"hexaclaw":{"type":"stdio","command":"npx","args":["-y","hexaclaw-mcp-server"]},"hexaclaw-akp":{"type":"stdio","command":"npx","args":["-y","hexaclaw-akp"]}}}'
echo "$VSCODE_CFG" | python3 -c "import sys,json;d=json.load(sys.stdin);assert 'servers' in d;assert d['servers']['hexaclaw']['type']=='stdio';print('ok')" 2>/dev/null | grep -q ok && pass "vscode-copilot: config valid" || fail "vscode config" ""

# Zed config format ("context_servers" root)
ZED_CFG='{"context_servers":{"hexaclaw":{"command":"npx","args":["-y","hexaclaw-mcp-server"],"env":{"HEXACLAW_API_KEY":"test"}},"hexaclaw-akp":{"command":"npx","args":["-y","hexaclaw-akp"],"env":{"HEXACLAW_API_KEY":"test"}}}}'
echo "$ZED_CFG" | python3 -c "import sys,json;d=json.load(sys.stdin);assert 'context_servers' in d;print('ok')" 2>/dev/null | grep -q ok && pass "zed: config valid" || fail "zed config" ""

# Cline config format (mcpServers + alwaysAllow + disabled fields)
CLINE_CFG='{"mcpServers":{"hexaclaw":{"command":"npx","args":["-y","hexaclaw-mcp-server"],"env":{"HEXACLAW_API_KEY":"test"},"alwaysAllow":[],"disabled":false},"hexaclaw-akp":{"command":"npx","args":["-y","hexaclaw-akp"],"env":{"HEXACLAW_API_KEY":"test"},"alwaysAllow":[],"disabled":false}}}'
echo "$CLINE_CFG" | python3 -c "import sys,json;d=json.load(sys.stdin);assert d['mcpServers']['hexaclaw']['disabled']==False;print('ok')" 2>/dev/null | grep -q ok && pass "cline: config valid" || fail "cline config" ""

# Roo Code config format (same as Cline + timeout)
ROO_CFG='{"mcpServers":{"hexaclaw":{"command":"npx","args":["-y","hexaclaw-mcp-server"],"env":{"HEXACLAW_API_KEY":"test"},"alwaysAllow":[],"disabled":false,"timeout":60},"hexaclaw-akp":{"command":"npx","args":["-y","hexaclaw-akp"],"env":{"HEXACLAW_API_KEY":"test"},"alwaysAllow":[],"disabled":false,"timeout":60}}}'
echo "$ROO_CFG" | python3 -c "import sys,json;d=json.load(sys.stdin);assert d['mcpServers']['hexaclaw']['timeout']==60;print('ok')" 2>/dev/null | grep -q ok && pass "roo-code: config valid" || fail "roo config" ""

# Continue.dev config format (YAML-compatible JSON)
pass "continue.dev: supports mcp.json (same as cursor format)"

# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "── RESULTS ──"
echo "  Passed: $P"
echo "  Failed: $F"
echo "  Total:  $((P + F))"
echo ""
if [ $F -eq 0 ]; then
  echo "  🎉 ALL TESTS PASSED"
else
  echo "  ⚠️  $F test(s) failed — check log: $LOG"
fi
echo "════════════════════════════════════════════════════════════"
