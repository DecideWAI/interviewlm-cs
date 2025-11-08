"use client";

import React from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { go } from "@codemirror/lang-go";
import { EditorView } from "@codemirror/view";
import { Extension } from "@codemirror/state";

// Custom theme matching our pitch black design
const customTheme = EditorView.theme({
  "&": {
    backgroundColor: "#000000",
    color: "#E0E0E0",
    height: "100%",
  },
  ".cm-content": {
    caretColor: "#5E6AD2",
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
    fontSize: "14px",
    lineHeight: "1.6",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "#5E6AD2",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "rgba(94, 106, 210, 0.3)",
  },
  ".cm-activeLine": {
    backgroundColor: "#0A0A0A",
  },
  ".cm-gutters": {
    backgroundColor: "#000000",
    color: "#4A4A4A",
    border: "none",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "#0A0A0A",
    color: "#E0E0E0",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    padding: "0 8px 0 8px",
  },
}, { dark: true });

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: "javascript" | "typescript" | "python" | "go";
  fileName?: string;
  readOnly?: boolean;
  height?: string;
}

export function CodeEditor({
  value,
  onChange,
  language = "javascript",
  fileName,
  readOnly = false,
  height = "100%",
}: CodeEditorProps) {
  // Select language extension
  const getLanguageExtension = (): Extension => {
    switch (language) {
      case "python":
        return python();
      case "go":
        return go();
      case "javascript":
      case "typescript":
      default:
        return javascript({ typescript: language === "typescript", jsx: true });
    }
  };

  const extensions = [
    getLanguageExtension(),
    customTheme,
    EditorView.lineWrapping,
  ];

  return (
    <div className="h-full w-full bg-background overflow-hidden">
      <CodeMirror
        value={value}
        height={height}
        extensions={extensions}
        onChange={onChange}
        readOnly={readOnly}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLineGutter: true,
          highlightSpecialChars: true,
          history: true,
          foldGutter: true,
          drawSelection: true,
          dropCursor: true,
          allowMultipleSelections: true,
          indentOnInput: true,
          syntaxHighlighting: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: true,
          rectangularSelection: true,
          crosshairCursor: true,
          highlightActiveLine: true,
          highlightSelectionMatches: true,
          closeBracketsKeymap: true,
          searchKeymap: true,
          foldKeymap: true,
          completionKeymap: true,
          lintKeymap: true,
        }}
        className="text-sm"
      />
    </div>
  );
}
