/**
 * Technology Catalog
 * Comprehensive catalog of supported technologies with detection patterns
 */

import { Technology, Role } from "@/types/assessment";

/**
 * LANGUAGES
 */
export const LANGUAGES: Record<string, Technology> = {
  python: {
    id: "python",
    name: "Python",
    category: "language",
    icon: "FileCode2",
    description: "General-purpose programming language",
    color: "#3776AB",
    detectionPatterns: {
      fileExtensions: [".py", ".pyi", ".pyw"],
      importPatterns: ["import ", "from ", "def ", "class "],
    },
    commonlyPairedWith: ["fastapi", "django", "flask", "pytest", "sqlalchemy"],
  },
  javascript: {
    id: "javascript",
    name: "JavaScript",
    category: "language",
    icon: "FileCode2",
    description: "Dynamic programming language for web",
    color: "#F7DF1E",
    detectionPatterns: {
      fileExtensions: [".js", ".mjs", ".cjs"],
      importPatterns: ["import ", "require(", "export ", "const ", "let ", "var "],
    },
    commonlyPairedWith: ["react", "nodejs", "express", "jest"],
  },
  typescript: {
    id: "typescript",
    name: "TypeScript",
    category: "language",
    icon: "FileCode2",
    description: "Typed superset of JavaScript",
    color: "#3178C6",
    detectionPatterns: {
      fileExtensions: [".ts", ".tsx"],
      importPatterns: ["import ", "export ", "interface ", "type ", "const ", "let "],
    },
    commonlyPairedWith: ["react", "nodejs", "express", "jest", "nextjs"],
  },
  go: {
    id: "go",
    name: "Go",
    category: "language",
    icon: "FileCode2",
    description: "Statically typed compiled language",
    color: "#00ADD8",
    detectionPatterns: {
      fileExtensions: [".go"],
      importPatterns: ["package ", "import ", "func ", "type ", "var "],
    },
    commonlyPairedWith: ["gin", "postgresql", "redis"],
  },
  java: {
    id: "java",
    name: "Java",
    category: "language",
    icon: "FileCode2",
    description: "Object-oriented programming language",
    color: "#007396",
    detectionPatterns: {
      fileExtensions: [".java"],
      importPatterns: ["import ", "package ", "public class ", "public interface "],
    },
    commonlyPairedWith: ["spring", "junit", "maven"],
  },
  rust: {
    id: "rust",
    name: "Rust",
    category: "language",
    icon: "FileCode2",
    description: "Systems programming language",
    color: "#CE422B",
    detectionPatterns: {
      fileExtensions: [".rs"],
      importPatterns: ["use ", "fn ", "struct ", "impl ", "mod "],
    },
    commonlyPairedWith: ["actix", "tokio"],
  },
};

/**
 * FRAMEWORKS
 */
export const FRAMEWORKS: Record<string, Technology> = {
  // Python Frameworks
  fastapi: {
    id: "fastapi",
    name: "FastAPI",
    category: "framework",
    icon: "Zap",
    description: "Modern Python web framework",
    color: "#009688",
    detectionPatterns: {
      importPatterns: ["from fastapi import", "import fastapi", "FastAPI()"],
    },
    commonlyPairedWith: ["python", "pydantic", "uvicorn", "postgresql"],
  },
  django: {
    id: "django",
    name: "Django",
    category: "framework",
    icon: "Layers",
    description: "Full-featured Python web framework",
    color: "#092E20",
    detectionPatterns: {
      importPatterns: ["from django", "import django", "django."],
    },
    commonlyPairedWith: ["python", "postgresql", "redis"],
  },
  flask: {
    id: "flask",
    name: "Flask",
    category: "framework",
    icon: "Flame",
    description: "Lightweight Python web framework",
    color: "#000000",
    detectionPatterns: {
      importPatterns: ["from flask import", "import flask", "Flask("],
    },
    commonlyPairedWith: ["python", "sqlalchemy", "postgresql"],
  },
  pydantic: {
    id: "pydantic",
    name: "Pydantic",
    category: "framework",
    icon: "CheckCircle",
    description: "Data validation library for Python",
    color: "#E92063",
    detectionPatterns: {
      importPatterns: ["from pydantic import", "import pydantic", "BaseModel"],
    },
    commonlyPairedWith: ["python", "fastapi"],
  },
  sqlalchemy: {
    id: "sqlalchemy",
    name: "SQLAlchemy",
    category: "framework",
    icon: "Database",
    description: "Python SQL toolkit and ORM",
    color: "#D71F00",
    detectionPatterns: {
      importPatterns: ["from sqlalchemy import", "import sqlalchemy"],
    },
    commonlyPairedWith: ["python", "postgresql", "mysql"],
  },

  // JavaScript/TypeScript Frameworks
  react: {
    id: "react",
    name: "React",
    category: "framework",
    icon: "Atom",
    description: "JavaScript library for building UIs",
    color: "#61DAFB",
    detectionPatterns: {
      importPatterns: ["from 'react'", 'from "react"', "import React"],
      fileExtensions: [".jsx", ".tsx"],
    },
    commonlyPairedWith: ["typescript", "javascript", "nextjs", "tailwind"],
  },
  nextjs: {
    id: "nextjs",
    name: "Next.js",
    category: "framework",
    icon: "Triangle",
    description: "React framework for production",
    color: "#000000",
    detectionPatterns: {
      importPatterns: ["from 'next", 'from "next', "next/"],
    },
    commonlyPairedWith: ["react", "typescript", "tailwind"],
  },
  express: {
    id: "express",
    name: "Express",
    category: "framework",
    icon: "Server",
    description: "Node.js web framework",
    color: "#000000",
    detectionPatterns: {
      importPatterns: ["require('express')", 'from "express"', "express()"],
    },
    commonlyPairedWith: ["nodejs", "javascript", "typescript", "postgresql"],
  },
  nodejs: {
    id: "nodejs",
    name: "Node.js",
    category: "framework",
    icon: "Hexagon",
    description: "JavaScript runtime",
    color: "#339933",
    detectionPatterns: {
      importPatterns: ["require(", "module.exports", "process.env"],
    },
    commonlyPairedWith: ["javascript", "typescript", "express", "mongodb"],
  },

  // Go Frameworks
  gin: {
    id: "gin",
    name: "Gin",
    category: "framework",
    icon: "Wind",
    description: "Go web framework",
    color: "#00ADD8",
    detectionPatterns: {
      importPatterns: ['"github.com/gin-gonic/gin"', "gin."],
    },
    commonlyPairedWith: ["go", "postgresql", "redis"],
  },

  // Java Frameworks
  spring: {
    id: "spring",
    name: "Spring Boot",
    category: "framework",
    icon: "Leaf",
    description: "Java application framework",
    color: "#6DB33F",
    detectionPatterns: {
      importPatterns: ["org.springframework", "@SpringBootApplication"],
    },
    commonlyPairedWith: ["java", "postgresql", "mysql"],
  },
};

/**
 * DATABASES
 */
export const DATABASES: Record<string, Technology> = {
  postgresql: {
    id: "postgresql",
    name: "PostgreSQL",
    category: "database",
    icon: "Database",
    description: "Advanced open source relational database",
    color: "#336791",
    detectionPatterns: {
      importPatterns: ["psycopg2", "postgresql://", "pg.", "postgres"],
    },
    commonlyPairedWith: ["python", "nodejs", "go", "java"],
  },
  mysql: {
    id: "mysql",
    name: "MySQL",
    category: "database",
    icon: "Database",
    description: "Popular open source relational database",
    color: "#4479A1",
    detectionPatterns: {
      importPatterns: ["mysql", "pymysql", "mysql://"],
    },
    commonlyPairedWith: ["python", "nodejs", "java"],
  },
  mongodb: {
    id: "mongodb",
    name: "MongoDB",
    category: "database",
    icon: "Database",
    description: "NoSQL document database",
    color: "#47A248",
    detectionPatterns: {
      importPatterns: ["pymongo", "mongoose", "mongodb://", "MongoClient"],
    },
    commonlyPairedWith: ["nodejs", "python", "javascript"],
  },
  redis: {
    id: "redis",
    name: "Redis",
    category: "database",
    icon: "Database",
    description: "In-memory data structure store",
    color: "#DC382D",
    detectionPatterns: {
      importPatterns: ["redis", "Redis(", "redis://"],
    },
    commonlyPairedWith: ["python", "nodejs", "go"],
  },
  sqlite: {
    id: "sqlite",
    name: "SQLite",
    category: "database",
    icon: "Database",
    description: "Lightweight embedded database",
    color: "#003B57",
    detectionPatterns: {
      importPatterns: ["sqlite3", "sqlite://"],
      fileExtensions: [".db", ".sqlite"],
    },
    commonlyPairedWith: ["python", "nodejs"],
  },
};

/**
 * TESTING FRAMEWORKS
 */
export const TESTING: Record<string, Technology> = {
  pytest: {
    id: "pytest",
    name: "pytest",
    category: "testing",
    icon: "TestTube",
    description: "Python testing framework",
    color: "#0A9EDC",
    detectionPatterns: {
      importPatterns: ["import pytest", "from pytest"],
      fileExtensions: ["test_*.py", "*_test.py"],
    },
    commonlyPairedWith: ["python"],
  },
  jest: {
    id: "jest",
    name: "Jest",
    category: "testing",
    icon: "TestTube",
    description: "JavaScript testing framework",
    color: "#C21325",
    detectionPatterns: {
      importPatterns: ["from 'jest'", "describe(", "it(", "test("],
    },
    commonlyPairedWith: ["javascript", "typescript", "react"],
  },
  junit: {
    id: "junit",
    name: "JUnit",
    category: "testing",
    icon: "TestTube",
    description: "Java testing framework",
    color: "#25A162",
    detectionPatterns: {
      importPatterns: ["org.junit", "@Test"],
    },
    commonlyPairedWith: ["java"],
  },
  unittest: {
    id: "unittest",
    name: "unittest",
    category: "testing",
    icon: "TestTube",
    description: "Python built-in testing framework",
    color: "#3776AB",
    detectionPatterns: {
      importPatterns: ["import unittest", "from unittest"],
    },
    commonlyPairedWith: ["python"],
  },
};

/**
 * TOOLS & INFRASTRUCTURE
 */
export const TOOLS: Record<string, Technology> = {
  docker: {
    id: "docker",
    name: "Docker",
    category: "tool",
    icon: "Container",
    description: "Container platform",
    color: "#2496ED",
    detectionPatterns: {
      fileExtensions: ["Dockerfile", ".dockerignore"],
      importPatterns: ["FROM ", "RUN ", "COPY ", "EXPOSE "],
    },
  },
  kubernetes: {
    id: "kubernetes",
    name: "Kubernetes",
    category: "tool",
    icon: "Boxes",
    description: "Container orchestration",
    color: "#326CE5",
    detectionPatterns: {
      fileExtensions: [".yaml", ".yml"],
      importPatterns: ["apiVersion:", "kind: Deployment", "kind: Service"],
    },
  },
  git: {
    id: "git",
    name: "Git",
    category: "tool",
    icon: "GitBranch",
    description: "Version control system",
    color: "#F05032",
    detectionPatterns: {
      fileExtensions: [".gitignore"],
    },
  },
  nginx: {
    id: "nginx",
    name: "Nginx",
    category: "tool",
    icon: "Server",
    description: "Web server and reverse proxy",
    color: "#009639",
    detectionPatterns: {
      fileExtensions: ["nginx.conf"],
      importPatterns: ["server {", "location "],
    },
  },
  celery: {
    id: "celery",
    name: "Celery",
    category: "tool",
    icon: "Repeat",
    description: "Distributed task queue",
    color: "#37814A",
    detectionPatterns: {
      importPatterns: ["from celery import", "import celery", "Celery("],
    },
    commonlyPairedWith: ["python", "redis", "rabbitmq"],
  },
  rabbitmq: {
    id: "rabbitmq",
    name: "RabbitMQ",
    category: "tool",
    icon: "Rabbit",
    description: "Message broker",
    color: "#FF6600",
    detectionPatterns: {
      importPatterns: ["pika", "amqp://"],
    },
    commonlyPairedWith: ["python", "nodejs"],
  },
  tailwind: {
    id: "tailwind",
    name: "Tailwind CSS",
    category: "tool",
    icon: "Palette",
    description: "Utility-first CSS framework",
    color: "#06B6D4",
    detectionPatterns: {
      fileExtensions: ["tailwind.config.js", "tailwind.config.ts"],
      importPatterns: ["className=", 'class="'],
    },
    commonlyPairedWith: ["react", "nextjs"],
  },
};

/**
 * Combine all technologies into one catalog
 */
export const TECH_CATALOG: Record<string, Technology> = {
  ...LANGUAGES,
  ...FRAMEWORKS,
  ...DATABASES,
  ...TESTING,
  ...TOOLS,
};

/**
 * Get all technologies by category
 */
export function getTechnologiesByCategory(category: string): Technology[] {
  return Object.values(TECH_CATALOG).filter((tech) => tech.category === category);
}

/**
 * Get technology by ID
 */
export function getTechnologyById(id: string): Technology | undefined {
  return TECH_CATALOG[id];
}

/**
 * Smart suggestions based on role
 */
export function getTechSuggestionsForRole(role: Role): {
  critical: Technology[];
  required: Technology[];
  recommended: Technology[];
  optional: Technology[];
} {
  const suggestions = {
    backend: {
      critical: [LANGUAGES.python],
      required: [FRAMEWORKS.fastapi, FRAMEWORKS.pydantic],
      recommended: [DATABASES.postgresql, DATABASES.redis, TESTING.pytest],
      optional: [TOOLS.docker, TOOLS.celery],
    },
    frontend: {
      critical: [LANGUAGES.typescript],
      required: [FRAMEWORKS.react, FRAMEWORKS.nextjs],
      recommended: [TOOLS.tailwind, TESTING.jest],
      optional: [TOOLS.docker],
    },
    fullstack: {
      critical: [LANGUAGES.typescript],
      required: [FRAMEWORKS.react, FRAMEWORKS.nextjs, FRAMEWORKS.nodejs],
      recommended: [DATABASES.postgresql, TESTING.jest],
      optional: [TOOLS.docker],
    },
    database: {
      critical: [LANGUAGES.python],
      required: [DATABASES.postgresql, FRAMEWORKS.sqlalchemy],
      recommended: [DATABASES.redis, TESTING.pytest],
      optional: [TOOLS.docker],
    },
    ml: {
      critical: [LANGUAGES.python],
      required: [],
      recommended: [DATABASES.postgresql, TESTING.pytest],
      optional: [TOOLS.docker],
    },
    security: {
      critical: [LANGUAGES.python],
      required: [],
      recommended: [TESTING.pytest],
      optional: [TOOLS.docker],
    },
    custom: {
      critical: [],
      required: [],
      recommended: [],
      optional: [],
    },
  };

  return suggestions[role] || suggestions.custom;
}

/**
 * Get common tech stacks (presets)
 */
export const TECH_STACK_PRESETS = {
  "python-backend": {
    name: "Python Backend (FastAPI)",
    description: "Modern Python backend with FastAPI and PostgreSQL",
    critical: [LANGUAGES.python],
    required: [FRAMEWORKS.fastapi, FRAMEWORKS.pydantic],
    recommended: [DATABASES.postgresql, TESTING.pytest],
    optional: [TOOLS.docker, DATABASES.redis],
  },
  "python-django": {
    name: "Python Backend (Django)",
    description: "Full-featured Django backend",
    critical: [LANGUAGES.python],
    required: [FRAMEWORKS.django],
    recommended: [DATABASES.postgresql, TESTING.pytest],
    optional: [TOOLS.docker, DATABASES.redis],
  },
  "javascript-fullstack": {
    name: "JavaScript Full Stack",
    description: "React + Node.js full stack",
    critical: [LANGUAGES.javascript],
    required: [FRAMEWORKS.react, FRAMEWORKS.nodejs, FRAMEWORKS.express],
    recommended: [DATABASES.postgresql, TESTING.jest],
    optional: [TOOLS.docker],
  },
  "typescript-fullstack": {
    name: "TypeScript Full Stack",
    description: "Next.js + Node.js with TypeScript",
    critical: [LANGUAGES.typescript],
    required: [FRAMEWORKS.nextjs, FRAMEWORKS.nodejs],
    recommended: [DATABASES.postgresql, TESTING.jest],
    optional: [TOOLS.docker, TOOLS.tailwind],
  },
  "go-backend": {
    name: "Go Backend",
    description: "High-performance Go backend with Gin",
    critical: [LANGUAGES.go],
    required: [FRAMEWORKS.gin],
    recommended: [DATABASES.postgresql, DATABASES.redis],
    optional: [TOOLS.docker],
  },
};
