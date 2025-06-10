// Reading
// fiber.flags & Placement;
// Settings
// fiber.flags |= Placement | PlacementDEV;
// Resetting
// nextFiber.flags &= ~(Placement | PlacementDEV);
export const Mounted = /*  */ 0b0000000000000000000000000000001;
export const Updated = /* */ 0b0000000000000000000000000000010;
export const Moved = /*   */ 0b0000000000000000000000000000100;
export const Skipped = /*   */ 0b0000000000000000000000000001000;
export const Old = /*    */ 0b0000000000000000000000000010000;
