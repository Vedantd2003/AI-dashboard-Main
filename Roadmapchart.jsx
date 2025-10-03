"use client";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar
} from "recharts";
import { useState } from "react";

export default function RoadmapChart({ data }) {
  const [view, setView] = useState("line");

  if (!data || data.length === 0) return null;

  return (
    <div className="w-full mt-10">
      {/* Toggle Buttons */}
      <div className="flex gap-3 justify-center mb-4">
        <button
          onClick={() => setView("line")}
          className={`px-4 py-2 rounded-lg ${
            view === "line" ? "bg-purple-600 text-white" : "bg-gray-700 text-gray-300"
          }`}
        >
          Line Chart
        </button>
        <button
          onClick={() => setView("bar")}
          className={`px-4 py-2 rounded-lg ${
            view === "bar" ? "bg-purple-600 text-white" : "bg-gray-700 text-gray-300"
          }`}
        >
          Bar Chart
        </button>
      </div>

      {/* Chart */}
      <div className="h-80 bg-white/10 backdrop-blur-md rounded-xl p-4">
        <ResponsiveContainer>
          {view === "line" ? (
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#555" />
              <XAxis dataKey="title" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Line type="monotone" dataKey="progress" stroke="#8b5cf6" strokeWidth={3} />
            </LineChart>
          ) : (
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#555" />
              <XAxis dataKey="title" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Bar dataKey="progress" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
