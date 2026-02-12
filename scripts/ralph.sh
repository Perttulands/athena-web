#!/bin/bash
# ralph.sh - Execute PRD using bash loop (fresh session per iteration)
# Usage: ./ralph.sh <project-name> [max-iterations] [sleep-seconds] [model]
# Example: ./ralph.sh finance_calc 20 2 haiku
#
# Use for PRDs with >20 tasks (fresh session avoids context bloat)
# For <20 tasks, use ralph-native.sh (native Tasks, single session)

set -e

PROJECT="${1:?Usage: ralph.sh <project-name> [max-iterations] [sleep-seconds] [model]}"
MAX=${2:-10}
SLEEP=${3:-2}
MODEL=${4:-"sonnet"}

PROJECT_UPPER=$(echo "$PROJECT" | tr '[:lower:]' '[:upper:]')
PRD_FILE="PRD_${PROJECT_UPPER}.md"
PROGRESS_FILE="progress_${PROJECT}.txt"

# Get sprint number for a given task ID (e.g., US-001 -> 1, US-REVIEW-S2 -> 2)
get_sprint_for_task() {
    local task_id="$1"
    local prd_file="$2"

    # Extract sprint number from review tasks (US-REVIEW-S1 -> 1)
    if [[ "$task_id" =~ US-REVIEW-S([0-9]+) ]]; then
        echo "${BASH_REMATCH[1]}"
        return
    fi

    # For regular tasks, find which sprint section contains the task
    # Read PRD and track current sprint number
    local current_sprint=0
    while IFS= read -r line; do
        # Detect sprint header: ## Sprint N:
        if [[ "$line" =~ ^##[[:space:]]+Sprint[[:space:]]+([0-9]+): ]]; then
            current_sprint="${BASH_REMATCH[1]}"
        fi
        # Found the task in current sprint
        if [[ "$line" =~ \*\*${task_id}\*\* ]]; then
            echo "$current_sprint"
            return
        fi
    done < "$prd_file"

    echo "0"  # Not found
}

# Check if this is the first task in a sprint (first [ ] task after sprint header)
is_first_task_in_sprint() {
    local task_id="$1"
    local sprint_num="$2"
    local prd_file="$3"

    local in_sprint=0
    while IFS= read -r line; do
        # Detect target sprint header
        if [[ "$line" =~ ^##[[:space:]]+Sprint[[:space:]]+${sprint_num}: ]]; then
            in_sprint=1
            continue
        fi
        # Detect next sprint header (exit)
        if [[ $in_sprint -eq 1 && "$line" =~ ^##[[:space:]]+Sprint[[:space:]]+[0-9]+: ]]; then
            break
        fi
        # In target sprint, find first incomplete task
        if [[ $in_sprint -eq 1 && "$line" =~ ^-[[:space:]]\[[[:space:]]\][[:space:]]\*\*([A-Z0-9-]+)\*\* ]]; then
            local found_task="${BASH_REMATCH[1]}"
            if [[ "$found_task" == "$task_id" ]]; then
                echo "1"
            else
                echo "0"
            fi
            return
        fi
    done < "$prd_file"

    echo "0"
}

# Check if all tasks in a sprint are complete
is_sprint_complete() {
    local sprint_num="$1"
    local prd_file="$2"

    local in_sprint=0
    while IFS= read -r line; do
        # Detect target sprint header
        if [[ "$line" =~ ^##[[:space:]]+Sprint[[:space:]]+${sprint_num}: ]]; then
            in_sprint=1
            continue
        fi
        # Detect next sprint header (exit)
        if [[ $in_sprint -eq 1 && "$line" =~ ^##[[:space:]]+Sprint[[:space:]]+[0-9]+: ]]; then
            break
        fi
        # In target sprint, check for any incomplete task
        if [[ $in_sprint -eq 1 && "$line" =~ ^-[[:space:]]\[[[:space:]]\] ]]; then
            echo "0"
            return
        fi
    done < "$prd_file"

    echo "1"
}

# Update sprint status in PRD file
update_sprint_status() {
    local sprint_num="$1"
    local new_status="$2"
    local prd_file="$3"

    # Use sed to update the Status line for the specific sprint
    # Pattern: Find "## Sprint N:" then update the next "**Status:**" line
    sed -i.bak -E "/^## Sprint ${sprint_num}:/,/^## Sprint [0-9]+:|^---$/{
        s/(\*\*Status:\*\*) (NOT STARTED|IN PROGRESS|COMPLETE)/\1 ${new_status}/
    }" "$prd_file" && rm -f "${prd_file}.bak"
}

# Validate PRD exists
if [[ ! -f "$PRD_FILE" ]]; then
    echo "Error: $PRD_FILE not found"
    exit 1
fi

# Initialize progress file if empty/missing
if [[ ! -s "$PROGRESS_FILE" ]]; then
    cat > "$PROGRESS_FILE" << 'EOF'
# Progress Log

## Learnings
(Patterns discovered during implementation)

---
EOF
fi

echo "==========================================="
echo "  Ralph - Bash Loop Mode"
echo "  Project: $PROJECT"
echo "  PRD: $PRD_FILE"
echo "  Progress: $PROGRESS_FILE"
echo "  Max iterations: $MAX"
echo "  Model: $MODEL"
echo "==========================================="
echo ""

for ((i=1; i<=$MAX; i++)); do
    echo "==========================================="
    echo "  Iteration $i of $MAX"
    echo "==========================================="

    # Pre-iteration: Detect current task and update sprint status to IN PROGRESS if needed
    current_task=$(grep -m1 "^- \[ \] \*\*US-" "$PRD_FILE" | sed -E 's/.*\*\*([A-Z0-9-]+)\*\*.*/\1/' || true)
    if [[ -n "$current_task" ]]; then
        sprint_num=$(get_sprint_for_task "$current_task" "$PRD_FILE")
        if [[ "$sprint_num" != "0" ]]; then
            is_first=$(is_first_task_in_sprint "$current_task" "$sprint_num" "$PRD_FILE")
            if [[ "$is_first" == "1" ]]; then
                # Check if sprint status is NOT STARTED
                if grep -A5 "^## Sprint ${sprint_num}:" "$PRD_FILE" | grep -q "\*\*Status:\*\* NOT STARTED"; then
                    echo "  >> Sprint $sprint_num: NOT STARTED -> IN PROGRESS"
                    update_sprint_status "$sprint_num" "IN PROGRESS" "$PRD_FILE"
                fi
            fi
        fi
    fi

    result=$(claude --model "$MODEL" --dangerously-skip-permissions -p "You are Ralph, an autonomous coding agent. Do exactly ONE task per iteration.

## CRITICAL: No Planning Mode

Do NOT use the EnterPlanMode tool. The PRD already contains detailed implementation instructions.
Just read the task details and implement directly using TDD (RED-GREEN-VERIFY).
Planning adds unnecessary complexity and can cause tool confusion.

## Task Type Detection

First, read $PRD_FILE and find the first incomplete task (marked [ ]).

Check the task line:
- **Regular task**: - [ ] **US-001** Create database (10 min)
- **Review task**: - [ ] **US-REVIEW-S1** Foundation Review (5 min) (any task with 'REVIEW' in ID)

If task title contains 'REVIEW', follow the Review Task Process below.
Otherwise, follow the Regular Task Process.

---

## Regular Task Process

### Steps
1. Read $PRD_FILE and find the first task that is NOT complete (marked [ ]).
2. Read $PROGRESS_FILE - check the Learnings section first for patterns from previous iterations.
3. Implement that ONE task only using TDD methodology.
4. Run tests/typecheck to verify it works.

## Critical: Only Complete If Tests Pass

- When ALL work for the task is done and tests pass:
  - Mark the task complete: change \`- [ ]\` to \`- [x]\`
  - Commit your changes with message: feat: [task description]
  - Append what worked to the BOTTOM of $PROGRESS_FILE (after the --- separator)
  - VERIFY progress notes written: Run \`tail -10 $PROGRESS_FILE\` and confirm your notes appear

- If tests FAIL:
  - Do NOT mark any acceptance criteria [x]
  - Do NOT mark the task header complete
  - Do NOT commit broken code
  - Append what went wrong to the BOTTOM of $PROGRESS_FILE (after the --- separator) (so next iteration can learn)

### Verify Files Exist Before Completing

Before marking ANY task [x], run these verification commands:
1. \`ls -la <implementation_file>\` - MUST show file exists with size > 0
2. \`ls -la <test_file>\` - MUST show test file exists with size > 0
3. \`pytest <test_file> -v\` - MUST show actual test output with pass/fail counts

If ANY verification fails:
- The task is NOT complete
- Create the missing file first
- Do NOT mark [x] until files physically exist

## Progress Notes Format

CRITICAL: Output the COMPLETE block below to BOTH destinations:
1. Append to the BOTTOM of $PROGRESS_FILE (after the \`---\` separator)
2. Output the SAME COMPLETE block to console

Use this EXACT format (including BOTH the iteration details AND the summary):

\`\`\`
## Iteration [N] - [Task Name]
- What was implemented
- Files changed
- Learnings for future iterations:
  - Patterns discovered
  - Gotchas encountered
  - Useful context

**Summary:**
- Task: [US-XXX: Title]
- Files: [list of files changed]
- Tests: [PASS/FAIL with count]
- Review: [PASSED/ISSUES/SKIPPED]
- Next: [next task or COMPLETE]
---
\`\`\`

DO NOT split this output - the iteration details AND summary must appear together in BOTH places.

## Per-Task Linus Review (Quick)

After completing a regular task, run a quick review:

1. Read $PRD_FILE to understand what was implemented in this task
2. Review all code files created/modified (check git log/diff)
3. Apply Linus's criteria from linus-prompt-code-review.md
   - Good taste: Is the code simple and elegant?
   - No special cases: Edge cases handled through design, not if/else patches?
   - Data structures: Appropriate for the problem?
   - Complexity: Can anything be simplified?
   - Duplication: Any copy-pasted code that should be extracted?

### If Issues Found

Insert fix tasks into $PRD_FILE:
- Add AFTER the task you just completed
- Add BEFORE the next task
- Use format: - [ ] **US-XXXa** Fix description (5 min)
- Number sequentially (a, b, c, etc.)

Example:
\`\`\`
- [x] **US-004** Last completed task (10 min)
- [ ] **US-004a** Fix duplicated auth logic (5 min)    <-- INSERT HERE
- [ ] **US-005** Next task (10 min)
\`\`\`

After inserting:
- Append review findings to the BOTTOM of $PROGRESS_FILE (after the --- separator)
- Output: <review-issues-found/>

### If No Issues

- FIRST: Output the FULL progress notes block (see Progress Notes Format above) to BOTH:
  1. Append to the BOTTOM of $PROGRESS_FILE (after the --- separator)
  2. Output to console (so user sees what was done)
- THEN: Output: <review-passed/>

---

## Review Task Process (For Tasks With 'REVIEW' In Title)

When you encounter a review task (e.g., US-REVIEW-PHASE1, US-FINAL-REVIEW):

### Steps

1. **Read the review task acceptance criteria** - it defines which tasks to review
2. **Identify review scope**: Note which US-XXX tasks are in scope (e.g., US-001 to US-003)
3. **Gather commits**: Run git log to find all commits for those tasks
4. **Review comprehensively**: Read ALL code files from the scope together
5. **Apply Linus's criteria** from linus-prompt-code-review.md:
   - Good taste across all reviewed tasks
   - No special cases
   - Consistent data structures
   - Minimal complexity
   - No duplication BETWEEN tasks
   - Components integrate cleanly
6. **Cross-task analysis**:
   - Check for duplicated patterns between tasks
   - Verify consistent naming/style across tasks
   - Validate data flows between components
   - Identify missing integration points

### If Issues Found

Insert fix tasks into $PRD_FILE:
- Add AFTER the original task that has the issue (e.g., US-002a after US-002)
- Add BEFORE the review task you're working on
- Use format: - [ ] **US-XXXa** Fix description (5 min)

Example:
\`\`\`
- [x] **US-002** Create API (10 min)
- [ ] **US-002a** Extract duplicated validation (5 min)  <-- INSERT HERE
- [x] **US-003** Add tests (10 min)
- [ ] **US-REVIEW-S1** Review tasks 1-3 (5 min)      <-- Current task
\`\`\`

After inserting:
- Append detailed review findings to the BOTTOM of $PROGRESS_FILE (after the --- separator)
- Output: <review-issues-found/>
- Do NOT mark the review task [x]

### If No Issues Found

- Append '## Review PASSED - [review task name]' with detailed findings to the BOTTOM of $PROGRESS_FILE (after the --- separator)
- VERIFY progress notes written: Run \`tail -20 $PROGRESS_FILE\` and confirm review notes appear
- Mark the review task [x] in $PRD_FILE
- Commit with: 'docs: [review task name] complete'
- Output: <review-passed/>

### Important

- Review scope is defined BY the task's acceptance criteria, not PRD structure
- Check interactions BETWEEN tasks, not just individual quality
- Only flag real problems that affect correctness or maintainability
- Each fix task must be completable in one iteration (~10 min)

## Update AGENTS.md (If Applicable)

If you discover a reusable pattern that future work should know about:
- Check if AGENTS.md exists in the project root
- Add patterns like: 'This codebase uses X for Y' or 'Always do Z when changing W'
- Only add genuinely reusable knowledge, not task-specific details

## End Condition

CRITICAL: Before outputting <promise>COMPLETE</promise>:
1. Read $PRD_FILE from top to bottom
2. Search for ANY remaining \`- [ ]\` task lines
3. Only output COMPLETE if EVERY task line is marked \`- [x]\`
4. If even ONE task line has \`- [ ]\`, do NOT output COMPLETE

After completing your task:
- If ALL task headers are [x]: output <promise>COMPLETE</promise>
- If any task headers remain [ ]: just end (next iteration continues)")

    echo "$result"
    echo ""

    # Post-iteration: Check if sprint is now complete and update status
    if [[ -n "$current_task" && "$sprint_num" != "0" ]]; then
        sprint_complete=$(is_sprint_complete "$sprint_num" "$PRD_FILE")
        if [[ "$sprint_complete" == "1" ]]; then
            # Check if sprint status is IN PROGRESS (not already COMPLETE)
            if grep -A5 "^## Sprint ${sprint_num}:" "$PRD_FILE" | grep -q "\*\*Status:\*\* IN PROGRESS"; then
                echo "  >> Sprint $sprint_num: IN PROGRESS -> COMPLETE"
                update_sprint_status "$sprint_num" "COMPLETE" "$PRD_FILE"
            fi
        fi
    fi

    if [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then
        # Validate: count incomplete task headers with grep
        # Note: Manual tasks (US-MANUAL-*) don't have [ ] so are naturally excluded
        incomplete=$(grep -c "^- \[ \] \*\*US-" $PRD_FILE 2>/dev/null || true)
        incomplete=${incomplete:-0}

        if [[ "$incomplete" -gt 0 ]]; then
            echo ""
            echo "==========================================="
            echo "  WARNING: COMPLETE signal rejected"
            echo "  Found $incomplete incomplete task header(s)"
            echo "  Continuing to next iteration..."
            echo "==========================================="
            sleep $SLEEP
            continue
        fi

        echo "==========================================="
        echo "  All tasks complete after $i iterations!"
        echo "==========================================="
        exit 0
    fi

    sleep $SLEEP
done

echo "==========================================="
echo "  Reached max iterations ($MAX)"
echo "==========================================="
exit 1
