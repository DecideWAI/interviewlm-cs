"use client";
import { useState } from "react";

export default function DebugCreateAssessment() {
    const [result, setResult] = useState<any>(null);

    const create = async () => {
        try {
            const res = await fetch("/api/assessments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: "Debug Assessment",
                    role: "backend",
                    seniority: "JUNIOR",
                    techStack: ["Python"],
                    duration: 40,
                    enableCoding: true,
                    enableTerminal: true,
                    enableAI: true
                })
            });
            const data = await res.json();
            setResult(data);
        } catch (e: any) {
            setResult({ error: e.toString() });
        }
    };

    return (
        <div className="p-10">
            <h1>Debug Create Assessment</h1>
            <button id="create-btn" onClick={create} className="bg-blue-500 text-white p-2 rounded">
                Create Assessment
            </button>
            {result && (
                <pre id="result-output" className="mt-4 bg-gray-100 p-4 text-black">
                    {JSON.stringify(result, null, 2)}
                </pre>
            )}
        </div>
    );
}
