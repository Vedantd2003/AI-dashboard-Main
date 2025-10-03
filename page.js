"use client";
import { useState } from "react";
import TopicForm from "./components/TopicForm";
import RoadmapChart from "./components/RoadmapChart";
import { CheckCircle } from "lucide-react";

export default function Page() {
  const [roadmap, setRoadmap] = useState([]);

  const completion = roadmap.length
    ? roadmap[roadmap.length - 1].progress
    : 0;

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-black text-white flex flex-col items-center p-10">
      {/* Hero Section */}
      <section className="text-center mt-10">
        <h1 className="text-4xl md:text-6xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-500 animate-pulse">
          🚀 AI-Powered Learning Dashboard
        </h1>
        <p className="mt-4 text-gray-300 text-lg">
          Type a topic and generate your personalized roadmap
        </p>
      </section>

      {/* Input */}
      <TopicForm onRoadmap={setRoadmap} />

      {/* Charts */}
      <RoadmapChart data={roadmap} />

      {/* Roadmap Steps */}
      {roadmap.length > 0 && (
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 w-full max-w-5xl">
          {roadmap.map((step) => (
            <div
              key={step.step}
              className="p-6 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 flex flex-col gap-2 hover:scale-105 transition"
            >
              <div className="flex items-center gap-2">
                <CheckCircle className="text-green-400" size={20} />
                <h3 className="font-semibold text-lg">Step {step.step}</h3>
              </div>
              <p className="text-gray-200">{step.title}</p>
              <div className="w-full bg-gray-700 rounded-full h-2 mt-2">
                <div
                  className="bg-purple-500 h-2 rounded-full"
                  style={{ width: `${step.progress}%` }}
                />
              </div>
              <span className="text-sm text-gray-400">{step.progress}% complete</span>
            </div>
          ))}
        </div>
      )}

      {/* AI Feedback */}
      {completion > 0 && (
        <div className="mt-10 p-6 bg-white/10 rounded-xl border border-white/20 max-w-xl text-center">
          <h2 className="text-xl font-bold mb-2">📊 AI Insights</h2>
          <p className="text-gray-300">
            You’re currently <span className="text-purple-400">{completion}%</span> through
            your learning journey. Keep pushing forward 🚀
          </p>
        </div>
      )}
    </main>
  );
}
