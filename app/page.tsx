
"use client";

import { useEffect, useState } from "react";

type Task = {
  id: number;
  title: string;
  completed: boolean;
};

const API = "http://localhost:5000/api/tasks";

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");

  async function loadTasks() {
    try {
      const res = await fetch(API);
      if (!res.ok) throw new Error("Could not load tasks");
      setTasks(await res.json());
    } catch {
      setError("Backend unavailable. Check port 5000.");
    }
  }

  useEffect(() => {
    loadTasks();
  }, []);

  async function addTask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim()) return;

    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to add task");

      setTasks((previous) => [...previous, data.task]);
      setTitle("");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    }
  }

  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="mb-2 text-3xl font-bold">
        NeoStats Task Manager
      </h1>
      <p className="mb-6 text-gray-600">
        Next.js + Express API
      </p>

      <form onSubmit={addTask} className="mb-6 flex gap-2">
        <input
          className="min-w-0 flex-1 rounded border p-3"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Enter a task"
        />
        <button className="rounded bg-blue-600 px-4 text-white">
          Add
        </button>
      </form>

      {error && <p className="mb-3 text-red-600">{error}</p>}

      <ul className="space-y-2">
        {tasks.map((task) => (
          <li key={task.id} className="rounded border p-3">
            {task.title}
          </li>
        ))}
      </ul>
    </main>
  );
}
