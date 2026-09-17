import { TASK_PRIORITIES, type Project, type Task } from "../api/types";

export { TASK_PRIORITIES };
export type { Project, Task };

export interface CompanyLike {
  id: string;
  name: string;
}
