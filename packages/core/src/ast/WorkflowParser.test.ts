/**
 * @file WorkflowParser.test.ts
 * @description Tests for AST-based workflow parser (Day 1-2)
 */

import { parseWorkflow, WorkflowParser } from './WorkflowParser';

describe('WorkflowParser', () => {
  let parser: WorkflowParser;
  
  beforeEach(() => {
    parser = new WorkflowParser();
  });
  
  describe('Basic parsing', () => {
    test('should parse simple workflow with one job', () => {
      const yaml = `
name: CI
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run tests
        run: npm test
`;
      
      const result = parser.parse(yaml);
      
      expect(result.errors).toHaveLength(0);
      expect(result.ast).not.toBeNull();
      expect(result.ast?.name).toBe('CI');
      expect(result.ast?.on.events).toEqual(['push']);
      expect(Object.keys(result.ast?.jobs || {})).toEqual(['test']);
    });
    
    test('should parse workflow with multiple jobs', () => {
      const yaml = `
name: Multi-job workflow
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
  test:
    runs-on: ubuntu-latest
    needs: build
    steps:
      - run: npm test
`;
      
      const result = parser.parse(yaml);
      
      expect(result.errors).toHaveLength(0);
      expect(result.ast).not.toBeNull();
      expect(Object.keys(result.ast?.jobs || {})).toEqual(['build', 'test']);
      expect(result.ast?.jobs.test.needs).toEqual(['build']);
    });
    
    test('should parse trigger with branches', () => {
      const yaml = `
on:
  push:
    branches:
      - main
      - develop
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: echo test
`;
      
      const result = parser.parse(yaml);
      
      expect(result.errors).toHaveLength(0);
      expect(result.ast?.on.events).toEqual(['push']);
      expect(result.ast?.on.branches).toEqual(['main', 'develop']);
    });
  });
  
  describe('Step parsing', () => {
    test('should parse step with uses', () => {
      const yaml = `
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v3
        with:
          fetch-depth: 0
`;
      
      const result = parser.parse(yaml);
      const step = result.ast?.jobs.test.steps[0];
      
      expect(step?.name).toBe('Checkout');
      expect(step?.uses).toBe('actions/checkout@v3');
      expect(step?.with).toEqual({ 'fetch-depth': 0 });
    });
    
    test('should parse step with run', () => {
      const yaml = `
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Run tests
        run: |
          npm install
          npm test
        env:
          NODE_ENV: test
`;
      
      const result = parser.parse(yaml);
      const step = result.ast?.jobs.test.steps[0];
      
      expect(step?.name).toBe('Run tests');
      expect(step?.run).toContain('npm install');
      expect(step?.run).toContain('npm test');
      expect(step?.env).toEqual({ NODE_ENV: 'test' });
    });
    
    test('should parse step with conditional', () => {
      const yaml = `
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy
        if: github.ref == 'refs/heads/main'
        run: npm run deploy
`;
      
      const result = parser.parse(yaml);
      const step = result.ast?.jobs.test.steps[0];
      
      expect(step?.if).toBe("github.ref == 'refs/heads/main'");
    });
  });
  
  describe('Job configuration', () => {
    test('should parse job with matrix strategy', () => {
      const yaml = `
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [16, 18, 20]
        os: [ubuntu-latest, windows-latest]
      fail-fast: false
    steps:
      - run: node --version
`;
      
      const result = parser.parse(yaml);
      const job = result.ast?.jobs.test;
      
      expect(job?.strategy?.matrix).toEqual({
        node: [16, 18, 20],
        os: ['ubuntu-latest', 'windows-latest']
      });
      expect(job?.strategy?.failFast).toBe(false);
    });
    
    test('should parse job with permissions', () => {
      const yaml = `
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - run: echo test
`;
      
      const result = parser.parse(yaml);
      const job = result.ast?.jobs.test;
      
      expect(job?.permissions).toEqual({
        contents: 'read',
        'pull-requests': 'write'
      });
    });
    
    test('should parse job with environment variables', () => {
      const yaml = `
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    env:
      NODE_ENV: production
      API_URL: https://api.example.com
    steps:
      - run: echo $NODE_ENV
`;
      
      const result = parser.parse(yaml);
      const job = result.ast?.jobs.test;
      
      expect(job?.env).toEqual({
        NODE_ENV: 'production',
        API_URL: 'https://api.example.com'
      });
    });
  });
  
  describe('Error handling', () => {
    test('should error on missing "on" field', () => {
      const yaml = `
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: echo test
`;
      
      const result = parser.parse(yaml);
      
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("Missing required field 'on'");
    });
    
    test('should error on missing "runs-on" in job', () => {
      const yaml = `
on: push
jobs:
  test:
    steps:
      - run: echo test
`;
      
      const result = parser.parse(yaml);
      
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.message.includes('runs-on'))).toBe(true);
    });
    
    test('should error on step without uses or run', () => {
      const yaml = `
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Invalid step
`;
      
      const result = parser.parse(yaml);
      
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => 
        e.message.includes('uses') || e.message.includes('run')
      )).toBe(true);
    });
    
    test('should handle invalid YAML', () => {
      const yaml = `
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps: [
      - run: echo "unclosed
`;
      
      const result = parser.parse(yaml);
      
      expect(result.ast).toBeNull();
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].severity).toBe('error');
    });
  });
  
  describe('parseWorkflow convenience function', () => {
    test('should return AST directly on success', () => {
      const yaml = `
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: echo test
`;
      
      const ast = parseWorkflow(yaml);
      
      expect(ast).toBeDefined();
      expect(ast.type).toBe('workflow');
      expect(ast.jobs.test).toBeDefined();
    });
    
    test('should throw on parse error', () => {
      const yaml = `invalid: yaml: content:`;
      
      expect(() => parseWorkflow(yaml)).toThrow();
    });
    
    test('should throw on missing required fields', () => {
      const yaml = `
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: echo test
`;
      
      expect(() => parseWorkflow(yaml)).toThrow(/Missing required field/);
    });
  });
  
  describe('Real-world workflows', () => {
    test('should parse Next.js workflow', () => {
      const yaml = `
name: Next.js CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - run: npm test
`;
      
      const result = parser.parse(yaml);
      
      expect(result.errors).toHaveLength(0);
      expect(result.ast?.name).toBe('Next.js CI');
      expect(result.ast?.jobs.build.steps).toHaveLength(5);
    });
    
    test('should parse Docker workflow', () => {
      const yaml = `
name: Docker Build
on:
  push:
    tags:
      - 'v*'
jobs:
  docker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2
      - name: Login to DockerHub
        uses: docker/login-action@v2
        with:
          username: \${{ secrets.DOCKERHUB_USERNAME }}
          password: \${{ secrets.DOCKERHUB_TOKEN }}
      - name: Build and push
        uses: docker/build-push-action@v4
        with:
          context: .
          push: true
          tags: user/app:latest
`;
      
      const result = parser.parse(yaml);
      
      expect(result.errors).toHaveLength(0);
      expect(result.ast?.on.tags).toEqual(['v*']);
      expect(result.ast?.jobs.docker.steps).toHaveLength(4);
    });
  });
});
