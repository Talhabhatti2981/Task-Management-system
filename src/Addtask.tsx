import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  HiBars3,
  HiCheck,
  HiOutlineCalendarDays,
  HiOutlineClipboardDocumentList,
  HiOutlineFlag,
  HiOutlineMagnifyingGlass,
  HiOutlinePencilSquare,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineUserGroup,
  HiOutlineUserPlus,
  HiOutlineXMark,
} from "react-icons/hi2";
import { authenticatedFetch } from "./lib/api";
import { loadBoard, saveBoard, subscribeBoard } from "./lib/boardStore";
import type { Member, Priority, Task, UserProfile } from "./types";

type TaskManagerProps = {
  profile: UserProfile;
  accessToken: string;
  onSignOut: () => void;
};

type StatusFilter = "All" | "Pending" | "Done";
type SortKey = "date-asc" | "date-desc" | "title-asc" | "title-desc";

const getInitials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

const TaskManager = ({ profile, accessToken, onSignOut }: TaskManagerProps) => {
  const isAdmin = profile.role === "admin";
  const [members, setMembers] = useState<Member[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isShared, setIsShared] = useState(false);
  const readyRef = useRef(false);
  const skipPersistRef = useRef(false);
  const updatedAtRef = useRef(0);

  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [assigneeId, setAssigneeId] = useState<number | "">("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("All");
  const [sort, setSort] = useState<SortKey>("date-asc");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showMoreId, setShowMoreId] = useState<number | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<number | "all">(
    isAdmin ? "all" : profile.memberId ?? "all"
  );
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [memberName, setMemberName] = useState("");
  const [memberRole, setMemberRole] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberAttempted, setMemberAttempted] = useState(false);
  const [memberErrors, setMemberErrors] = useState({
    name: "",
    role: "",
    email: "",
  });
  const [errors, setErrors] = useState({
    title: "",
    date: "",
    description: "",
  });
  const [touched, setTouched] = useState({
    title: false,
    date: false,
    description: false,
  });
  const [notice, setNotice] = useState("");

  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    let cancelled = false;
    readyRef.current = false;

    const hydrate = async () => {
      const { board, shared } = await loadBoard(accessToken);
      if (cancelled) return;
      skipPersistRef.current = true;
      setMembers(board.members);
      setTasks(board.tasks);
      setIsShared(shared);
      updatedAtRef.current = board.updatedAt;
      readyRef.current = true;
    };

    void hydrate();

    const unsubscribe = subscribeBoard(accessToken, (board, shared) => {
      setIsShared(shared);
      if (board.updatedAt <= updatedAtRef.current) {
        setMembers((current) => {
          const presenceChanged = board.members.some(
            (member, index) =>
              current[index]?.id !== member.id ||
              current[index]?.status !== member.status
          );
          if (!presenceChanged) return current;
          skipPersistRef.current = true;
          return board.members;
        });
        return;
      }
      skipPersistRef.current = true;
      updatedAtRef.current = board.updatedAt;
      setMembers(board.members);
      setTasks(board.tasks);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [accessToken]);

  useEffect(() => {
    if (!readyRef.current) return;
    if (skipPersistRef.current) {
      skipPersistRef.current = false;
      return;
    }

    const snapshot = {
      members,
      tasks,
      updatedAt: Date.now(),
    };
    updatedAtRef.current = snapshot.updatedAt;
    void saveBoard(snapshot, accessToken).then(setIsShared);
  }, [members, tasks, accessToken]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const validateTask = (
    nextTitle = title,
    nextDate = date,
    nextDescription = description
  ) => {
    const nextErrors = { title: "", date: "", description: "" };
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);

    if (!nextTitle.trim()) {
      nextErrors.title = "Title is required";
    } else if (!/^[a-zA-Z0-9\s.,!?'-]+$/.test(nextTitle.trim())) {
      nextErrors.title = "Use letters, numbers, and basic punctuation only";
    }

    if (!nextDate) {
      nextErrors.date = "Due date is required";
    } else if (editingId === null && new Date(nextDate) < todayDate) {
      nextErrors.date = "Date cannot be in the past";
    }

    if (!nextDescription.trim()) {
      nextErrors.description = "Description is required";
    }

    setErrors(nextErrors);
    return !nextErrors.title && !nextErrors.date && !nextErrors.description;
  };

  const resetTaskForm = () => {
    setTitle("");
    setDate("");
    setDescription("");
    setPriority("medium");
    setAssigneeId("");
    setEditingId(null);
    setErrors({ title: "", date: "", description: "" });
    setTouched({ title: false, date: false, description: false });
  };

  const addOrUpdateTask = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ title: true, date: true, description: true });
    if (!validateTask()) return;

    const memberId = isAdmin
      ? assigneeId === ""
        ? null
        : Number(assigneeId)
      : profile.memberId;
    const assignedMember = members.find((member) => member.id === memberId);

    if (editingId !== null) {
      setTasks((prev) =>
        prev.map((task) =>
          task.id === editingId
            ? { ...task, title, date, description, memberId, priority }
            : task
        )
      );
      setNotice(isAdmin ? "Task updated on the team board" : "Task updated");
    } else {
      setTasks((prev) => [
        ...prev,
        {
        id: Date.now(),
          title: title.trim(),
        date,
          description: description.trim(),
        completed: false,
          memberId,
          priority,
        },
      ]);
      setNotice(
        isAdmin && assignedMember
          ? `Task added for ${assignedMember.name}`
          : isAdmin
            ? "Task added to the team board"
            : "Today’s task added"
      );
    }

    setSelectedMemberId(isAdmin ? "all" : profile.memberId ?? "all");
    resetTaskForm();
    setShowTaskModal(false);
  };

  const deleteTask = (id: number) => {
    if (!window.confirm("Delete this task?")) return;
    setTasks((prev) => prev.filter((task) => task.id !== id));
    if (editingId === id) resetTaskForm();
  };

  const toggleDone = (id: number) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id ? { ...task, completed: !task.completed } : task
      )
    );
  };

  const editTask = (task: Task) => {
    setTitle(task.title);
    setDate(task.date);
    setDescription(task.description);
    setPriority(task.priority);
    setAssigneeId(task.memberId ?? "");
    setEditingId(task.id);
    setErrors({ title: "", date: "", description: "" });
    setTouched({ title: false, date: false, description: false });
    setShowTaskModal(true);
  };

  const openNewTask = (memberId?: number) => {
    resetTaskForm();
    const assignee = isAdmin ? memberId : profile.memberId ?? undefined;
    if (!isAdmin) setDate(today);
    if (assignee) {
      setAssigneeId(assignee);
      setSelectedMemberId(assignee);
    }
    setShowTaskModal(true);
  };

  const closeTaskModal = () => {
    resetTaskForm();
    setShowTaskModal(false);
  };

  const validateMember = (
    name = memberName,
    role = memberRole,
    email = memberEmail
  ) => {
    const nextErrors = { name: "", role: "", email: "" };

    if (!name.trim()) {
      nextErrors.name = "Name is required";
    } else if (!/^[a-zA-Z\s.'-]+$/.test(name.trim())) {
      nextErrors.name = "Name should only contain letters and spaces";
    }

    if (!role.trim()) {
      nextErrors.role = "Role is required";
    }

    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      nextErrors.email = "Enter a valid email";
    }

    setMemberErrors(nextErrors);
    return !nextErrors.name && !nextErrors.role && !nextErrors.email;
  };

  const closeMemberModal = () => {
    setShowMemberModal(false);
    setMemberName("");
    setMemberRole("");
    setMemberEmail("");
    setMemberAttempted(false);
    setMemberErrors({ name: "", role: "", email: "" });
  };

  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setMemberAttempted(true);
    if (!validateMember()) return;

    try {
      const response = await authenticatedFetch("/api/members", {
        method: "POST",
        body: JSON.stringify({
          name: memberName.trim(),
          role: memberRole.trim(),
          email: memberEmail.trim(),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not invite member");

      const { board, shared } = await loadBoard(accessToken);
      skipPersistRef.current = true;
      updatedAtRef.current = board.updatedAt;
      setMembers(board.members);
      setTasks(board.tasks);
      setIsShared(shared);
      closeMemberModal();
      setNotice(`Invitation sent to ${memberEmail.trim()}`);
      setShowSidebar(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not invite member");
    }
  };

  const deleteMember = (id: number) => {
    const member = members.find((item) => item.id === id);
    if (
      !window.confirm(
        `Remove ${member?.name ?? "this member"}? Their tasks will stay as unassigned.`
      )
    ) {
      return;
    }

    void authenticatedFetch(`/api/members?id=${id}`, { method: "DELETE" })
      .then(async (response) => {
        const result = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(result.error ?? "Could not remove member");
        const { board, shared } = await loadBoard(accessToken);
        skipPersistRef.current = true;
        updatedAtRef.current = board.updatedAt;
        setMembers(board.members);
        setTasks(board.tasks);
        setIsShared(shared);
        if (selectedMemberId === id) setSelectedMemberId("all");
        if (assigneeId === id) setAssigneeId("");
        setNotice(`${member?.name ?? "Member"} removed`);
      })
      .catch((error: unknown) =>
        setNotice(error instanceof Error ? error.message : "Could not remove member")
      );
  };

  const getDaysLeft = (dueDate: string) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    return Math.ceil((due.getTime() - start.getTime()) / (1000 * 3600 * 24));
  };

  const getDaysText = (days: number) => {
    if (days > 1) return `${days} days left`;
    if (days === 1) return "Tomorrow";
    if (days === 0) return "Due today";
    return "Overdue";
  };

  const filteredTasks = useMemo(() => {
    return tasks
    .filter((task) => task.title.toLowerCase().includes(search.toLowerCase()))
    .filter((task) =>
      filter === "All"
        ? true
        : filter === "Pending"
        ? !task.completed
        : task.completed
    )
    .sort((a, b) => {
      if (sort === "title-asc") return a.title.localeCompare(b.title);
      if (sort === "title-desc") return b.title.localeCompare(a.title);
      if (sort === "date-asc")
        return new Date(a.date).getTime() - new Date(b.date).getTime();
        return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  }, [tasks, search, filter, sort]);

  const visibleMembers = members;

  const unassignedTasks = filteredTasks.filter((task) => task.memberId === null);
  const total = tasks.length;
  const completed = tasks.filter((task) => task.completed).length;
  const pending = total - completed;

  const memberTaskCount = (id: number) =>
    tasks.filter((task) => task.memberId === id).length;

  const memberPendingCount = (id: number) =>
    tasks.filter((task) => task.memberId === id && !task.completed).length;

  return (
    <div className="min-h-screen bg-[#f4f6fb] text-slate-900 lg:flex">
      <button
        onClick={() => setShowSidebar(true)}
        className="lg:hidden fixed top-4 left-4 z-50 rounded-xl bg-white p-2.5 shadow-md text-slate-700"
        aria-label="Open menu"
      >
        <HiBars3 className="h-6 w-6" />
      </button>

      <AnimatePresence>
        {showSidebar && (
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="lg:hidden fixed inset-0 z-40 bg-slate-900/40"
            onClick={() => setShowSidebar(false)}
            aria-label="Close menu"
          />
        )}
      </AnimatePresence>

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 flex w-[280px] flex-col bg-slate-950 text-white transition-transform duration-300 lg:translate-x-0 ${
          showSidebar ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500 font-bold">
              TF
            </div>
            <div>
              <p className="text-lg font-bold tracking-tight">TaskFlow</p>
              <p className="text-xs text-slate-400">Team workspace</p>
            </div>
          </div>
          <button
            className="lg:hidden text-slate-400"
            onClick={() => setShowSidebar(false)}
            aria-label="Close sidebar"
          >
            <HiOutlineXMark className="h-6 w-6" />
          </button>
        </div>

        <nav className="px-4 space-y-1">
          <button
            onClick={() => {
              setSelectedMemberId("all");
              setAssigneeId("");
              setShowSidebar(false);
            }}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              selectedMemberId === "all"
                ? "bg-white/10 text-white"
                : "text-slate-300 hover:bg-white/5"
            }`}
          >
            <HiOutlineClipboardDocumentList className="h-5 w-5" />
            All tasks
          </button>
        </nav>

        <div className="mt-8 flex items-center justify-between px-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            {isAdmin ? "Team members" : "My workspace"}
          </p>
          {isAdmin && (
            <button
              onClick={() => {
                setShowMemberModal(true);
                setShowSidebar(false);
              }}
              className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"
              aria-label="Invite member"
            >
              <HiOutlineUserPlus className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="mt-3 flex-1 overflow-y-auto px-3 pb-6">
          {members.length === 0 ? (
            <p className="px-3 text-sm text-slate-500">
              Add a member to start assigning work.
            </p>
          ) : (
            <div className="space-y-1">
              {members.map((member) => {
                const pendingCount = memberPendingCount(member.id);
                const isActive = selectedMemberId === member.id;
                return (
                  <button
                    key={member.id}
                    onClick={() => {
                      setSelectedMemberId(member.id);
                      setAssigneeId(member.id);
                      setShowSidebar(false);
                      window.requestAnimationFrame(() => {
                        document
                          .getElementById(`member-${member.id}`)
                          ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                      });
                    }}
                    title={`Assign the next task to ${member.name}. All team tasks stay visible.`}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                      isActive ? "bg-white/10" : "hover:bg-white/5"
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${member.color}`}
                    >
                      {getInitials(member.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {member.name}
                      </span>
                      <span className="block truncate text-xs text-slate-400">
                        {member.role}
                      </span>
                    </span>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-slate-300">
                      {pendingCount}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {isAdmin && (
          <div className="border-t border-white/10 p-4">
            <button
              onClick={() => {
                setShowMemberModal(true);
                setShowSidebar(false);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-400"
            >
              <HiOutlinePlus className="h-4 w-4" />
              Invite employee
            </button>
          </div>
        )}
      </aside>

      <main className="flex-1 min-w-0 px-4 py-8 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-[1600px]">
          <header className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="pl-12 lg:pl-0">
              <p className="text-sm font-medium text-emerald-700">
                {isAdmin ? "Administrator workspace" : "Employee workspace"}
              </p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
                {isAdmin ? "Team overview" : "My tasks"}
              </h1>
              <p className="mt-2 max-w-xl text-sm text-slate-500">
                {isAdmin
                  ? "Review employee activity, assign work, and track every task across the team."
                  : "Add today’s work and keep your own progress up to date."}
              </p>
              <p
                className={`mt-3 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                  isShared
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-sky-50 text-sky-700"
                }`}
              >
                {isShared
                  ? "Connected to the Supabase workspace"
                  : "Connecting to the Supabase workspace"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 self-start">
              <button
                onClick={() => openNewTask()}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
              >
                <HiOutlinePlus className="h-4 w-4" />
                {isAdmin ? "Add task" : "Add today’s task"}
              </button>
              {isAdmin && (
                <button
                  onClick={() => setShowMemberModal(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  <HiOutlineUserPlus className="h-4 w-4" />
                  Invite employee
                </button>
              )}
              <button
                onClick={onSignOut}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Sign out
              </button>
            </div>
          </header>

          <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: isAdmin ? "Total tasks" : "My tasks", value: total, hint: isAdmin ? "Across the team" : "Assigned to you" },
              { label: "Pending", value: pending, hint: "Still open" },
              { label: "Completed", value: completed, hint: "Finished work" },
              ...(isAdmin
                ? [{ label: "Employees", value: members.length, hint: "In your workspace" }]
                : [{ label: "Due today", value: tasks.filter((task) => task.date === today && !task.completed).length, hint: "Open tasks" }]),
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-slate-200/80 bg-white px-5 py-4 shadow-sm"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {stat.label}
                </p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{stat.value}</p>
                <p className="mt-1 text-xs text-slate-400">{stat.hint}</p>
              </div>
            ))}
          </div>

          <div className="mb-6 grid gap-3 md:grid-cols-3">
            <label className="relative md:col-span-1">
              <HiOutlineMagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search tasks..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none ring-indigo-500/20 focus:border-indigo-400 focus:ring-4"
                />
            </label>
                <select
                  value={filter}
              onChange={(e) => setFilter(e.target.value as StatusFilter)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-indigo-400"
                >
              <option value="All">All status</option>
                  <option value="Pending">Pending</option>
                  <option value="Done">Done</option>
                </select>
                <select
                  value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-indigo-400"
            >
              <option value="date-asc">Due date · soonest</option>
              <option value="date-desc">Due date · latest</option>
              <option value="title-asc">Title A–Z</option>
              <option value="title-desc">Title Z–A</option>
                </select>
          </div>

          {members.length === 0 && unassignedTasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-16 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                <HiOutlineUserGroup className="h-7 w-7" />
              </div>
              <h2 className="text-xl font-semibold">
                {isAdmin ? "Build your team" : "No tasks yet"}
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                {isAdmin
                  ? "Invite employees to create accounts and start assigning work."
                  : "Add your first task for today to get started."}
              </p>
              {isAdmin ? (
                <button
                  onClick={() => setShowMemberModal(true)}
                  className="mt-6 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Invite your first employee
                </button>
              ) : (
                <button
                  onClick={() => openNewTask()}
                  className="mt-6 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Add today’s task
                </button>
              )}
            </div>
          ) : (
            <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
              {visibleMembers.map((member) => {
                const memberTasks = filteredTasks.filter(
                  (task) => task.memberId === member.id
                );
                const doneCount = tasks.filter(
                  (task) => task.memberId === member.id && task.completed
                ).length;

                return (
                  <section
                    key={member.id}
                    id={`member-${member.id}`}
                    className={`flex min-h-[320px] flex-col overflow-hidden rounded-2xl border bg-white shadow-sm ${
                      selectedMemberId === member.id
                        ? "border-indigo-300 ring-2 ring-indigo-100"
                        : "border-slate-200/80"
                    }`}
                  >
                    <div className="border-b border-slate-100 px-4 py-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${member.color}`}
                          >
                            {getInitials(member.name)}
          </span>
                          <div className="min-w-0">
                            <h3 className="truncate font-semibold text-slate-900">
                              {member.name}
                            </h3>
                            <p className="truncate text-sm text-slate-500">
                              {member.role}
                            </p>
                            {isAdmin && (
                              <span
                                className={`mt-1 inline-flex items-center gap-1.5 text-[11px] font-medium ${
                                  member.status === "active"
                                    ? "text-emerald-700"
                                    : member.status === "invited"
                                      ? "text-amber-700"
                                      : "text-slate-500"
                                }`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${
                                    member.status === "active"
                                      ? "bg-emerald-500"
                                      : member.status === "invited"
                                        ? "bg-amber-500"
                                        : "bg-slate-400"
                                  }`}
                                />
                                {member.status === "active"
                                  ? "Active now"
                                  : member.status === "invited"
                                    ? "Invite sent"
                                    : "Offline"}
                              </span>
                            )}
                          </div>
                        </div>
                        {isAdmin && (
                          <button
                            onClick={() => deleteMember(member.id)}
                            className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                            aria-label={`Remove ${member.name}`}
                          >
                            <HiOutlineTrash className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <div className="flex gap-2 text-xs">
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                            {memberTaskCount(member.id)} tasks
          </span>
                          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
                            {doneCount} done
          </span>
                        </div>
                        <button
                          onClick={() => openNewTask(member.id)}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
                        >
                          <HiOutlinePlus className="h-3.5 w-3.5" />
                          Task
                        </button>
                      </div>
                    </div>

                    {memberTasks.length === 0 ? (
                      <div className="flex flex-1 items-center justify-center px-4 py-8 text-center text-sm text-slate-500">
                        No tasks yet for {member.name.split(" ")[0]}.
                      </div>
                    ) : (
                      <ul className="flex-1 divide-y divide-slate-100">
                        {memberTasks.map((task) => (
                          <TaskRow
                            key={task.id}
                            task={task}
                            expanded={showMoreId === task.id}
                            onToggle={() => toggleDone(task.id)}
                            onEdit={() => editTask(task)}
                            onDelete={() => deleteTask(task.id)}
                            onExpand={() =>
                              setShowMoreId(
                                showMoreId === task.id ? null : task.id
                              )
                            }
                            getDaysLeft={getDaysLeft}
                            getDaysText={getDaysText}
                          />
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}

              {unassignedTasks.length > 0 && (
                <section className="flex min-h-[320px] flex-col overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-white shadow-sm">
                  <div className="border-b border-slate-100 px-4 py-4">
                    <h3 className="font-semibold text-slate-900">Unassigned</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Not on a member’s list yet.
                    </p>
                  </div>
                  <ul className="flex-1 divide-y divide-slate-100">
                    {unassignedTasks.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        expanded={showMoreId === task.id}
                        onToggle={() => toggleDone(task.id)}
                        onEdit={() => editTask(task)}
                        onDelete={() => deleteTask(task.id)}
                        onExpand={() =>
                          setShowMoreId(showMoreId === task.id ? null : task.id)
                        }
                        getDaysLeft={getDaysLeft}
                        getDaysText={getDaysText}
                      />
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>
      </main>

      <AnimatePresence>
        {showTaskModal && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeTaskModal}
          >
        <motion.form
          onSubmit={addOrUpdateTask}
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
            >
              <div className="mb-5 flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-semibold">
                    {editingId !== null ? "Edit task" : "Add a task"}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {isAdmin
                      ? "Assign work to an employee or leave it unassigned."
                      : "Add a task for today. It will appear in your personal list."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeTaskModal}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                  aria-label="Close"
                >
                  <HiOutlineXMark className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
            <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Title
                  </label>
              <input
                    autoFocus
                type="text"
                    placeholder="Write a clear task title"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                      setTouched((prev) => ({ ...prev, title: true }));
                      validateTask(e.target.value, date, description);
                }}
                    className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-4 focus:ring-indigo-500/15 ${
                  errors.title && touched.title
                        ? "border-rose-400"
                        : "border-slate-200"
                }`}
              />
              {errors.title && touched.title && (
                    <p className="mt-1 text-sm text-rose-600">{errors.title}</p>
              )}
            </div>

                <div className="grid gap-4 sm:grid-cols-2">
            <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      Due date
                    </label>
              <input
                type="date"
                min={today}
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                        setTouched((prev) => ({ ...prev, date: true }));
                        validateTask(title, e.target.value, description);
                }}
                      className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-4 focus:ring-indigo-500/15 ${
                  errors.date && touched.date
                          ? "border-rose-400"
                          : "border-slate-200"
                }`}
              />
              {errors.date && touched.date && (
                      <p className="mt-1 text-sm text-rose-600">{errors.date}</p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      Priority
                    </label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as Priority)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                </div>

                {isAdmin ? (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      Assign to
                    </label>
                    <select
                      value={assigneeId}
                      onChange={(e) => {
                        const nextId = e.target.value ? Number(e.target.value) : "";
                        setAssigneeId(nextId);
                        setSelectedMemberId(nextId === "" ? "all" : nextId);
                      }}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                    >
                      <option value="">Unassigned</option>
                      {members.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name} · {member.role}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">
                      Assigned to
                    </span>
                    <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
                      {profile.name}
                    </p>
                  </div>
                )}

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Description
                  </label>
              <textarea
                    placeholder="What needs to be done?"
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                      setTouched((prev) => ({ ...prev, description: true }));
                      validateTask(title, date, e.target.value);
                }}
                    className={`h-28 w-full resize-none rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-4 focus:ring-indigo-500/15 ${
                  errors.description && touched.description
                        ? "border-rose-400"
                        : "border-slate-200"
                }`}
              />
              {errors.description && touched.description && (
                    <p className="mt-1 text-sm text-rose-600">
                  {errors.description}
                </p>
              )}
            </div>
          </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeTaskModal}
                  className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
            <button
              type="submit"
                  className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
                >
                  {editingId !== null ? "Save changes" : "Add task"}
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showMemberModal && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeMemberModal}
          >
            <motion.form
              onSubmit={addMember}
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            >
              <div className="mb-5 flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Add a member</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    They’ll receive an email link to create their password.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeMemberModal}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
                  aria-label="Close"
                >
                  <HiOutlineXMark className="h-5 w-5" />
            </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    Full name
                  </label>
                  <input
                    autoFocus
                    value={memberName}
                    onChange={(e) => {
                      setMemberName(e.target.value);
                      if (memberAttempted) {
                        validateMember(e.target.value, memberRole, memberEmail);
                      }
                    }}
                    placeholder="Sarah Ahmed"
                    className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none ${
                      memberErrors.name ? "border-rose-400" : "border-slate-200"
                    }`}
                  />
                  {memberErrors.name && (
                    <p className="mt-1 text-sm text-rose-600">
                      {memberErrors.name}
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Role</label>
                  <input
                    value={memberRole}
                    onChange={(e) => {
                      setMemberRole(e.target.value);
                      if (memberAttempted) {
                        validateMember(memberName, e.target.value, memberEmail);
                      }
                    }}
                    placeholder="Product designer"
                    className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none ${
                      memberErrors.role ? "border-rose-400" : "border-slate-200"
                    }`}
                  />
                  {memberErrors.role && (
                    <p className="mt-1 text-sm text-rose-600">
                      {memberErrors.role}
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    Email for invitation
                  </label>
                  <input
                    type="email"
                    value={memberEmail}
                    onChange={(e) => {
                      setMemberEmail(e.target.value);
                      if (memberAttempted) {
                        validateMember(memberName, memberRole, e.target.value);
                      }
                    }}
                    placeholder="sarah@company.com"
                    className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none ${
                      memberErrors.email ? "border-rose-400" : "border-slate-200"
                    }`}
                  />
                  {memberErrors.email && (
                    <p className="mt-1 text-sm text-rose-600">
                      {memberErrors.email}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                  onClick={closeMemberModal}
                  className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
                <button
                  type="submit"
                  className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
                >
                  Send invitation
                </button>
          </div>
        </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

          <AnimatePresence>
        {notice && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="fixed bottom-6 right-6 z-[70] rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-lg"
          >
            {notice}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

type TaskRowProps = {
  task: Task;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onExpand: () => void;
  getDaysLeft: (date: string) => number;
  getDaysText: (days: number) => string;
};

const priorityStyles: Record<Priority, string> = {
  low: "bg-sky-50 text-sky-700",
  medium: "bg-amber-50 text-amber-700",
  high: "bg-rose-50 text-rose-700",
};

function TaskRow({
  task,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  onExpand,
  getDaysLeft,
  getDaysText,
}: TaskRowProps) {
              const daysLeft = getDaysLeft(task.date);
  const overdue = !task.completed && daysLeft < 0;

              return (
    <li
      className={`border-t border-slate-100 px-5 py-4 first:border-t-0 ${
        overdue ? "bg-rose-50/60" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={onToggle}
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition ${
            task.completed
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-slate-300 hover:border-indigo-400"
          }`}
          aria-label={task.completed ? "Mark as pending" : "Mark as done"}
        >
          {task.completed && <HiCheck className="h-3.5 w-3.5" />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
              <h4
                className={`font-semibold ${
                  task.completed ? "text-slate-400 line-through" : "text-slate-900"
                        }`}
                      >
                        {task.title}
              </h4>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${priorityStyles[task.priority]}`}
                >
                  <HiOutlineFlag className="h-3 w-3" />
                  {task.priority}
                </span>
                <span
                  className={`inline-flex items-center gap-1 ${
                    overdue ? "font-medium text-rose-600" : "text-slate-500"
                  }`}
                >
                  <HiOutlineCalendarDays className="h-3.5 w-3.5" />
                  {getDaysText(daysLeft)} · {task.date}
                </span>
              </div>
            </div>
            <div className="flex gap-1">
                      <button
                onClick={onEdit}
                className="rounded-lg p-2 text-slate-400 hover:bg-amber-50 hover:text-amber-600"
                aria-label="Edit task"
                      >
                <HiOutlinePencilSquare className="h-4 w-4" />
                      </button>
                      <button
                onClick={onDelete}
                className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                aria-label="Delete task"
                      >
                <HiOutlineTrash className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <p
            className={`mt-2 text-sm text-slate-600 ${
              expanded ? "" : "line-clamp-2"
                    }`}
                  >
                    {task.description}
                  </p>
          {task.description.length > 90 && (
                  <button
              onClick={onExpand}
              className="mt-1 text-sm font-medium text-indigo-600 hover:text-indigo-500"
            >
              {expanded ? "Show less" : "Read more"}
                  </button>
          )}
        </div>
    </div>
    </li>
  );
}

export default TaskManager;
