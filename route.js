export async function POST(req) {
  const { topic } = await req.json();

  // Mock AI roadmap
  const roadmap = [
    { step: 1, title: `Intro to ${topic}`, progress: 20 },
    { step: 2, title: `${topic} Core Concepts`, progress: 40 },
    { step: 3, title: `Build a Project with ${topic}`, progress: 70 },
    { step: 4, title: `Advanced ${topic}`, progress: 100 },
  ];

  return Response.json({ roadmap });
}
