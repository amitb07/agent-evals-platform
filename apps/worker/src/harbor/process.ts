import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { readFile } from 'node:fs/promises';

export interface HarborHandle {
  readonly pid: number | undefined;
  /** Resolves with the exit code (null when killed by a signal). */
  readonly exited: Promise<number | null>;
  /** SIGTERM, then SIGKILL after `graceMs` if Harbor has not exited. */
  stop(graceMs?: number): Promise<void>;
}

export interface HarborLaunch {
  bin: string;
  jobConfigPath: string;
  jobsDir: string;
  logPath: string;
  env: NodeJS.ProcessEnv;
}

export interface HarborLauncher {
  launch(opts: HarborLaunch): HarborHandle;
}

/**
 * Spawns `harbor run -y -c job.yaml -o <jobsDir>`. `-y` is required: with `[verifier] env` Harbor
 * otherwise waits on an interactive confirmation. stdin is closed so nothing can block on it.
 */
export const spawnHarbor: HarborLauncher = {
  launch({ bin, jobConfigPath, jobsDir, logPath, env }) {
    const log = createWriteStream(logPath, { flags: 'a' });
    const child = spawn(bin, ['run', '-y', '-c', jobConfigPath, '-o', jobsDir], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    const exited = new Promise<number | null>((resolve, reject) => {
      child.on('error', (error) => {
        log.end();
        reject(error);
      });
      child.on('close', (code) => {
        log.end();
        resolve(code);
      });
    });
    return {
      pid: child.pid,
      exited,
      async stop(graceMs = 30_000) {
        if (child.exitCode !== null || child.signalCode !== null) return;
        child.kill('SIGTERM');
        const timer = setTimeout(() => child.kill('SIGKILL'), graceMs);
        await exited.catch(() => undefined);
        clearTimeout(timer);
      },
    };
  },
};

export async function lastLines(path: string, n: number): Promise<string> {
  try {
    return (await readFile(path, 'utf8')).trimEnd().split('\n').slice(-n).join('\n');
  } catch {
    return '';
  }
}
