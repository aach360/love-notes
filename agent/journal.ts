import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PhotonInbound } from "../src/shared/types";

export interface Receipt {
  id: string;
  lease: string;
  action: "sent" | "unknown";
  providerId?: string;
}
interface State {
  inbound: (PhotonInbound & { spaceType: "dm" })[];
  receipts: Receipt[];
}
/** Local persistence bridges network outages. Mount this directory on a persistent volume. */
export class Journal {
  private readonly path: string;
  private state: State;
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.path = join(directory, "journal.json");
    try {
      this.state = JSON.parse(readFileSync(this.path, "utf8")) as State;
      if (!Array.isArray(this.state.inbound) || !Array.isArray(this.state.receipts))
        throw new Error("Invalid journal");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      this.state = { inbound: [], receipts: [] };
    }
  }
  private save() {
    writeFileSync(`${this.path}.tmp`, JSON.stringify(this.state), { mode: 0o600, flush: true });
    renameSync(`${this.path}.tmp`, this.path);
  }
  addInbound(message: State["inbound"][number]) {
    if (
      this.state.inbound.some(
        (m) => m.projectId === message.projectId && m.messageId === message.messageId,
      )
    )
      return;
    if (this.state.inbound.length >= 1000) throw new Error("Inbound journal full");
    this.state.inbound.push(message);
    this.save();
  }
  firstInbound() {
    return this.state.inbound[0];
  }
  removeInbound(messageId: string) {
    this.state.inbound = this.state.inbound.filter((m) => m.messageId !== messageId);
    this.save();
  }
  receipt(value: Receipt) {
    this.state.receipts = this.state.receipts.filter((r) => r.id !== value.id);
    this.state.receipts.push(value);
    this.save();
  }
  firstReceipt() {
    return this.state.receipts[0];
  }
  removeReceipt(id: string) {
    this.state.receipts = this.state.receipts.filter((r) => r.id !== id);
    this.save();
  }
}
