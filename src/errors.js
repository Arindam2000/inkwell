/** An error the family sees as-is: what happened, and what to do next. */
export class InkwellError extends Error {
  /** @param {string} message @param {string} hint */
  constructor(message, hint) {
    super(message);
    this.name = 'InkwellError';
    this.hint = hint;
  }
}
