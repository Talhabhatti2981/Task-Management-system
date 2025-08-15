import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { HiX, HiMenuAlt3 } from "react-icons/hi";

type Task = {
  id: number;
  title: string;
  date: string;
  description: string;
  completed: boolean;
};

const TaskManager = () => {
  const [tasks, setTasks] = useState<Task[]>(() => {
    const stored = localStorage.getItem("tasks");
    return stored ? JSON.parse(stored) : [];
  });

  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"All" | "Pending" | "Done">("All");
  const [sort, setSort] = useState<
    "title-asc" | "title-desc" | "date-asc" | "date-desc"
  >("date-asc");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showMoreId, setShowMoreId] = useState<number | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);

  const [errors, setErrors] = useState({ title: "", date: "", description: "" });
  const [touched, setTouched] = useState({
    title: false,
    date: false,
    description: false,
  });

  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    localStorage.setItem("tasks", JSON.stringify(tasks));
  }, [tasks]);

  const validateFields = () => {
    const newErrors = { title: "", date: "", description: "" };
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);

    if (!title.trim()) {
      newErrors.title = "Title is required";
    } else if (!/^[a-zA-Z\s]+$/.test(title.trim())) {
      newErrors.title = "Title should only contain letters and spaces";
    }

    if (!date) {
      newErrors.date = "Date is required";
    } else {
      const selectedDate = new Date(date);
      if (selectedDate < todayDate) {
        newErrors.date = "Date cannot be in the past";
      }
    }

    if (!description.trim()) {
      newErrors.description = "Description is required";
    }

    setErrors(newErrors);
    return !newErrors.title && !newErrors.date && !newErrors.description;
  };

  const addOrUpdateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateFields()) return;

    if (editingId !== null) {
      setTasks((prev) =>
        prev.map((task) =>
          task.id === editingId ? { ...task, title, date, description } : task
        )
      );
      setEditingId(null);
    } else {
      const newTask: Task = {
        id: Date.now(),
        title,
        date,
        description,
        completed: false,
      };
      setTasks((prev) => [...prev, newTask]);
    }

    setTitle("");
    setDate("");
    setDescription("");
    setErrors({ title: "", date: "", description: "" });
    setTouched({ title: false, date: false, description: false });
  };

  const cancelTask = () => {
    setEditingId(null);
    setTitle("");
    setDate("");
    setDescription("");
    setErrors({ title: "", date: "", description: "" });
    setTouched({ title: false, date: false, description: false });
  };

  const deleteTask = (id: number) => {
    if (window.confirm("Are you sure to delete this task?")) {
      setTasks((prev) => prev.filter((t) => t.id !== id));
    }
  };

  const toggleDone = (id: number) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
  };

  const editTask = (task: Task) => {
    setTitle(task.title);
    setDate(task.date);
    setDescription(task.description);
    setEditingId(task.id);
    setErrors({ title: "", date: "", description: "" });
    setTouched({ title: false, date: false, description: false });
  };

  const getDaysLeft = (dueDate: string) => {
    const today = new Date();
    const due = new Date(dueDate);
    const diff = Math.ceil(
      (due.getTime() - today.getTime()) / (1000 * 3600 * 24)
    );
    return diff;
  };

  const getDaysText = (days: number) =>
    days > 0 ? `${days} day(s) left` : days === 0 ? "Due today" : `Overdue`;

  const filteredTasks = tasks
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
      if (sort === "date-desc")
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      return 0;
    });

  const total = tasks.length;
  const completed = tasks.filter((t) => t.completed).length;
  const pending = total - completed;

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-[#e0e7ff] via-[#f1f5f9] to-[#f8fafc] text-gray-800 relative overflow-x-hidden">
      <button
        onClick={() => setShowSidebar(!showSidebar)}
        className="lg:hidden fixed top-4 left-4 z-50 bg-white/80 backdrop-blur-md p-2 rounded-xl shadow-md text-2xl text-indigo-600"
      >
        {showSidebar ? <HiX /> : <HiMenuAlt3 />}
      </button>
      <AnimatePresence>
        {showSidebar && (
          <motion.aside
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed lg:static z-40 w-72 h-full lg:h-auto p-6 bg-white/80 backdrop-blur-lg border-r border-gray-200 shadow-xl lg:shadow-none rounded-none lg:rounded-r-3xl flex flex-col justify-between"
          >
            <div>
              <h1 className="text-3xl font-extrabold text-indigo-700 mb-8 flex items-center gap-2">
                <span className="text-4xl">🧠</span>
                Tasky
              </h1>

              <div className="space-y-4">
                <input
                  type="text"
                  placeholder="Search tasks..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-3 pr-4 py-2 border border-gray-300 rounded-xl bg-white/60 shadow-inner focus:outline-none focus:ring-2 focus:ring-indigo-300 transition"
                />
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as any)}
                  className="w-full pl-3 pr-4 py-2 border border-gray-300 rounded-xl bg-white/60 shadow-inner"
                >
                  <option value="All">All</option>
                  <option value="Pending">Pending</option>
                  <option value="Done">Done</option>
                </select>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as any)}
                  className="w-full pl-3 pr-4 py-2 border border-gray-300 rounded-xl bg-white/60 shadow-inner"
                >
                  <option value="date-asc">Sort by Date ↑</option>
                  <option value="date-desc">Sort by Date ↓</option>
                  <option value="title-asc">Sort by Title A-Z</option>
                  <option value="title-desc">Sort by Title Z-A</option>
                </select>
              </div>
            </div>

            <div className="mt-10 p-4 bg-gradient-to-br from-indigo-100 to-indigo-200 rounded-xl shadow-inner text-sm text-indigo-900 text-center animate-pulse">
              <p className="font-medium">💡 Stay focused & organized!</p>
              <p className="text-xs mt-1 italic">
                "A small step today makes big progress tomorrow."
              </p>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
      <main className="flex-1 p-6 sm:p-8 md:p-10">
        <div className="flex gap-4 justify-center mb-6 text-sm sm:text-base">
          <span className="bg-gray-100 px-3 py-1 rounded shadow">
            Total: {total}
          </span>
          <span className="bg-green-100 px-3 py-1 rounded shadow">
            Completed: {completed}
          </span>
          <span className="bg-yellow-100 px-3 py-1 rounded shadow">
            Pending: {pending}
          </span>
        </div>
        <motion.form
          onSubmit={addOrUpdateTask}
          className="bg-white/70 backdrop-blur-xl p-8 rounded-3xl shadow-2xl border border-gray-100 mb-10"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="grid md:grid-cols-3 gap-6">
            {/* Title */}
            <div>
              <input
                type="text"
                placeholder="Task Title"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setTouched((p) => ({ ...p, title: true }));
                  validateFields();
                }}
                className={`p-3 rounded-xl border w-full ${
                  errors.title && touched.title
                    ? "border-red-500"
                    : "border-gray-300"
                }`}
              />
              {errors.title && touched.title && (
                <p className="text-red-600 text-sm mt-1">{errors.title}</p>
              )}
            </div>

            {/* Date */}
            <div>
              <input
                type="date"
                min={today}
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setTouched((p) => ({ ...p, date: true }));
                  validateFields();
                }}
                className={`p-3 rounded-xl border w-full ${
                  errors.date && touched.date
                    ? "border-red-500"
                    : "border-gray-300"
                }`}
              />
              {errors.date && touched.date && (
                <p className="text-red-600 text-sm mt-1">{errors.date}</p>
              )}
            </div>

            {/* Description */}
            <div className="md:col-span-3">
              <textarea
                placeholder="Description"
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setTouched((p) => ({ ...p, description: true }));
                  validateFields();
                }}
                className={`p-3 rounded-xl border w-full h-32 resize-none ${
                  errors.description && touched.description
                    ? "border-red-500"
                    : "border-gray-300"
                }`}
              />
              {errors.description && touched.description && (
                <p className="text-red-600 text-sm mt-1">
                  {errors.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-4 mt-6">
            <button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-xl font-semibold shadow-md transition-all"
            >
              {editingId !== null ? "💾 Update Task" : "➕ Add Task"}
            </button>
            {editingId !== null && (
              <button
                type="button"
                onClick={cancelTask}
                className="text-gray-500 hover:text-red-500 underline transition"
              >
                Cancel
              </button>
            )}
          </div>
        </motion.form>

        {/* Tasks */}
        <ul className="space-y-6">
          <AnimatePresence>
            {filteredTasks.map((task, index) => {
              const daysLeft = getDaysLeft(task.date);
              const isExpanded = showMoreId === task.id;
              const isOverdue = !task.completed && daysLeft < 0;

              return (
                <motion.li
                  key={task.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: index * 0.03 }}
                  className={`p-6 rounded-3xl shadow-xl transition-all ${
                    isOverdue
                      ? "bg-red-100 border border-red-300"
                      : "bg-white/60 backdrop-blur-md border border-gray-200"
                  }`}
                >
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <h3
                        className={`text-xl font-semibold ${
                          task.completed
                            ? "line-through text-gray-400"
                            : "text-indigo-800"
                        }`}
                      >
                        {task.title}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {getDaysText(daysLeft)} ({task.date})
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => toggleDone(task.id)}
                        className={`px-4 py-1 rounded-full text-white text-sm font-semibold shadow-md transition ${
                          task.completed
                            ? "bg-gray-500 hover:bg-gray-600"
                            : "bg-green-500 hover:bg-green-600"
                        }`}
                      >
                        {task.completed ? "Undo" : "Done"}
                      </button>
                      <button
                        onClick={() => editTask(task)}
                        className="px-4 py-1 bg-yellow-500 hover:bg-yellow-600 text-white rounded-full text-sm font-semibold shadow-md"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="px-4 py-1 bg-red-500 hover:bg-red-600 text-white rounded-full text-sm font-semibold shadow-md"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <p
                    className={`mt-3 text-gray-700 ${
                      isExpanded ? "" : "line-clamp-3 overflow-hidden"
                    }`}
                  >
                    {task.description}
                  </p>
                  <button
                    onClick={() =>
                      setShowMoreId(isExpanded ? null : task.id)
                    }
                    className="text-indigo-500 hover:underline mt-2 text-sm"
                  >
                    {isExpanded ? "Read Less" : "Read More"}
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      </main>
    </div>
  );
};

export default TaskManager;
