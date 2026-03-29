/**
 * @evolver/core 타입 정의
 *
 * EvoSkill 논문 기반 범용 LLM 에이전트 스킬 진화 프레임워크의 핵심 인터페이스.
 */

/* ------------------------------------------------------------------ */
/*  Scorer                                                             */
/* ------------------------------------------------------------------ */

export type ScorerType = "exact-match" | "fuzzy" | "llm-judge" | "custom";

/* ------------------------------------------------------------------ */
/*  Task & Execution                                                   */
/* ------------------------------------------------------------------ */

export interface Task {
  id:        string;
  input:     unknown;
  expected:  unknown;
  category?: string;
  scorer?:   ScorerType;
}

export interface ExecutionResult {
  taskId:      string;
  output:      unknown;
  score:       number;
  error?:      string;
  tokenUsage?: { input: number; output: number };
  durationMs:  number;
}

export interface Failure {
  task:   Task;
  result: ExecutionResult;
}

/* ------------------------------------------------------------------ */
/*  Skill & Program                                                    */
/* ------------------------------------------------------------------ */

export interface SkillProposal {
  action:      "create" | "edit";
  skillName:   string;
  trigger:     string;
  description: string;
  rationale:   string;
  editTarget?: string;
}

export interface Skill {
  name:     string;
  trigger:  string;
  content:  string;
  scripts?: Record<string, string>;
}

export interface Program {
  id:        string;
  generation: number;
  parentId?: string;
  skills:    Skill[];
  score:     number;
  branch:    string;
}

/* ------------------------------------------------------------------ */
/*  Feedback & Cost                                                    */
/* ------------------------------------------------------------------ */

export interface FeedbackEntry {
  iteration:  number;
  proposal:   SkillProposal;
  accepted:   boolean;
  scoreBefore: number;
  scoreAfter:  number;
  delta:       number;
  timestamp:   number;
}

export interface CostRecord {
  iteration:  number;
  tokenUsage: { input: number; output: number };
  costUsd:    number;
  timestamp:  number;
}

/* ------------------------------------------------------------------ */
/*  Plugin System                                                      */
/* ------------------------------------------------------------------ */

export interface IterationContext {
  iteration:    number;
  frontier:     Program[];
  history:      FeedbackEntry[];
  costSoFar:    number;
}

export interface PluginContext {
  [key: string]: unknown;
}

export interface EvaluationResult {
  programId:  string;
  skillName:  string;
  score:      number;
  delta:      number;
  accepted:   boolean;
}

export interface Plugin {
  name: string;
  hooks?: {
    onIterationStart?(ctx: IterationContext): Promise<void>;
    onFailure?(failures: Failure[]): Promise<PluginContext>;
    onProposal?(proposal: SkillProposal): Promise<PluginContext>;
    onEvaluation?(result: EvaluationResult): Promise<void>;
    onFrontierUpdate?(frontier: Program[]): Promise<void>;
  };
}

/* ------------------------------------------------------------------ */
/*  Core Interfaces (DI)                                               */
/* ------------------------------------------------------------------ */

export interface Executor {
  run(program: Program, tasks: Task[]): Promise<ExecutionResult[]>;
}

export interface Proposer {
  propose(failures: Failure[], history: FeedbackEntry[], context?: PluginContext): Promise<SkillProposal>;
}

export interface SkillBuilder {
  build(proposal: SkillProposal, parentSkills: Skill[], context?: PluginContext): Promise<Skill>;
}

/* ------------------------------------------------------------------ */
/*  Configuration                                                      */
/* ------------------------------------------------------------------ */

export interface ParetoFrontierConfig {
  capacity:          number;
  selectionStrategy: "round-robin" | "tournament";
}

export interface AdaptiveFrontierConfig extends ParetoFrontierConfig {
  adaptive:     boolean;
  minCapacity:  number;
  maxCapacity:  number;
}

export interface DiversityMetrics {
  skillOverlapRate: number;
  scoreVariance:    number;
  avgGeneration:    number;
}

export interface EvolutionConfig {
  maxIterations:    number;
  epochs:           number;
  failureThreshold: number;
  frontier:         ParetoFrontierConfig;
  runs:             number;
  budgetLimit?:     number;
  maxSkills:        number;
}

export interface AdapterConfig {
  name:        string;
  command:     string;
  skillsPath:  string;
  skillFormat: "markdown" | "json" | "yaml";
  timeout:     number;
  concurrency: number;
}

/* ------------------------------------------------------------------ */
/*  Reports & Conflict                                                 */
/* ------------------------------------------------------------------ */

export interface EvolutionReport {
  bestProgram:    Program;
  frontier:       Program[];
  iterations:     number;
  totalCostUsd:   number;
  history:        FeedbackEntry[];
  durationMs:     number;
}

export interface ConflictResult {
  type:           "trigger-overlap" | "capacity";
  existingSkill?: string;
  similarity?:    number;
  message:        string;
}

/* ------------------------------------------------------------------ */
/*  Cross-Model Testing                                                */
/* ------------------------------------------------------------------ */

export interface CrossModelTestConfig {
  sourceAdapter:  Executor;
  targetAdapters: Executor[];
  tasks:          Task[];
  skills:         Skill[];
}

export interface CrossModelResult {
  source:       { adapter: string; score: number };
  targets:      Array<{ adapter: string; score: number; delta: number }>;
  transferRate: number;
}
