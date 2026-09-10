export class JobTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`Job timed out after ${timeoutMs}ms`);
    this.name = 'JobTimeoutError';
  }
}

export async function withJobTimeout<T>(task: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new JobTimeoutError(timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
