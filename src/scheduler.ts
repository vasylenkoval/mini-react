/**
 * Runs the given function with a callback that can be used to check how many
 * milliseconds are left to continue running the function.
 * @param fn - The function to run.
 */
export function schedule(fn: (remainingMs: () => number) => void): void {
    // For now this is a synchronous mock of the future interface.
    return fn(defaultRemaining);
}

function defaultRemaining() {
    return 100;
}
