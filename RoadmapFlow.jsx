"use client";
import React, { useCallback } from "react";
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
} from "reactflow";
import "reactflow/dist/style.css";

export default function RoadmapFlow({ data }) {
  // Convert roadmap data into flow nodes
  const initialNodes = data.map((step, index) => ({
    id: String(index),
    position: { x: 100 * index, y: index % 2 === 0 ? 50 : 200 },
    data: { label: step.topic },
    style: {
      padding: 10,
      borderRadius: 12,
      backgroundColor: "#f3f4f6",
      border: "1px solid #d1d5db",
      fontSize: 14,
      fontWeight: 500,
    },
  }));

  const initialEdges = data.slice(1).map((_, index) => ({
    id: `e${index}-${index + 1}`,
    source: String(index),
    target: String(index + 1),
    animated: true,
    style: { stroke: "#6366f1" },
  }));

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  return (
    <div className="w-full h-[400px] border rounded-xl shadow-md">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
      >
        <MiniMap />
        <Controls />
        <Background color="#aaa" gap={16} />
      </ReactFlow>
    </div>
  );
}
