# Architecture

This document describes the internal structure of Evolver: package layout, data flow, the evolution loop algorithm, frontier management, and plugin hook timing.

## Package Structure

```
evolver/
  packages/
    core/                  @evolver/core
    cli/                   @evolver/cli
    proposer/              @evolver/proposer
    skill-builder/         @evolver/skill-builder
    adapter-claude-code/   @evolver/adapter-claude-code
    adapter-cursor/        @evolver/adapter-cursor
    adapter-codex/         @evolver/adapter-codex
    plugin-memento/        @evolver/plugin-memento
  examples/
    claude-code/           Example task set
```

### Dependency Graph

```
@evolver/cli
  -> @evolver/core
  -> @evolver/proposer       -> @evolver/core
  -> @evolver/skill-builder  -> @evolver/core
  -> @evolver/adapter-*      -> @evolver/core
  -> @evolver/plugin-memento -> @evolver/core
```

`@evolver/core` defines all shared types and interfaces. Every other package depends on it. The CLI dynamically imports adapter and plugin packages at runtime based on command-line flags.

## Core Components

| Component | Package | Description |
|-----------|---------|-------------|
| `EvolutionLoop` | core | Main orchestrator. Runs the select-execute-propose-build-validate cycle. |
| `ParetoFrontier` | core | Fixed-capacity top-k program store with round-robin parent selection and lowest-score eviction. |
| `AdaptiveFrontier` | core | Extends `ParetoFrontier` with automatic capacity adjustment based on diversity metrics. |
| `FeedbackHistory` | core | Deduplicated log of all proposals, acceptance status, and score deltas. |
| `CostTracker` | core | Per-iteration token usage and USD cost accounting with budget limit enforcement. |
| `ConflictDetector` | core | Jaccard-similarity trigger overlap detection between skills. |
| `CrossModelTester` | core | Validates skill transfer across adapters; reports transfer rate percentage. |
| `LlmProposer` | proposer | Groups failures by error pattern, then calls an LLM to generate a `SkillProposal`. |
| `FailureAnalyzer` | proposer | Normalizes error strings and groups failures by `category::errorPattern`. O(n) single pass. |
| `SkillMaterializer` | skill-builder | Converts a `SkillProposal` into a concrete `Skill` (SKILL.md + optional scripts) via LLM. |
| `META_SKILL` | skill-builder | Bootstrap prompt template injected into the builder LLM's system prompt. |

## Data Flow

```
                        +------------------+
                        |   Task YAML      |
                        |  (train + val)   |
                        +--------+---------+
                                 |
                                 v
+----------+           +---------+----------+
| Adapter  | <-------> |   EvolutionLoop    |
| (execute)|           |                    |
+----------+           |  1. Select parent  |
                        |  2. Execute train  |
  +-----------+         |  3. Collect fails  |
  | Proposer  | <-----> |  4. Propose skill  |
  | (analyze) |         |  5. Build skill    |
  +-----------+         |  6. Validate       |
                        |  7. Update frontier|
  +-----------+         |                    |
  | Builder   | <-----> |  CostTracker       |
  | (SKILL.md)|         |  FeedbackHistory   |
  +-----------+         |  ParetoFrontier    |
                        +--------+-----------+
                                 |
                                 v
                        +--------+---------+
                        | EvolutionReport  |
                        | (best program,   |
                        |  frontier, cost) |
                        +------------------+
```

## EvolutionLoop Algorithm

Pseudocode for the main loop:

```
function evolve(trainTasks, valTasks, config, plugins):
    frontier  = new ParetoFrontier(config.frontier)
    history   = new FeedbackHistory()
    costTrack = new CostTracker(config.budgetLimit)

    // Phase 0: Baseline measurement
    baseline = Program(skills=[], generation=0)
    baseline.score = avg(executor.run(baseline, valTasks))
    frontier.update(baseline)

    // Phase 1: Evolution iterations
    for i in 0..config.maxIterations:
        plugins.onIterationStart(iteration=i, frontier, history, costSoFar)

        parent = frontier.selectParent()            // round-robin
        trainResults = executor.run(parent, trainTasks)
        costTrack.record(trainResults)

        failures = trainResults.filter(r => r.score < config.failureThreshold)
        if failures.empty: continue

        pluginCtx = plugins.onFailure(failures)     // e.g. memento recall

        proposal = proposer.propose(failures, history, pluginCtx)
        if history.isDuplicate(proposal): continue

        proposalCtx = plugins.onProposal(proposal)  // e.g. memento recall

        skill     = builder.build(proposal, parent.skills, proposalCtx)
        candidate = Program(skills=[...parent.skills, skill], generation=i+1)

        valResults      = executor.run(candidate, valTasks)
        candidate.score = avg(valResults)
        costTrack.record(valResults)

        accepted = frontier.update(candidate)
        history.log(proposal, accepted, scoreBefore=parent.score, scoreAfter=candidate.score)

        plugins.onEvaluation(candidate, accepted, delta)
        plugins.onFrontierUpdate(frontier)

        if costTrack.isOverBudget(): break

    // Phase 2: Report
    return EvolutionReport(frontier.best(), frontier, history, costTrack.total())
```

## ParetoFrontier

The frontier maintains the top-k programs by score.

**Update policy:**
- If `size < capacity`: unconditionally add.
- If `size == capacity`: replace the lowest-scoring program only if the new program scores higher.

**Parent selection:** Round-robin over the frontier entries. Each call advances an internal index modulo the frontier size.

**Eviction:** When a new program replaces the lowest-scoring entry, the round-robin index is reset if it would be out of bounds.

## AdaptiveFrontier

Extends `ParetoFrontier` with automatic capacity (k) adjustment based on diversity metrics. Called every 5 iterations by the loop.

**Adjustment rules:**

| Condition | Action | Rationale |
|-----------|--------|-----------|
| `skillOverlapRate > 0.6` | `k += 1` (up to `maxCapacity`) | Low diversity -- expand search space |
| `scoreVariance > 0.3 AND skillOverlapRate < 0.3` | `k -= 1` (down to `minCapacity`) | High diversity + variance -- focus |
| Otherwise | no change | Stable state |

**Diversity metrics:**

| Metric | Definition |
|--------|------------|
| `skillOverlapRate` | Fraction of skill names shared across frontier programs |
| `scoreVariance` | Variance of scores across frontier programs |
| `avgGeneration` | Mean generation number across frontier programs |

## Plugin Hook Timing

Plugins receive callbacks at five points in the evolution loop:

```
Iteration Start
    |
    v
onIterationStart(ctx)          -- iteration number, frontier snapshot, history, cost so far
    |
    v
Execute training tasks
    |
    v
Collect failures
    |
    v
onFailure(failures)            -- enrich with external context (e.g. recall past errors)
    |                             returns PluginContext merged into proposer call
    v
Propose skill
    |
    v
onProposal(proposal)           -- enrich with external context (e.g. recall past skills)
    |                             returns PluginContext merged into builder call
    v
Build & validate skill
    |
    v
onEvaluation(result)           -- persist outcome (e.g. remember skill evaluation)
    |
    v
onFrontierUpdate(frontier)     -- snapshot state (e.g. remember frontier)
    |
    v
Next iteration (or terminate)
```

Each hook is called sequentially across all registered plugins. The `onFailure` and `onProposal` hooks return `PluginContext` objects that are merged and forwarded to the proposer and builder respectively.

## Key Types

The core type hierarchy:

```
Task        -- input/expected/category/scorer
Program     -- id/generation/parentId/skills[]/score/branch
Skill       -- name/trigger/content/scripts?
SkillProposal -- action(create|edit)/skillName/trigger/description/rationale

ExecutionResult -- taskId/output/score/error?/tokenUsage?/durationMs
Failure         -- task + result (where score < threshold)

FeedbackEntry   -- iteration/proposal/accepted/scoreBefore/scoreAfter/delta
CostRecord      -- iteration/tokenUsage/costUsd/timestamp

EvolutionConfig -- maxIterations/epochs/failureThreshold/frontier/runs/budgetLimit/maxSkills
EvolutionReport -- bestProgram/frontier/iterations/totalCostUsd/history/durationMs
```

## Scoring

Adapters include built-in scorer functions:

| Scorer | Behavior |
|--------|----------|
| `exact-match` | Returns 1 if output === expected (deep JSON comparison), else 0 |
| `fuzzy` | Returns 1 for exact match, 0.5 if one contains the other (case-insensitive), else 0 |
| `llm-judge` | Delegates to an LLM for evaluation (adapter-specific) |
| `custom` | User-provided scoring function |

The scorer is resolved per-task: task-level `scorer` field overrides the `config.yaml` default.

## Cost Estimation

`CostTracker` accumulates per-iteration costs. The cost formula used in the Claude Code adapter:

```
costUsd = (inputTokens * 0.003 + outputTokens * 0.015) / 1000
```

When `--budget-limit` is set, the loop terminates after any iteration where `total > budgetLimit`.
