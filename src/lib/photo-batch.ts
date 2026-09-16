export interface PhotoBatchResult {
  completed: string[];
  failed: string[];
  remaining: string[];
}

export async function runPhotoBatch(
  uris: readonly string[],
  operation: (uri: string) => Promise<void>,
  options: {
    shouldContinue: () => boolean;
    onSettled: (uri: string, succeeded: boolean, finished: number) => void;
  }
): Promise<PhotoBatchResult> {
  const queue = [...new Set(uris)];
  const completed: string[] = [];
  const failed: string[] = [];
  let finished = 0;
  for (const uri of queue) {
    if (!options.shouldContinue()) {
      break;
    }
    let succeeded: boolean;
    try {
      await operation(uri);
      succeeded = true;
    } catch {
      succeeded = false;
    }
    (succeeded ? completed : failed).push(uri);
    finished += 1;
    options.onSettled(uri, succeeded, finished);
  }
  return { completed, failed, remaining: queue.slice(finished) };
}
