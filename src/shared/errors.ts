/** Human-readable text for anything thrown */
export const message = (error: unknown) => error instanceof Error ? error.message : String(error)
