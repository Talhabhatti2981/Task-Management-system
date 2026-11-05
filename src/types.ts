export type Priority = "low" | "medium" | "high";

export type Member = {
  id: number;
  name: string;
  role: string;
  email: string;
  color: string;
  status?: "active" | "offline" | "invited";
};

export type Task = {
  id: number;
  title: string;
  date: string;
  description: string;
  completed: boolean;
  memberId: number | null;
  priority: Priority;
};

export type BoardSnapshot = {
  members: Member[];
  tasks: Task[];
  updatedAt: number;
};

export type UserProfile = {
  role: "admin" | "member";
  memberId: number | null;
  name: string;
  email: string;
};
