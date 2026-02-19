import type { ServerEvent, TableStatePublic } from "@poker/shared";

export interface TableStateRepository {
  saveSnapshot(snapshot: TableStatePublic): Promise<void>;
  loadSnapshot(): Promise<TableStatePublic | null>;
  appendEvent(event: ServerEvent): Promise<void>;
  readEventsSince(seq: number): Promise<ServerEvent[]>;
}

export class InMemoryTableStateRepository implements TableStateRepository {
  private snapshot: TableStatePublic | null = null;
  private events: ServerEvent[] = [];

  async saveSnapshot(snapshot: TableStatePublic): Promise<void> {
    this.snapshot = snapshot;
  }

  async loadSnapshot(): Promise<TableStatePublic | null> {
    return this.snapshot;
  }

  async appendEvent(event: ServerEvent): Promise<void> {
    this.events.push(event);
    if (this.events.length > 5000) this.events.shift();
  }

  async readEventsSince(seq: number): Promise<ServerEvent[]> {
    return this.events.filter((e) => e.seq > seq);
  }
}
