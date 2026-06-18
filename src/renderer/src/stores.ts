import type { Writable } from "svelte/store";
import { useWritable } from "./UseSharedStore";

export const useActiveView = (): Writable<string> => useWritable("activeView", "explorer");
