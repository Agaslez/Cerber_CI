/**
 * @file index.ts
 * @description Main exports for @cerber-ci/core package
 */

// AST exports
export {
    WorkflowParser,
    parseWorkflow, type ASTNode, type JobAST, type ParseError, type ParseResult, type SourceLocation, type StepAST,
    type TriggerAST, type WorkflowAST
} from './ast/WorkflowParser.js';

// Version
export const VERSION = '2.0.0-alpha.1';
