/**
 * ============================================================
 * Swarme — Phase 62: WorkflowCheckpoint Durable Object
 * ============================================================
 *
 * Provides crash-resilient checkpointing for long-running,
 * multi-step autonomous agents. Each workflow instance gets its
 * own Durable Object keyed by:
 *   `${domainId}::${taskType}::${discriminator}`
 *
 * Example use cases:
 *   - Barnacle GEO outreach:
 *       Step 1: Discover target URLs
 *       Step 2: Find contact emails via Hunter.io
 *       Step 3: Draft personalized pitch
 *       Step 4: Queue for human approval / send
 *
 *   - Deep site audit:
 *       Step 1: Crawl sitemap
 *       Step 2: Analyze each page for technical SEO
 *       Step 3: Run accessibility checks
 *       Step 4: Compile report + create roadmap items
 *
 * Checkpoint Contract:
 *   After every step, the DO writes its current state to
 *   transactional storage. If the Worker crashes mid-step,
 *   the next invocation reads storage, detects the last
 *   completed step, and resumes from the next one.
 *
 * Thread Safety:
 *   Cloudflare Durable Objects enforce single-threaded
 *   execution per instance. No two requests to the same DO
 *   can execute concurrently, eliminating race conditions.
 *
 * ============================================================
 */

import type { Env } from "../index";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

/**
 * Represents a single step in a workflow pipeline.
 * Steps are identified by a sequential integer index (0-based).
 */
export interface WorkflowStep {
  /** 0-based step index */
  index: number;
  /** Human-readable name (e.g., "discover_urls", "find_emails") */
  name: string;
  /** Current execution status */
  status: "pending" | "running" | "completed" | "failed";
  /** Arbitrary output data from this step (JSON-serializable) */
  output: Record<string, unknown> | null;
  /** ISO timestamp when the step started */
  started_at: string | null;
  /** ISO timestamp when the step finished */
  completed_at: string | null;
  /** Error message if the step failed */
  error: string | null;
}

/**
 * Full checkpoint state persisted to Durable Object storage.
 */
export interface CheckpointState {
  /** Unique workflow identifier */
  workflow_id: string;
  /** Domain scope — all queries must be scoped to this */
  domain_id: string;
  /** Task category (e.g., "barnacle_outreach", "deep_audit") */
  task_type: string;
  /** Index of the last fully completed step (-1 if none) */
  current_step: number;
  /** Total number of steps in this workflow */
  total_steps: number;
  /** Ordered list of step metadata */
  steps: WorkflowStep[];
  /** Overall workflow status */
  status: "initialized" | "running" | "completed" | "failed" | "paused";
  /** ISO timestamp of workflow creation */
  created_at: string;
  /** ISO timestamp of last state change */
  updated_at: string;
  /** Number of times the workflow was resumed after a crash */
  resume_count: number;
  /** Arbitrary metadata (trigger info, config, etc.) */
  metadata: Record<string, unknown>;
}

/**
 * Payload to initialize a new workflow.
 */
export interface InitWorkflowPayload {
  workflow_id: string;
  domain_id: string;
  task_type: string;
  step_names: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Payload to advance to the next step.
 */
export interface AdvanceStepPayload {
  /** Output data from the just-completed step */
  output?: Record<string, unknown>;
}

/**
 * Payload to mark a step as failed.
 */
export interface FailStepPayload {
  error: string;
}

// ─────────────────────────────────────────────────────────────
// Durable Object Class
// ─────────────────────────────────────────────────────────────

export class WorkflowCheckpointDO implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private checkpoint: CheckpointState | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;

    // Hydrate checkpoint from storage on instantiation
    this.state.blockConcurrencyWhile(async () => {
      this.checkpoint =
        (await this.state.storage.get<CheckpointState>("checkpoint")) ?? null;
    });
  }

  // ───────────────────────────────────────────────────────────
  // HTTP Router
  // ───────────────────────────────────────────────────────────

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // POST /init — Initialize a new workflow with defined steps
      if (request.method === "POST" && path === "/init") {
        const body = (await request.json()) as InitWorkflowPayload;
        const result = await this.initWorkflow(body);
        return Response.json(result, { status: 200 });
      }

      // GET /status — Return current checkpoint state
      if (request.method === "GET" && path === "/status") {
        return Response.json(this.getStatus(), { status: 200 });
      }

      // POST /advance — Mark current step complete + move to next
      if (request.method === "POST" && path === "/advance") {
        const body = (await request.json()) as AdvanceStepPayload;
        const result = await this.advanceStep(body);
        return Response.json(result, { status: 200 });
      }

      // POST /fail — Mark current step as failed
      if (request.method === "POST" && path === "/fail") {
        const body = (await request.json()) as FailStepPayload;
        const result = await this.failStep(body);
        return Response.json(result, { status: 200 });
      }

      // POST /resume — Resume from last checkpoint after crash
      if (request.method === "POST" && path === "/resume") {
        const result = await this.resumeWorkflow();
        return Response.json(result, { status: 200 });
      }

      // POST /reset — Clear all state and start fresh
      if (request.method === "POST" && path === "/reset") {
        await this.resetWorkflow();
        return Response.json({ success: true, message: "Workflow reset" }, { status: 200 });
      }

      return Response.json({ error: "Not found", path }, { status: 404 });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal DO error";
      return Response.json({ error: message }, { status: 500 });
    }
  }

  // ───────────────────────────────────────────────────────────
  // Workflow Initialization
  // ───────────────────────────────────────────────────────────

  /**
   * Initializes a new workflow. If a workflow already exists in
   * this DO and is completed/failed, it is overwritten. If one
   * is still running, the caller should /resume instead.
   */
  private async initWorkflow(
    payload: InitWorkflowPayload
  ): Promise<{ success: boolean; checkpoint: CheckpointState }> {
    // If a workflow is already running, reject re-initialization
    if (
      this.checkpoint &&
      (this.checkpoint.status === "running" || this.checkpoint.status === "initialized")
    ) {
      throw new Error(
        `Workflow "${this.checkpoint.workflow_id}" is already ${this.checkpoint.status}. ` +
          `Call /resume to continue or /reset to start over.`
      );
    }

    const now = new Date().toISOString();

    const steps: WorkflowStep[] = payload.step_names.map((name, index) => ({
      index,
      name,
      status: "pending",
      output: null,
      started_at: null,
      completed_at: null,
      error: null,
    }));

    this.checkpoint = {
      workflow_id: payload.workflow_id,
      domain_id: payload.domain_id,
      task_type: payload.task_type,
      current_step: -1, // No step completed yet
      total_steps: steps.length,
      steps,
      status: "initialized",
      created_at: now,
      updated_at: now,
      resume_count: 0,
      metadata: payload.metadata ?? {},
    };

    await this.persist();

    console.log(
      `[WorkflowCheckpoint] Initialized "${payload.task_type}" for domain ` +
        `${payload.domain_id} with ${steps.length} steps`
    );

    return { success: true, checkpoint: this.checkpoint };
  }

  // ───────────────────────────────────────────────────────────
  // Step Advancement
  // ───────────────────────────────────────────────────────────

  /**
   * Marks the current step as completed and advances to the next.
   * If this was the last step, the workflow transitions to 'completed'.
   *
   * This is the critical checkpoint write — after this call returns,
   * a crash will not cause the completed step to re-execute.
   */
  private async advanceStep(
    payload: AdvanceStepPayload
  ): Promise<{
    success: boolean;
    completed_step: number;
    next_step: number | null;
    workflow_status: CheckpointState["status"];
  }> {
    if (!this.checkpoint) {
      throw new Error("No workflow initialized. Call /init first.");
    }

    if (this.checkpoint.status === "completed") {
      throw new Error("Workflow already completed. Call /reset to start a new one.");
    }

    // Determine which step just finished
    const completingIndex = this.checkpoint.current_step + 1;

    if (completingIndex >= this.checkpoint.total_steps) {
      throw new Error(
        `All ${this.checkpoint.total_steps} steps already completed.`
      );
    }

    const now = new Date().toISOString();

    // Mark the completing step as done
    const step = this.checkpoint.steps[completingIndex];
    step.status = "completed";
    step.output = payload.output ?? null;
    step.completed_at = now;

    // Advance the cursor
    this.checkpoint.current_step = completingIndex;
    this.checkpoint.updated_at = now;

    // Check if this was the last step
    const nextIndex = completingIndex + 1;
    if (nextIndex >= this.checkpoint.total_steps) {
      // All steps done — workflow is complete
      this.checkpoint.status = "completed";
    } else {
      // Mark the next step as running
      this.checkpoint.status = "running";
      this.checkpoint.steps[nextIndex].status = "running";
      this.checkpoint.steps[nextIndex].started_at = now;
    }

    // ★ CRITICAL: Persist to storage BEFORE returning.
    // This is the durability guarantee — once this write completes,
    // the step is permanently recorded as done.
    await this.persist();

    console.log(
      `[WorkflowCheckpoint] Step ${completingIndex} ("${step.name}") completed. ` +
        (nextIndex < this.checkpoint.total_steps
          ? `Next: step ${nextIndex} ("${this.checkpoint.steps[nextIndex].name}")`
          : `Workflow "${this.checkpoint.task_type}" fully complete.`)
    );

    return {
      success: true,
      completed_step: completingIndex,
      next_step: nextIndex < this.checkpoint.total_steps ? nextIndex : null,
      workflow_status: this.checkpoint.status,
    };
  }

  // ───────────────────────────────────────────────────────────
  // Step Failure
  // ───────────────────────────────────────────────────────────

  /**
   * Marks the current step as failed and pauses the workflow.
   * The workflow can be resumed later via /resume (which will
   * retry the failed step).
   */
  private async failStep(
    payload: FailStepPayload
  ): Promise<{
    success: boolean;
    failed_step: number;
    error: string;
    workflow_status: CheckpointState["status"];
  }> {
    if (!this.checkpoint) {
      throw new Error("No workflow initialized.");
    }

    const failingIndex = this.checkpoint.current_step + 1;

    if (failingIndex >= this.checkpoint.total_steps) {
      throw new Error("No active step to fail.");
    }

    const now = new Date().toISOString();
    const step = this.checkpoint.steps[failingIndex];
    step.status = "failed";
    step.error = payload.error;
    step.completed_at = now;

    this.checkpoint.status = "failed";
    this.checkpoint.updated_at = now;

    await this.persist();

    console.log(
      `[WorkflowCheckpoint] Step ${failingIndex} ("${step.name}") FAILED: ${payload.error}`
    );

    return {
      success: true,
      failed_step: failingIndex,
      error: payload.error,
      workflow_status: "failed",
    };
  }

  // ───────────────────────────────────────────────────────────
  // Resume After Crash
  // ───────────────────────────────────────────────────────────

  /**
   * Resumes a workflow from the last checkpoint. This is the
   * core crash-recovery mechanism.
   *
   * On resume:
   *   1. Reads the checkpoint from storage.
   *   2. Finds the last completed step (current_step).
   *   3. The next step (current_step + 1) is where execution
   *      should resume. If it was 'running' or 'failed', it
   *      resets to 'running' for a retry.
   *   4. Returns the resume point so the caller knows exactly
   *      which step to execute next.
   */
  private async resumeWorkflow(): Promise<{
    success: boolean;
    resume_from_step: number;
    resume_step_name: string;
    total_steps: number;
    resume_count: number;
    steps_completed: number;
  }> {
    if (!this.checkpoint) {
      throw new Error("No workflow to resume. Call /init first.");
    }

    if (this.checkpoint.status === "completed") {
      throw new Error("Workflow already completed — nothing to resume.");
    }

    const resumeIndex = this.checkpoint.current_step + 1;

    if (resumeIndex >= this.checkpoint.total_steps) {
      throw new Error("All steps completed — nothing to resume.");
    }

    const now = new Date().toISOString();

    // Reset the resume-target step to 'running'
    const step = this.checkpoint.steps[resumeIndex];
    step.status = "running";
    step.started_at = now;
    step.error = null;

    this.checkpoint.status = "running";
    this.checkpoint.resume_count += 1;
    this.checkpoint.updated_at = now;

    await this.persist();

    console.log(
      `[WorkflowCheckpoint] Resuming "${this.checkpoint.task_type}" at step ` +
        `${resumeIndex} ("${step.name}"). Resume count: ${this.checkpoint.resume_count}`
    );

    return {
      success: true,
      resume_from_step: resumeIndex,
      resume_step_name: step.name,
      total_steps: this.checkpoint.total_steps,
      resume_count: this.checkpoint.resume_count,
      steps_completed: this.checkpoint.current_step + 1,
    };
  }

  // ───────────────────────────────────────────────────────────
  // Status & Reset
  // ───────────────────────────────────────────────────────────

  private getStatus(): {
    exists: boolean;
    checkpoint: CheckpointState | null;
  } {
    return {
      exists: this.checkpoint !== null,
      checkpoint: this.checkpoint ? { ...this.checkpoint } : null,
    };
  }

  private async resetWorkflow(): Promise<void> {
    this.checkpoint = null;
    await this.state.storage.delete("checkpoint");
    console.log("[WorkflowCheckpoint] Workflow state cleared.");
  }

  // ───────────────────────────────────────────────────────────
  // Persistence
  // ───────────────────────────────────────────────────────────

  private async persist(): Promise<void> {
    if (this.checkpoint) {
      await this.state.storage.put("checkpoint", this.checkpoint);
    }
  }
}
