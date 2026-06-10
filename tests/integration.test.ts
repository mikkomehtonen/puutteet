import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(__dirname, '..');

function waitForOutput(
  proc: ChildProcess,
  match: string,
  timeoutMs = 10000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for "${match}"`));
    }, timeoutMs);

    const onData = (data: Buffer) => {
      if (data.toString().includes(match)) {
        clearTimeout(timer);
        resolve();
      }
    };

    proc.stdout?.on('data', onData);
    proc.stderr?.on('data', onData);

    // Also check immediately
    if (proc.exitCode !== null) {
      clearTimeout(timer);
      reject(new Error('Process already exited'));
    }
  });
}

describe('Task 1 — Project scaffolding', () => {
  it('AC1: workspace dependencies resolve correctly', () => {
    // Verify that the hoisted node_modules contains key packages
    expect(existsSync(path.join(ROOT, 'node_modules', 'express'))).toBe(true);
    expect(existsSync(path.join(ROOT, 'node_modules', 'better-sqlite3'))).toBe(true);
    expect(existsSync(path.join(ROOT, 'node_modules', 'react'))).toBe(true);
    expect(existsSync(path.join(ROOT, 'node_modules', 'vite'))).toBe(true);

    // Verify workspace package.json files are valid
    const rootPkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
    const serverPkg = JSON.parse(readFileSync(path.join(ROOT, 'server', 'package.json'), 'utf-8'));
    const clientPkg = JSON.parse(readFileSync(path.join(ROOT, 'client', 'package.json'), 'utf-8'));
    expect(rootPkg.workspaces).toContain('server');
    expect(rootPkg.workspaces).toContain('client');
    expect(serverPkg.name).toBe('server');
    expect(clientPkg.name).toBe('client');
  });

  it('AC2: npm run build exits with code 0 and produces output', () => {
    const result = execSync('npm run build', { cwd: ROOT, encoding: 'utf-8', timeout: 60000 });
    expect(result).toBeTruthy();

    // Verify client build output
    const clientIndex = path.join(ROOT, 'client', 'dist', 'index.html');
    expect(existsSync(clientIndex)).toBe(true);

    // Verify server build output
    const serverIndex = path.join(ROOT, 'server', 'dist', 'index.js');
    expect(existsSync(serverIndex)).toBe(true);
  });
});

describe('Task 1 AC4 / Task 6 AC2 — Production serving', () => {
  let server: ChildProcess;
  const PORT = 15873;

  beforeAll(async () => {
    // Kill any leftover process from a previous aborted run
    try {
      spawn('pkill', ['-f', `node.*index.js.*${PORT}`]).unref();
      await new Promise((r) => setTimeout(r, 500));
    } catch {
      // Ignore
    }

    server = spawn('node', ['server/dist/index.js'], {
      cwd: ROOT,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT: String(PORT),
        DATABASE_PATH: path.join(ROOT, 'tests', '__test__production.db'),
      },
      stdio: 'pipe',
    });

    await waitForOutput(server, 'Server running', 15000);
  }, 20000);

  afterAll(async () => {
    // Kill server gracefully — SIGINT triggers closeDb which releases the WAL lock
    if (server && !server.killed) {
      server.kill('SIGINT');
      // Wait for the process to exit before cleaning up files
      await new Promise<void>((resolve) => {
        server.on('exit', () => resolve());
        setTimeout(resolve, 2000); // fallback timeout
      });
    }
    // Clean up test database and WAL artifacts
    const testDb = path.join(ROOT, 'tests', '__test__production.db');
    for (const suffix of ['', '-wal', '-shm']) {
      const file = testDb + suffix;
      if (existsSync(file)) {
        try {
          unlinkSync(file);
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  });

  it('AC4: GET /api/items returns 200 with empty array', async () => {
    const apiRes = await fetch(`http://localhost:${PORT}/api/items`);
    expect(apiRes.status).toBe(200);
    const body = await apiRes.json();
    expect(body).toEqual([]);
  });

  it('AC4: GET / returns the built frontend HTML', async () => {
    const frontendRes = await fetch(`http://localhost:${PORT}/`);
    expect(frontendRes.status).toBe(200);
    const html = await frontendRes.text();
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Shopping List');
  });

  it('AC: GET /favicon.svg returns 200 with SVG content', async () => {
    const faviconRes = await fetch(`http://localhost:${PORT}/favicon.svg`);
    expect(faviconRes.status).toBe(200);
    const contentType = faviconRes.headers.get('Content-Type') ?? '';
    expect(contentType).toContain('image/svg+xml');
    const body = await faviconRes.text();
    expect(body).toContain('🛒');
  });
});

// Helper: kill a process group by PID
function killProc(proc: ChildProcess | undefined, signal: NodeJS.Signals = 'SIGTERM') {
  if (proc && !proc.killed) {
    try {
      proc.kill(signal);
    } catch {
      // Ignore
    }
  }
}

describe('Task 1 AC3 — Vite dev server on port 5173', () => {
  let viteProc: ChildProcess;

  beforeAll(async () => {
    // Kill any leftover process from a previous aborted run
    try {
      spawn('pkill', ['-f', 'vite.*5173']).unref();
      await new Promise((r) => setTimeout(r, 1000));
    } catch {
      // Ignore
    }

    viteProc = spawn('npx', ['vite', '--port', '5173', '--strictPort'], {
      cwd: path.join(ROOT, 'client'),
      env: { ...process.env },
      stdio: 'pipe',
    });
    await waitForOutput(viteProc, 'Local:', 60000);
  }, 65000);

  afterAll(() => {
    killProc(viteProc, 'SIGTERM');
    // Also kill any orphaned vite processes on this port
    try {
      spawn('pkill', ['-f', 'vite.*5173']).unref();
    } catch {
      // Ignore
    }
  });

  it('AC3: Vite responds on port 5173', async () => {
    const res = await fetch(`http://localhost:5173/`).catch(() => null);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
  });
});

describe('Task 1 AC4 — Express dev server on port 3000', () => {
  let expressProc: ChildProcess;

  beforeAll(async () => {
    // Kill any leftover process from a previous aborted run
    try {
      spawn('pkill', ['-f', 'tsx.*src/index.ts']).unref();
      await new Promise((r) => setTimeout(r, 500));
    } catch {
      // Ignore
    }

    expressProc = spawn(path.join(ROOT, 'node_modules', '.bin', 'tsx'), ['watch', 'src/index.ts'], {
      cwd: path.join(ROOT, 'server'),
      env: {
        ...process.env,
        PORT: '3000',
        DATABASE_PATH: path.join(ROOT, 'tests', '__test__dev.db'),
      },
      stdio: 'pipe',
    });
    await waitForOutput(expressProc, 'Server running', 20000);
  }, 25000);

  afterAll(() => {
    killProc(expressProc, 'SIGTERM');
    // Clean up test database
    const testDb = path.join(ROOT, 'tests', '__test__dev.db');
    for (const suffix of ['', '-wal', '-shm']) {
      const file = testDb + suffix;
      if (existsSync(file)) {
        try {
          unlinkSync(file);
        } catch {
          // Ignore
        }
      }
    }
  });

  it('AC4: Express responds on port 3000 with API', async () => {
    const res = await fetch(`http://localhost:3000/api/items`).catch(() => null);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    const body = await res!.json();
    expect(body).toEqual([]);
  });
});

describe('Task 6 AC6-8 — Mobile/responsive CSS', () => {
  it('AC6: CSS includes responsive rules for small viewports', () => {
    const css = readFileSync(path.join(ROOT, 'client', 'src', 'App.css'), 'utf-8');
    // Check for media query or max-width constraint
    expect(css).toMatch(/@media|max-width/);
    // The app container should have a max-width
    expect(css).toContain('max-width');
  });

  it('AC7: Interactive elements have 44px minimum touch target size', () => {
    const css = readFileSync(path.join(ROOT, 'client', 'src', 'App.css'), 'utf-8');
    // Check for common interactive element sizing
    expect(css).toContain('44px');
  });

  it('AC8: Body/app container prevents horizontal overflow', () => {
    const css = readFileSync(path.join(ROOT, 'client', 'src', 'App.css'), 'utf-8');
    expect(css).toContain('overflow');
  });
});

describe('Task 6 AC1-4 — favicon.svg static file', () => {
  beforeAll(() => {
    execSync('npm run build', { cwd: ROOT, encoding: 'utf-8', timeout: 120000 });
  }, 130000);

  it('AC1: client/public/favicon.svg exists with SVG and emoji', () => {
    const favicon = readFileSync(path.join(ROOT, 'client', 'public', 'favicon.svg'), 'utf-8');
    expect(favicon).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(favicon).toContain('🛒');
  });

  it('AC2: client/index.html references /favicon.svg (not data URI)', () => {
    const html = readFileSync(path.join(ROOT, 'client', 'index.html'), 'utf-8');
    expect(html).toContain('href="/favicon.svg"');
    expect(html).toContain('type="image/svg+xml"');
    expect(html).not.toContain('data:image/svg+xml');
  });

  it('AC3: npm run build copies favicon.svg to client/dist', () => {
    const distFavicon = path.join(ROOT, 'client', 'dist', 'favicon.svg');
    expect(existsSync(distFavicon)).toBe(true);
    const sourceFavicon = readFileSync(path.join(ROOT, 'client', 'public', 'favicon.svg'), 'utf-8');
    const distFaviconContent = readFileSync(distFavicon, 'utf-8');
    expect(distFaviconContent).toBe(sourceFavicon);
  });

  it('AC4: built client/dist/index.html retains favicon reference', () => {
    const distIndex = path.join(ROOT, 'client', 'dist', 'index.html');
    expect(existsSync(distIndex)).toBe(true);
    const html = readFileSync(distIndex, 'utf-8');
    expect(html).toContain('href="/favicon.svg"');
    expect(html).toContain('type="image/svg+xml"');
  });
});

describe('Task 7 — Documentation and configuration', () => {
  it('AC1: README.md contains installation, config, backup, and upgrade instructions', () => {
    const readme = readFileSync(path.join(ROOT, 'README.md'), 'utf-8');
    expect(readme).toContain('Quick start');
    expect(readme).toContain('Configuration');
    expect(readme).toContain('Backing up');
    expect(readme).toContain('Upgrading');
  });

  it('AC2: .env.example lists all environment variables with defaults', () => {
    const envExample = readFileSync(path.join(ROOT, '.env.example'), 'utf-8');
    expect(envExample).toContain('PORT');
    expect(envExample).toContain('DATABASE_PATH');
    expect(envExample).toContain('NODE_ENV');
  });

  it('AC3: .gitignore includes required entries', () => {
    const gitignore = readFileSync(path.join(ROOT, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('node_modules/');
    expect(gitignore).toContain('data/');
    expect(gitignore).toContain('.env');
    expect(gitignore).toContain('dist/');
  });

  it('AC: Vite config proxies /ws to Express server with ws: true', () => {
    const config = readFileSync(path.join(ROOT, 'client', 'vite.config.ts'), 'utf-8');
    expect(config).toContain("'/ws'");
    expect(config).toContain("target: 'http://localhost:3000'");
    expect(config).toContain('ws: true');
  });
});
