import { useEffect, useState } from "react";

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
  const [sort, setSort] = useState<"title-asc" | "title-desc" | "date-asc" | "date-desc">("date-asc");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showMoreId, setShowMoreId] = useState<number | null>(null);

  const [errors, setErrors] = useState({ title: "", date: "", description: "" });
  const [touched, setTouched] = useState({ title: false, date: false, description: false });

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
    const diff = Math.ceil((due.getTime() - today.getTime()) / (1000 * 3600 * 24));
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
      if (sort === "date-asc") return new Date(a.date).getTime() - new Date(b.date).getTime();
      if (sort === "date-desc") return new Date(b.date).getTime() - new Date(a.date).getTime();
      return 0;
    });

  const total = tasks.length;
  const completed = tasks.filter((t) => t.completed).length;
  const pending = total - completed;

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-blue-300 via-white to-purple-100 py-10 px-4">
      <div className="p-4 max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-6 text-blue-700">Task Manager</h1>

        <div className="flex gap-4 justify-center mb-6 text-sm sm:text-base">
          <span className="bg-gray-100 px-3 py-1 rounded shadow">Total: {total}</span>
          <span className="bg-green-100 px-3 py-1 rounded shadow">Completed: {completed}</span>
          <span className="bg-yellow-100 px-3 py-1 rounded shadow">Pending: {pending}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          <input
            type="text"
            placeholder="Search by title"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="p-2 border rounded w-full focus:outline-none"
          />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="p-2 border rounded w-full"
          >
            <option>All</option>
            <option>Pending</option>
            <option>Done</option>
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as any)}
            className="p-2 border rounded w-full"
          >
            <option value="date-asc">Sort by Date ↑</option>
            <option value="date-desc">Sort by Date ↓</option>
            <option value="title-asc">Sort by Title A-Z</option>
            <option value="title-desc">Sort by Title Z-A</option>
          </select>
        </div>

        <form onSubmit={addOrUpdateTask} className="space-y-3 mb-8">
          <div>
            <input
              name="toname"
              type="text"
              value={title}
              onChange={(e) => {
                const value = e.target.value;
                setTitle(value);

                if (!value.trim()) {
                  setErrors((prev) => ({ ...prev, title: "Title is required" }));
                } else if (!/^[a-zA-Z\s]+$/.test(value)) {
                  setErrors((prev) => ({
                    ...prev,
                    title: "Title should only contain letters and spaces",
                  }));
                } else {
                  setErrors((prev) => ({ ...prev, title: "" }));
                }
              }}
              placeholder="Task Title"
              onBlur={() => setTouched((prev) => ({ ...prev, title: true }))}
              className={`w-full p-2 border-1 rounded focus:outline-none ${
                errors.title ? "border-red-500" : ""
              }`}
            />
            {errors.title && (
              <p className="text-sm text-red-600">{errors.title}</p>
            )}
          </div>
          <div>
            <input
              name="todate"
              type="date"
              value={date}
              min={today}
              onChange={(e) => {
                const value = e.target.value;
                setDate(value);

                const selectedDate = new Date(value);
                const todayDate = new Date();
                todayDate.setHours(0, 0, 0, 0);

                if (!value) {
                  setErrors((prev) => ({ ...prev, date: "Date is required" }));
                } else if (selectedDate < todayDate) {
                  setErrors((prev) => ({ ...prev, date: "Date cannot be in the past" }));
                } else {
                  setErrors((prev) => ({ ...prev, date: "" }));
                }
              }}
              onBlur={() => setTouched((prev) => ({ ...prev, date: true }))}
              className={`w-full p-2 rounded focus:outline-none border ${
                errors.date && touched.date ? "border-red-500" : "border-1"
              }`}
            />
            {errors.date && touched.date && (
              <p className="text-sm text-red-600">{errors.date}</p>
            )}
          </div>
          <div>
            <textarea
              name="todescription"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => setTouched((prev) => ({ ...prev, description: true }))}
              placeholder="Task Description"
              className={`w-full p-2 border focus:outline-none rounded h-[140px] ${
                errors.description && touched.description ? "border-red-500" : "border-1"
              }`}
            />
            {errors.description && touched.description && (
              <p className="text-sm text-red-600">{errors.description}</p>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="w-full p-2 bg-blue-600 text-white font-semibold rounded hover:bg-blue-700 transition"
            >
              {editingId !== null ? "Update Task" : "Add Task"}
            </button>

            {editingId !== null && (
              <button
                type="button"
                onClick={cancelTask}
                className="w-full p-2 bg-red-600 text-white font-semibold rounded hover:bg-red-700 transition"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
        <ul className="space-y-4">
          {filteredTasks.map((task) => {
            const daysLeft = getDaysLeft(task.date);
            const highlightRed = !task.completed && daysLeft <= 2;
            const isExpanded = showMoreId === task.id;

            return (
              <li
                key={task.id}
                className={`p-4 border rounded shadow space-y-2 transition ${
                  highlightRed ? "bg-red-100 border-red-300" : "bg-red-100"
                }`}
              >
                <div className="flex flex-col sm:flex-row justify-between sm:items-center">
                  <h2
                    className={`text-lg font-bold ${
                      task.completed ? "line-through text-gray-400" : "text-gray-900"
                    }`}
                  >
                    {task.title}
                  </h2>
                  <span className="text-sm text-gray-600">
                    {getDaysText(daysLeft)} ({task.date})
                  </span>
                </div>

                <div>
                  <p className={`text-gray-700 ${isExpanded ? "line-clamp-none" : "line-clamp-3"}`}>
                    {task.description}
                  </p>

                  {!isExpanded ? (
                    <button className="hover:underline" onClick={() => setShowMoreId(task.id)}>
                      Read More
                    </button>
                  ) : (
                    <button className="hover:underline" onClick={() => setShowMoreId(null)}>
                      Read Less
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 mt-2">
                  <button
                    onClick={() => toggleDone(task.id)}
                    className={`px-3 py-1 rounded text-white ${
                      task.completed ? "bg-gray-500" : "bg-green-600 hover:bg-green-700"
                    }`}
                  >
                    {task.completed ? "Undo" : "Mark Done"}
                  </button>

                  <button
                    onClick={() => editTask(task)}
                    className="px-3 py-1 bg-yellow-500 hover:bg-yellow-600 text-white rounded"
                  >
                    Edit
                  </button>

                  <button
                    onClick={() => deleteTask(task.id)}
                    className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded"
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};

export default TaskManager;
