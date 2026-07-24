export class ActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionError";
  }
}

export function toActionError(error: unknown, fallback = "The request could not be completed."): Error {
  if (error instanceof ActionError) {
    return error;
  }
  if (error instanceof Error && error.message.length > 0) {
    return new ActionError(error.message);
  }
  return new ActionError(fallback);
}

