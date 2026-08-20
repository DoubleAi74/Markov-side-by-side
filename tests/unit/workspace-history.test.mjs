import test from "node:test";
import assert from "node:assert/strict";
import { WorkspaceHistory } from "../../lib/workspace/history.js";

test("workspace history supports bounded undo, redo, and undoable reset", () => {
  const history = new WorkspaceHistory({ value: 1 }, { limit: 2 });
  history.push({ value: 2 });
  history.push({ value: 3 });
  history.reset({ value: 0 });
  assert.deepEqual(history.undo(), { value: 3 });
  assert.deepEqual(history.undo(), { value: 2 });
  assert.equal(history.canUndo, false);
  assert.deepEqual(history.redo(), { value: 3 });
  const exposed = history.value;
  exposed.value = 99;
  assert.equal(history.value.value, 3);
});
