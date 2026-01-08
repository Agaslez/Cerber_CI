/**
 * @file WorkflowParser.ts
 * @description AST-based YAML workflow parser (Day 1-2 implementation)
 * Replaces string diff with semantic understanding of CI/CD workflows
 */

import yaml from 'js-yaml';

/**
 * Source location for debugging and error reporting
 */
export interface SourceLocation {
  line: number;
  column: number;
  file?: string;
}

/**
 * Base AST node interface - all nodes extend this
 */
export interface ASTNode {
  type: string;
  location?: SourceLocation;
}

/**
 * Trigger configuration (on: push, pull_request, etc.)
 */
export interface TriggerAST extends ASTNode {
  type: 'trigger';
  events: string[];
  branches?: string[];
  tags?: string[];
  paths?: string[];
}

/**
 * Step in a job (uses or run)
 */
export interface StepAST extends ASTNode {
  type: 'step';
  id?: string;
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, any>;
  env?: Record<string, string>;
  if?: string;
  continueOnError?: boolean;
}

/**
 * Job configuration
 */
export interface JobAST extends ASTNode {
  type: 'job';
  id: string;
  name?: string;
  runsOn: string | string[];
  steps: StepAST[];
  needs?: string[];
  if?: string;
  strategy?: {
    matrix?: Record<string, any>;
    failFast?: boolean;
    maxParallel?: number;
  };
  env?: Record<string, string>;
  permissions?: Record<string, string>;
  timeout?: number;
}

/**
 * Root workflow AST
 */
export interface WorkflowAST extends ASTNode {
  type: 'workflow';
  name?: string;
  on: TriggerAST;
  jobs: Record<string, JobAST>;
  env?: Record<string, string>;
  defaults?: Record<string, any>;
  concurrency?: Record<string, any>;
}

/**
 * Parse result with optional errors
 */
export interface ParseResult {
  ast: WorkflowAST | null;
  errors: ParseError[];
}

export interface ParseError {
  message: string;
  location?: SourceLocation;
  severity: 'error' | 'warning';
}

/**
 * WorkflowParser - AST-based YAML workflow parser
 * 
 * Phase 1 (Day 1-2): Basic parsing for GitHub Actions
 * Phase 2 (Week 2): Add semantic normalization
 * Phase 3 (Week 3): Multi-provider support
 */
export class WorkflowParser {
  /**
   * Parse YAML workflow into AST
   * @param yamlContent Raw YAML string
   * @param filePath Optional file path for error reporting
   * @returns ParseResult with AST and any errors
   */
  parse(yamlContent: string, filePath?: string): ParseResult {
    const errors: ParseError[] = [];
    
    try {
      // Step 1: Parse YAML to plain object
      const rawYaml = yaml.load(yamlContent) as any;
      
      if (!rawYaml || typeof rawYaml !== 'object') {
        return {
          ast: null,
          errors: [{
            message: 'Invalid YAML: expected object',
            severity: 'error'
          }]
        };
      }
      
      // Step 2: Build AST with type safety
      const ast = this.buildWorkflowAST(rawYaml, filePath, errors);
      
      return { ast, errors };
      
    } catch (error) {
      return {
        ast: null,
        errors: [{
          message: `YAML parse error: ${error instanceof Error ? error.message : String(error)}`,
          severity: 'error'
        }]
      };
    }
  }
  
  /**
   * Build WorkflowAST from raw YAML object
   */
  private buildWorkflowAST(
    raw: any,
    filePath: string | undefined,
    errors: ParseError[]
  ): WorkflowAST {
    // Validate required fields
    if (!raw.on) {
      errors.push({
        message: "Missing required field 'on' (trigger configuration)",
        severity: 'error'
      });
    }
    
    if (!raw.jobs || typeof raw.jobs !== 'object') {
      errors.push({
        message: "Missing or invalid 'jobs' field",
        severity: 'error'
      });
    }
    
    // Parse trigger
    const trigger = this.parseTrigger(raw.on, errors);
    
    // Parse jobs
    const jobs: Record<string, JobAST> = {};
    if (raw.jobs && typeof raw.jobs === 'object') {
      for (const [jobId, jobConfig] of Object.entries(raw.jobs)) {
        jobs[jobId] = this.parseJob(jobId, jobConfig as any, errors);
      }
    }
    
    return {
      type: 'workflow',
      name: raw.name,
      on: trigger,
      jobs,
      env: raw.env,
      defaults: raw.defaults,
      concurrency: raw.concurrency,
      location: { line: 1, column: 1, file: filePath }
    };
  }
  
  /**
   * Parse trigger configuration (on: field)
   */
  private parseTrigger(onConfig: any, errors: ParseError[]): TriggerAST {
    let events: string[] = [];
    let branches: string[] | undefined;
    let tags: string[] | undefined;
    let paths: string[] | undefined;
    
    if (typeof onConfig === 'string') {
      // Simple: on: push
      events = [onConfig];
    } else if (Array.isArray(onConfig)) {
      // Array: on: [push, pull_request]
      events = onConfig;
    } else if (typeof onConfig === 'object') {
      // Object: on: { push: { branches: [...] } }
      events = Object.keys(onConfig);
      
      // Extract branches/tags/paths if present
      for (const event of events) {
        const eventConfig = onConfig[event];
        if (eventConfig && typeof eventConfig === 'object') {
          if (eventConfig.branches) {
            branches = Array.isArray(eventConfig.branches) 
              ? eventConfig.branches 
              : [eventConfig.branches];
          }
          if (eventConfig.tags) {
            tags = Array.isArray(eventConfig.tags)
              ? eventConfig.tags
              : [eventConfig.tags];
          }
          if (eventConfig.paths) {
            paths = Array.isArray(eventConfig.paths)
              ? eventConfig.paths
              : [eventConfig.paths];
          }
        }
      }
    }
    
    return {
      type: 'trigger',
      events,
      branches,
      tags,
      paths
    };
  }
  
  /**
   * Parse job configuration
   */
  private parseJob(jobId: string, jobConfig: any, errors: ParseError[]): JobAST {
    // Validate runs-on (required)
    if (!jobConfig['runs-on']) {
      errors.push({
        message: `Job '${jobId}': missing required field 'runs-on'`,
        severity: 'error'
      });
    }
    
    // Parse steps
    const steps: StepAST[] = [];
    if (Array.isArray(jobConfig.steps)) {
      for (let i = 0; i < jobConfig.steps.length; i++) {
        const step = this.parseStep(jobConfig.steps[i], jobId, i, errors);
        steps.push(step);
      }
    } else if (jobConfig.steps) {
      errors.push({
        message: `Job '${jobId}': 'steps' must be an array`,
        severity: 'error'
      });
    }
    
    // Parse needs - ensure it's always an array
    let needs: string[] | undefined = undefined;
    if (jobConfig.needs) {
      needs = Array.isArray(jobConfig.needs) ? jobConfig.needs : [jobConfig.needs];
    }
    
    // Parse strategy with proper handling of fail-fast
    let strategy: JobAST['strategy'] | undefined = undefined;
    if (jobConfig.strategy) {
      strategy = {
        matrix: jobConfig.strategy.matrix,
        failFast: jobConfig.strategy['fail-fast'],
        maxParallel: jobConfig.strategy['max-parallel']
      };
    }
    
    return {
      type: 'job',
      id: jobId,
      name: jobConfig.name,
      runsOn: jobConfig['runs-on'],
      steps,
      needs,
      if: jobConfig.if,
      strategy,
      env: jobConfig.env,
      permissions: jobConfig.permissions,
      timeout: jobConfig['timeout-minutes']
    };
  }
  
  /**
   * Parse step configuration
   */
  private parseStep(
    stepConfig: any,
    jobId: string,
    stepIndex: number,
    errors: ParseError[]
  ): StepAST {
    // Validate: must have either 'uses' or 'run'
    if (!stepConfig.uses && !stepConfig.run) {
      errors.push({
        message: `Job '${jobId}', step ${stepIndex}: must have either 'uses' or 'run'`,
        severity: 'error'
      });
    }
    
    return {
      type: 'step',
      id: stepConfig.id,
      name: stepConfig.name,
      uses: stepConfig.uses,
      run: stepConfig.run,
      with: stepConfig.with,
      env: stepConfig.env,
      if: stepConfig.if,
      continueOnError: stepConfig['continue-on-error']
    };
  }
  
  /**
   * Normalize AST - Phase 2 feature
   * - Sort keys consistently
   * - Remove comments (already done by js-yaml)
   * - Handle YAML anchors (already done by js-yaml)
   * - Expand matrix strategies
   */
  normalize(ast: WorkflowAST): WorkflowAST {
    // TODO: Implement in Phase 2 (Week 2)
    // For now, return as-is
    return ast;
  }
}

/**
 * Convenience function - parse and return AST directly
 * @throws ParseError if parsing fails
 */
export function parseWorkflow(yamlContent: string, filePath?: string): WorkflowAST {
  const parser = new WorkflowParser();
  const result = parser.parse(yamlContent, filePath);
  
  if (!result.ast) {
    const errorMessages = result.errors.map(e => e.message).join('\n');
    throw new Error(`Failed to parse workflow:\n${errorMessages}`);
  }
  
  if (result.errors.length > 0) {
    const criticalErrors = result.errors.filter(e => e.severity === 'error');
    if (criticalErrors.length > 0) {
      const errorMessages = criticalErrors.map(e => e.message).join('\n');
      throw new Error(`Workflow has critical errors:\n${errorMessages}`);
    }
  }
  
  return result.ast;
}
