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
let readlineInterface: Interface | null = null;

function getReadline(): Interface {
  if (!readlineInterface) {
    readlineInterface = createInterface({ input: process.stdin, output: process.stdout });
  }
  return readlineInterface;
}

function processNext(): void {
  if (queue.length === 0) {
    processing = false;
    return;
  }

  processing = true;
  const request = queue.shift();
  if (!request) {
    processing = false;
    return;
  }

  const reader = getReadline();
  process.stderr.write(`\n[${request.stage}] needs your input:\n${request.prompt}\n`);

  reader.question("", (answer) => {
    try {
      request.stdinPipe.write(`${answer}\n`);
    } catch {
      // The child process may exit before the response is written.
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
  if (readlineInterface) {
    readlineInterface.close();
    readlineInterface = null;
  }

  processing = false;
  for (const request of queue.splice(0)) {
    request.resolve();
  }
}
