// Per-task event bus. Thin wrapper over `lib/event-bus.ts` (generic factory).
//
// Events the UI consumes (matched in WorkPane):
//   meta            — { task: { id, title, pattern, status, totalSteps } }
//   step.start      — { idx, agent, label }
//   step.token      — { idx, delta }
//   step.tool       — { idx, name, args, result }
//   step.done       — { idx, output, elapsed }
//   task.done       — { id, status, finalOutput, cost }
//   task.error      — { id, message }

import { createBus, type BusSubscription } from '../lib/event-bus.js';

export type BusEvent =
  | { type: 'meta'; task: { id: string; title: string; pattern: string; status: string; totalSteps: number } }
  | { type: 'step.start'; idx: number; agent: string; label: string }
  | { type: 'step.token'; idx: number; delta: string }
  | { type: 'step.tool'; idx: number; name: string; args: unknown; result: unknown }
  | { type: 'step.done'; idx: number; output: string; elapsed: string }
  | { type: 'task.done'; id: string; status: string; finalOutput: string; cost: string }
  | { type: 'task.error'; id: string; message: string };

const bus = createBus<BusEvent>({
  terminalTypes: ['task.done', 'task.error'],
});

export function openBus(taskId: string) {
  return bus.open(taskId);
}

export function emit(taskId: string, ev: BusEvent): void {
  bus.emit(taskId, ev);
}

export function subscribe(taskId: string): BusSubscription<BusEvent> | null {
  return bus.subscribe(taskId);
}

export type { BusSubscription };
