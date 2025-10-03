"use client";
import { useState } from "react";

export default function TopicForm({ onRoadmap }) {
  const [topic, setTopic] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    const res = await fetch("/api/roadmap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic }),
    });

    const data = await res.json();
    onRoadmap(data.roadmap);
    setTopic("");
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex gap-3 w-full max-w-lg mx-auto mt-8"
    >
      <input
        type="text"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        placeholder="Enter a topic (e.g., React, Python)"
        className="flex-1 px-4 py-2 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
      />
      <button
        type="submit"
        className="px-6 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition"
      >
        Generate
      </button>
    </form>
  );
}
