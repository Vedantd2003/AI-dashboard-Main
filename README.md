# AI Dashboard (Main)

An early-stage Next.js dashboard for generating AI-style learning roadmaps.

## What it is
A Next.js app started from `create-next-app` with one feature layer added on top: a page that takes a topic, calls a mock API route, and renders a step-by-step "learning roadmap" with progress bars and a React Flow diagram. The roadmap data is currently mocked (not a live LLM call) and the project still carries most of the default Next.js scaffolding.

> Note: this repo appears to be a near-duplicate of [`AI-Dashboard`](https://github.com/Vedantd2003/AI-Dashboard) — same `package.json` (`"chatapp"`), same `page.js`, `RoadmapFlow.jsx`, and `TopicForm.jsx`. Treat one as the canonical version going forward.

## Demo
[TODO: add live demo link]

## Tech Stack
- Next.js 15 (App Router)
- React 19
- Tailwind CSS 4
- React Flow (`reactflow`) for the roadmap diagram
- Recharts for progress charts
- Framer Motion
- `openai` SDK (installed as a dependency, not yet wired into the mock API route)

## Features
- Topic input form (`TopicForm.jsx`) that triggers roadmap generation
- Mock `/api` route (`route.js`) that returns a hardcoded 4-step roadmap for any topic
- Roadmap visualization as both progress cards and a React Flow node graph (`RoadmapFlow.jsx`, `Roadmapchart.jsx`)
- "AI Insights" summary card based on roadmap completion percentage

## Local Setup
```bash
git clone https://github.com/Vedantd2003/AI-dashboard-Main.git
cd AI-dashboard-Main
npm install
npm run dev
```
Open http://localhost:3000.

> Note: `page.js` imports from `./components/TopicForm` and `./components/RoadmapChart`, but those files currently live at the project root rather than in a `components/` folder — this will need to be fixed for a clean build. [TODO: verify build status]
