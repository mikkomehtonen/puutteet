import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const IMAGE_TAG = 'puutteet-test';
const CONTAINER_NAME = 'puutteet-test-runner';

// ── Docker availability check ──────────────────────────────────────

function hasDocker(): boolean {
  try {
    execSync('docker info', { encoding: 'utf-8', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function readDockerignoreLines(): string[] {
  const content = readFileSync(path.join(ROOT, '.dockerignore'), 'utf-8');
  return content.split(/\r?\n/).filter(Boolean);
}

const run =
  (cmd: string, opts?: { timeout?: number }) =>
    execSync(cmd, { encoding: 'utf-8', timeout: opts?.timeout ?? 30000 }).trim();

const dockerAvailable = hasDocker();

// ── Task 1: .dockerignore (no Docker dependency) ───────────────────

describe('Task 1 — .dockerignore', () => {
  const expectedPatterns = [
    '.git',
    'node_modules',
    'data',
    'dist',
    '.env',
    '*.db',
    '*.db-journal',
    '*.db-wal',
    '*.db-shm',
    '*.tsbuildinfo',
    '.opencode',
    'docs',
    'stories',
    'tests',
  ];

  it('AC: .dockerignore file exists', () => {
    expect(existsSync(path.join(ROOT, '.dockerignore'))).toBe(true);
  });

  it.each(expectedPatterns)('AC: .dockerignore excludes %s', (pattern) => {
    const lines = readDockerignoreLines();
    expect(lines).toContain(pattern);
  });

  it('AC: .dockerignore files are listed only once each', () => {
    const lines = readDockerignoreLines();
    const seen = new Set<string>();
    for (const line of lines) {
      expect(seen.has(line)).toBe(false);
      seen.add(line);
    }
    expect(lines.length).toBe(expectedPatterns.length);
  });
});

// ── Tasks 2-4: Docker build, run, persistence (require Docker) ─────

describe.skipIf(!dockerAvailable)('Docker build and runtime', () => {
  let imageBuilt = false;

  beforeAll(() => {
    run(`docker build -t ${IMAGE_TAG} ${ROOT}`, { timeout: 300000 });
    imageBuilt = true;
  }, 310000);

  afterAll(() => {
    // Clean up test image
    try {
      run(`docker rmi -f ${IMAGE_TAG}`);
    } catch {
      // ignore cleanup errors
    }
  });

  // ── Task 2: Dockerfile ───────────────────────────────────────────

  describe('Task 2 — Dockerfile', () => {
    it('AC: docker build exits with code 0 (no errors)', () => {
      expect(imageBuilt).toBe(true);
    });

    it('AC: Final image uses node:22-alpine as base', () => {
      // Check the Dockerfile itself specifies node:22-alpine for runtime
      const dockerfile = readFileSync(path.join(ROOT, 'Dockerfile'), 'utf-8');
      const runtimeFrom = dockerfile
        .split('\n')
        .filter((l) => l.startsWith('FROM '))
        .pop()!; // Last FROM is the runtime stage
      expect(runtimeFrom).toMatch(/node:22-alpine/i);
      // Verify running container is Alpine-based
      const osRelease = run(`docker run --rm ${IMAGE_TAG} cat /etc/os-release`);
      expect(osRelease).toMatch(/Alpine/i);
    });

    it('AC: Final image runs as node (non-root) user', () => {
      const user = run(`docker inspect ${IMAGE_TAG} --format '{{.Config.User}}'`);
      expect(user).toBe('node');
    });

    it('AC: Final image does not contain python3, make, or g++', () => {
      for (const tool of ['python3', 'make', 'g++']) {
        const result = run(
          `docker run --rm --entrypoint=/bin/sh ${IMAGE_TAG} -c "command -v ${tool} && echo FOUND || echo NOT_FOUND"`,
        );
        expect(result).toBe('NOT_FOUND');
      }
    });

    it('AC: Second build with no source changes uses cached layers for dependencies', () => {
      // docker build outputs progress to stderr, so redirect it to stdout
      const secondBuild = run(`docker build -t ${IMAGE_TAG} ${ROOT} 2>&1`, { timeout: 120000 });
      // Verify that dependency installation steps are marked CACHED
      const buildLog = secondBuild.split('\n');
      const cachedLines = buildLog.filter((l) => l.trim().endsWith('CACHED'));
      expect(cachedLines.length).toBeGreaterThan(0);
    });
  });

  // ── Task 3: Container starts and serves ──────────────────────────

  describe('Task 3 — Container starts and serves', () => {
    beforeAll(() => {
      // Kill any leftover container from previous runs
      try {
        run(`docker rm -f ${CONTAINER_NAME}`);
      } catch {
        // ignore
      }
    });

    afterAll(() => {
      try {
        run(`docker stop ${CONTAINER_NAME}`, { timeout: 10000 });
      } catch {
        // ignore
      }
      try {
        run(`docker rm ${CONTAINER_NAME}`, { timeout: 5000 });
      } catch {
        // ignore
      }
    });

    const HOST_PORT = 18923;

    it('AC: Container starts without crashing', async () => {
      run(
        `docker run -d --rm -p ${HOST_PORT}:3000 --name ${CONTAINER_NAME} ${IMAGE_TAG}`,
        { timeout: 10000 },
      );
      // Give the server a moment to start
      await new Promise((r) => setTimeout(r, 3000));
      // Verify the container is running
      const status = run(`docker inspect ${CONTAINER_NAME} --format '{{.State.Status}}'`);
      expect(status).toBe('running');
    }, 30000);

    it('AC: GET /api/items returns HTTP 200 with []', async () => {
      const res = await fetch(`http://localhost:${HOST_PORT}/api/items`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([]);
    });

    it('AC: GET / returns HTTP 200 with HTML (React frontend)', async () => {
      const res = await fetch(`http://localhost:${HOST_PORT}/`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('<!doctype html>');
      expect(html).toContain('Shopping List');
    });

    it('AC: docker stop exits with code 0 (graceful shutdown)', () => {
      const stopResult = run(`docker stop ${CONTAINER_NAME}`, { timeout: 10000 });
      expect(stopResult).toContain(CONTAINER_NAME);
    });
  });

  // ── Task 4: Environment variables and data persistence ───────────

  describe('Task 4 — Environment variables and data persistence', () => {
    const VOLUME_NAME = 'puutteet-test-data-runner';
    const CONTAINER_8080 = 'puutteet-test-8080';
    const CONTAINER_PERSIST = 'puutteet-test-persist';

    afterAll(() => {
      // Clean up any running containers
      for (const name of [CONTAINER_8080, CONTAINER_PERSIST]) {
        try {
          run(`docker stop ${name}`, { timeout: 5000 });
        } catch { /* ignore */ }
        try {
          run(`docker rm ${name}`, { timeout: 5000 });
        } catch { /* ignore */ }
      }
      // Clean up volume
      try {
        run(`docker volume rm ${VOLUME_NAME}`, { timeout: 5000 });
      } catch { /* ignore */ }
    });

    it('AC: Server listens on port 8080 when PORT=8080', async () => {
      run(
        `docker run -d --rm -p 8088:8080 -e PORT=8080 --name ${CONTAINER_8080} ${IMAGE_TAG}`,
        { timeout: 10000 },
      );
      await new Promise((r) => setTimeout(r, 3000));
      const status = run(`docker inspect ${CONTAINER_8080} --format '{{.State.Status}}'`);
      expect(status).toBe('running');
      const res = await fetch(`http://localhost:8088/api/items`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([]);
      // Clean up
      run(`docker stop ${CONTAINER_8080}`, { timeout: 10000 });
    }, 30000);

    it('AC: Data persists across container restarts using a volume', async () => {
      // Create the volume
      run(`docker volume create ${VOLUME_NAME}`, { timeout: 5000 });

      // Start container with volume
      run(
        `docker run -d --rm -p 3001:3000 -v ${VOLUME_NAME}:/app/data --name ${CONTAINER_PERSIST} ${IMAGE_TAG}`,
        { timeout: 10000 },
      );
      await new Promise((r) => setTimeout(r, 3000));

      // Create an item
      const createRes = await fetch(`http://localhost:3001/api/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Milk' }),
      });
      expect(createRes.status).toBe(201);

      // Stop the container
      run(`docker stop ${CONTAINER_PERSIST}`, { timeout: 10000 });

      // Start a new container with the same volume
      run(
        `docker run -d --rm -p 3002:3000 -v ${VOLUME_NAME}:/app/data --name ${CONTAINER_PERSIST} ${IMAGE_TAG}`,
        { timeout: 10000 },
      );
      await new Promise((r) => setTimeout(r, 3000));

      // Verify the item is still present
      const readRes = await fetch(`http://localhost:3002/api/items`);
      expect(readRes.status).toBe(200);
      const body = await readRes.json();
      expect(body).toHaveLength(1);
      expect(body[0].name).toBe('Milk');

      // Stop container
      run(`docker stop ${CONTAINER_PERSIST}`, { timeout: 10000 });
    }, 60000);

    it('AC: docker volume rm cleans up the volume', () => {
      const result = run(`docker volume rm ${VOLUME_NAME}`, { timeout: 5000 });
      expect(result).toContain(VOLUME_NAME);
    });
  });
});
