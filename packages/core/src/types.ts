/**
 * @nerdvana/evolver-core 타입 정의
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

export interface ScoreStats {
  mean:    number;
  stddev:  number;
  ci95:    [number, number];
  samples: number[];
}

export interface Program {
  id:          string;
  generation:  number;
  parentId?:   string;
  skills:      Skill[];
  score:       number;
  scoreStats?: ScoreStats;
  branch:      string;
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

export interface LlmUsage {
  model:  string;
  input:  number;
  output: number;
}

export interface ModelPricing {
  inputPerMTok:  number;
  outputPerMTok: number;
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
  /** 마지막 호출 이후 누적된 LLM 사용량을 반환하고 비운다. */
  drainUsage?(): LlmUsage[];
}

export interface SkillBuilder {
  build(proposal: SkillProposal, parentSkills: Skill[], context?: PluginContext): Promise<Skill>;
  /** 마지막 호출 이후 누적된 LLM 사용량을 반환하고 비운다. */
  drainUsage?(): LlmUsage[];
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
  maxIterations:      number;
  epochs:             number;
  failureThreshold:   number;
  frontier:           ParetoFrontierConfig | AdaptiveFrontierConfig;
  runs:               number;
  budgetLimit?:       number;
  maxSkills:          number;
  /** 후보가 부모 대비 최소 이만큼 평균 점수가 높아야 채택 (기본 0). */
  acceptanceMargin?:  number;
  /** 실행 어댑터 모델 (비용 추정용). 미지정 시 기본 단가 적용. */
  executorModel?:     string;
  /** 모델 단가 재정의 (모델 이름 접두 일치). */
  pricing?:           Record<string, ModelPricing>;
  /** 적응형 frontier 용량 조정 주기 (이터레이션 단위, 기본 5). */
  adaptiveInterval?:  number;
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

export interface HoldoutReport {
  baseline: ScoreStats;
  best:     ScoreStats;
  delta:    number;
}

export interface EvolutionReport {
  bestProgram:    Program;
  baseline:       Program;
  frontier:       Program[];
  iterations:     number;
  totalCostUsd:   number;
  history:        FeedbackEntry[];
  durationMs:     number;
  holdout?:       HoldoutReport;
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
