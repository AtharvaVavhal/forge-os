export const projectKeys = {
  all: ["projects"] as const,
  list: (filters: Record<string, string | number | boolean | undefined>) =>
    ["projects", "list", filters] as const,
  detail: (id: string) => ["projects", "detail", id] as const,
  milestones: (projectId: string) => ["projects", "milestones", projectId] as const,
  tasks: (projectId: string) => ["projects", "tasks", projectId] as const,
  timeEntries: (taskId: string) => ["projects", "time-entries", taskId] as const,
};
