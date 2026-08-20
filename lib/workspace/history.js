function snapshot(value) { return structuredClone(value); }

export class WorkspaceHistory {
  constructor(initialState, { limit = 100 } = {}) {
    if (!Number.isInteger(limit) || limit < 2) throw new RangeError("History limit must be at least two.");
    this.limit = limit;
    this.past = [];
    this.present = snapshot(initialState);
    this.future = [];
  }
  get value() { return snapshot(this.present); }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  push(nextState) {
    this.past.push(this.present);
    if (this.past.length > this.limit) this.past.shift();
    this.present = snapshot(nextState);
    this.future = [];
    return this.value;
  }
  undo() {
    if (!this.canUndo) return this.value;
    this.future.unshift(this.present);
    this.present = this.past.pop();
    return this.value;
  }
  redo() {
    if (!this.canRedo) return this.value;
    this.past.push(this.present);
    this.present = this.future.shift();
    return this.value;
  }
  reset(resetState) { return this.push(resetState); }
}
