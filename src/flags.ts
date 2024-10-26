/**
 * Reading:
 * fiber.flags & Flag1 & Flag2
 *
 * Setting:
 * fiber.flags |= Flag1 | Flag2
 *
 * Resetting:
 * nextFiber.flags &= ~(Flag1 | Flag2)
 */

export const NoFlags = /*   */ 0b0000000000000000000000000000000;

// Fiber is new.
export const Mounted = /*   */ 0b0000000000000000000000000000001;

// Fiber moved relative to its siblings.
export const Moved = /*     */ 0b0000000000000000000000000000010;

// Indicates that this fiber can be appended to the end of its container.
export const MovedEnd = /*  */ 0b0000000000000000000000000000100;

// Skip updating this fiber.
export const Skipped = /*   */ 0b0000000000000000000000000001000;

// Indicates that this fiber is an old version of a new fiber.
export const Old = /*       */ 0b0000000000000000000000000010000;

export function renderFlags(flags: number): string {
    if (flags === 0) return 'NoFlags';
    const names = [];
    if (flags & Mounted) names.push('Mounted');
    if (flags & Moved) names.push('Moved');
    if (flags & Skipped) names.push('Skipped');
    if (flags & Old) names.push('Old');
    return names.join('|');
}
