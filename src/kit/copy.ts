/**
 * A deep copy of plain data: objects, arrays and primitives, as every game state is. An order of magnitude
 * faster than `structuredClone`, which `apply` paid on every action. Two references to one object become two
 * copies, so a game must not rely on sharing within its state.
 */
export function copy<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value
  if (Array.isArray(value)) return value.map(copy) as T
  // Copying the object whole, then replacing its objects with copies, takes two thirds of the time of adding
  // its fields one by one.
  const out: Record<string, unknown> = Object.assign({}, value as Record<string, unknown>)
  for (const key in out) {
    const field = out[key]
    if (typeof field === 'object' && field !== null) out[key] = copy(field)
  }
  return out as T
}
