# @evolver/core

> Core types, interfaces, and orchestration engine for the Evolver skill evolution framework.

## Installation

```bash
pnpm add @evolver/core
```

## Usage

```typescript
import {
  EvolutionLoop,
  ParetoFrontier,
  AdaptiveFrontier,
  FeedbackHistory,
  CostTracker,
  ConflictDetector,
  CrossModelTester,
} from "@evolver/core";

// Run the evolution loop
const loop = new EvolutionLoop({
  executor,        // Executor implementation (e.g. ClaudeCodeExecutor)
  proposer,        // Proposer implementation (e.g. LlmProposer)
  skillBuilder,    // SkillBuilder implementation (e.g. SkillMaterializer)
  trainTasks,      // Task[] for training
  validationTasks, // Task[] for validation
  config: {
    maxIterations:    10,
    epochs:           1.5,
    failureThreshold: 0.5,
    frontier:         { capacity: 3, selectionStrategy: "round-robin" },
    runs:             3,
    budgetLimit:      5.0,
    maxSkills:        20,
  },
  plugins: [],     // Optional Plugin[] array
});

const report = await loop.run();
// report.bestProgram, report.frontier, report.totalCostUsd, ...
```

## API

### Types & Interfaces

| Type | Description |
|------|-------------|
| `Task` | Evaluation task with `id`, `input`, `expected`, optional `category` and `scorer` |
| `ExecutionResult` | Task execution result with `score`, `output`, `tokenUsage`, `durationMs` |
| `Failure` | A task + result pair where score fell below threshold |
| `Skill` | Skill definition with `name`, `trigger`, `content`, optional `scripts` |
| `SkillProposal` | Proposed skill change (`create` or `edit` action) |
| `Program` | A program (skill set) in the frontier with `id`, `generation`, `skills`, `score` |
| `FeedbackEntry` | History entry recording proposal outcome and score delta |
| `CostRecord` | Per-iteration token usage and USD cost |
| `Plugin` | Plugin interface with lifecycle hooks |
| `EvolutionConfig` | Full configuration for the evolution loop |
| `AdapterConfig` | Executor adapter configuration |
| `EvolutionReport` | Final report from an evolution run |
| `ConflictResult` | Skill conflict detection result |
| `CrossModelTestConfig` | Configuration for cross-model transfer testing |
| `CrossModelResult` | Cross-model test results with transfer rate |

### DI Interfaces

| Interface | Method |
|-----------|--------|
| `Executor` | `run(program: Program, tasks: Task[]): Promise<ExecutionResult[]>` |
| `Proposer` | `propose(failures: Failure[], history: FeedbackEntry[], context?: PluginContext): Promise<SkillProposal>` |
| `SkillBuilder` | `build(proposal: SkillProposal, parentSkills: Skill[], context?: PluginContext): Promise<Skill>` |

### Classes

#### `EvolutionLoop`

Main orchestrator. Runs baseline measurement, then iterates: select parent, execute training, collect failures, propose skill, build skill, validate, update frontier.

```typescript
new EvolutionLoop(opts: EvolutionLoopOptions)
loop.run(): Promise<EvolutionReport>
```

#### `ParetoFrontier`

Fixed-capacity frontier with round-robin parent selection and lowest-score eviction.

```typescript
new ParetoFrontier(config: ParetoFrontierConfig)
frontier.update(program: Program): boolean
frontier.selectParent(): Program
frontier.best(): Program
frontier.getAll(): Program[]
frontier.size(): number
```

#### `AdaptiveFrontier`

Extends `ParetoFrontier` with dynamic capacity adjustment based on diversity metrics.

```typescript
new AdaptiveFrontier(config: AdaptiveFrontierConfig)
frontier.evaluateAndAdjust(metrics: DiversityMetrics): void
```

#### `FeedbackHistory`

Tracks proposal history with duplicate detection.

```typescript
new FeedbackHistory()
history.log(entry: FeedbackEntry): void
history.getAll(): FeedbackEntry[]
history.isDuplicate(proposal: SkillProposal): boolean
history.toJSON(): string
FeedbackHistory.fromJSON(json: string): FeedbackHistory
```

#### `CostTracker`

Aggregates token usage and USD cost per iteration.

```typescript
new CostTracker(options?: { budgetLimit?: number })
tracker.record(entry: CostRecord): void
tracker.total(): number
tracker.byIteration(): Map<number, number>
tracker.isOverBudget(): boolean
```

#### `ConflictDetector`

Detects trigger overlap (Jaccard similarity) and capacity conflicts between skills.

```typescript
new ConflictDetector(config: { maxSkills: number; similarityThreshold: number })
detector.check(newSkill: Skill, existingSkills: Skill[]): ConflictResult[]
```

#### `CrossModelTester`

Tests skill transferability across different model adapters.

```typescript
new CrossModelTester(config: CrossModelTestConfig)
tester.run(): Promise<CrossModelResult>
```

## Configuration

| Option | Type | Description |
|--------|------|-------------|
| `maxIterations` | `number` | Maximum evolution iterations |
| `epochs` | `number` | Training epochs multiplier |
| `failureThreshold` | `number` | Score below which a task is considered failed |
| `frontier.capacity` | `number` | Pareto frontier size |
| `frontier.selectionStrategy` | `"round-robin" \| "tournament"` | Parent selection strategy |
| `runs` | `number` | Number of runs per evaluation |
| `budgetLimit` | `number?` | Maximum budget in USD |
| `maxSkills` | `number` | Maximum skills per program |

## Testing

```bash
pnpm test
```
