import { createInterface, type Interface } from "node:readline";
import type { Writable } from "node:stream";

export interface InteractionRequest {
  stage: string;
  prompt: string;
  stdinPipe: Writable;
  resolve: () => void;
}

const queue: InteractionRequest[] = [];
let processing = false;
let rl: Interface | null = null;

function getReadline(): Interface {
  if (!rl) {
    rl = createInterface({ input: process.stdin, output: process.stdout });
  }
  return rl;
}

function processNext(): void {
  if (queue.length === 0) {
    processing = false;
    return;
  }

  processing = true;
  const request = queue.shift()!;
  const reader = getReadline();

  process.stderr.write(`\n[${request.stage}] needs your input:\n${request.prompt}\n`);

  reader.question("", (answer) => {
    try {
      request.stdinPipe.write(`${answer}\n`);
    } catch {
      // pipe may have closed between prompt and response — not fatal
    }
    request.resolve();
    processNext();
  });
}

export function enqueue(request: InteractionRequest): void {
  queue.push(request);
  if (!processing) {
    processNext();
  }
}

export function close(): void {
  if (rl) {
    rl.close();
    rl = null;
  }
  processing = false;
  // Resolve any remaining queued requests so callers don't hang
  for (const request of queue.splice(0)) {
    request.resolve();
  }
}
