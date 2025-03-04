export const sleeper = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
