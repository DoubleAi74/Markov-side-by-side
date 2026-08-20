export class ExpressionError extends Error {
  constructor(code, message, source, start = 0, end = start) {
    super(message);
    this.name = "ExpressionError";
    this.code = code;
    this.source = source;
    this.range = { start, end };
  }

  toIssue(entity = null, path = null) {
    return {
      severity: "error",
      code: this.code,
      entity,
      path,
      range: this.range,
      message: this.message,
    };
  }
}
