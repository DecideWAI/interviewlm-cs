/**
 * Technology Catalog
 *
 * Technology data is stored in the database (Technology table).
 * Use getTechnologies() from config-service for runtime access.
 */

import { Technology, Role } from "@/types/assessment";

// Re-export async functions from config-service
export {
  getTechnologies,
  getTechnology,
} from "@/lib/services/config-service";

// Re-export types
export type { TechnologyData } from "@/lib/services/config-service";

// =============================================================================
// DEPRECATED: Hardcoded exports (kept for seed scripts)
// These are used by prisma/seeds/tech-seeds.ts to populate the database.
// Runtime code should use getTechnologies() from config-service.
// =============================================================================

/**
 * LANGUAGES
 * @deprecated Use getTechnologies({ category: 'language' }) from config-service instead
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
  csharp: {
    id: "csharp",
    name: "C#",
    category: "language",
    icon: "FileCode2",
    description: "Modern, object-oriented language",
    color: "#239120",
    detectionPatterns: {
      fileExtensions: [".cs"],
      importPatterns: ["using ", "namespace ", "public class "],
    },
    commonlyPairedWith: ["dotnet", "entityframework", "nunit"],
  },
  php: {
    id: "php",
    name: "PHP",
    category: "language",
    icon: "FileCode2",
    description: "Server-side scripting language",
    color: "#777BB4",
    detectionPatterns: {
      fileExtensions: [".php"],
      importPatterns: ["<?php", "namespace ", "use "],
    },
    commonlyPairedWith: ["laravel", "symfony", "phpunit"],
  },
  ruby: {
    id: "ruby",
    name: "Ruby",
    category: "language",
    icon: "FileCode2",
    description: "Dynamic, open source language",
    color: "#CC342D",
    detectionPatterns: {
      fileExtensions: [".rb"],
      importPatterns: ["require ", "def ", "class "],
    },
    commonlyPairedWith: ["rails", "rspec"],
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
  scala: {
    id: "scala",
    name: "Scala",
    category: "language",
    icon: "FileCode2",
    description: "General-purpose programming language",
    color: "#DC322F",
    detectionPatterns: {
      fileExtensions: [".scala"],
      importPatterns: ["import ", "object ", "class ", "trait "],
    },
    commonlyPairedWith: ["akka", "play"],
  },
  kotlin: {
    id: "kotlin",
    name: "Kotlin",
    category: "language",
    icon: "FileCode2",
    description: "Modern programming language",
    color: "#7F52FF",
    detectionPatterns: {
      fileExtensions: [".kt", ".kts"],
      importPatterns: ["import ", "fun ", "class ", "val "],
    },
    commonlyPairedWith: ["spring", "ktor"],
  },
  swift: {
    id: "swift",
    name: "Swift",
    category: "language",
    icon: "FileCode2",
    description: "General-purpose, multi-paradigm language",
    color: "#F05138",
    detectionPatterns: {
      fileExtensions: [".swift"],
      importPatterns: ["import ", "func ", "class ", "struct "],
    },
    commonlyPairedWith: ["vapor"],
  },
};

/**
 * FRAMEWORKS
 * @deprecated Use getTechnologies({ category: 'framework' }) from config-service instead
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
  echo: {
    id: "echo",
    name: "Echo",
    category: "framework",
    icon: "Wind",
    description: "High performance Go framework",
    color: "#00ADD8",
    detectionPatterns: {
      importPatterns: ['"github.com/labstack/echo"', "echo."],
    },
    commonlyPairedWith: ["go", "postgresql"],
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
  hibernate: {
    id: "hibernate",
    name: "Hibernate",
    category: "framework",
    icon: "Database",
    description: "Java ORM framework",
    color: "#59666C",
    detectionPatterns: {
      importPatterns: ["org.hibernate"],
    },
    commonlyPairedWith: ["java", "spring"],
  },

  // C# Frameworks
  dotnet: {
    id: "dotnet",
    name: ".NET Core",
    category: "framework",
    icon: "Box",
    description: "Cross-platform framework",
    color: "#512BD4",
    detectionPatterns: {
      importPatterns: ["Microsoft.AspNetCore"],
    },
    commonlyPairedWith: ["csharp", "entityframework"],
  },
  entityframework: {
    id: "entityframework",
    name: "Entity Framework",
    category: "framework",
    icon: "Database",
    description: ".NET ORM",
    color: "#512BD4",
    detectionPatterns: {
      importPatterns: ["Microsoft.EntityFrameworkCore"],
    },
    commonlyPairedWith: ["csharp", "dotnet"],
  },

  // PHP Frameworks
  laravel: {
    id: "laravel",
    name: "Laravel",
    category: "framework",
    icon: "Layers",
    description: "The PHP Framework for Web Artisans",
    color: "#FF2D20",
    detectionPatterns: {
      importPatterns: ["Illuminate\\"],
    },
    commonlyPairedWith: ["php", "mysql"],
  },
  symfony: {
    id: "symfony",
    name: "Symfony",
    category: "framework",
    icon: "Layers",
    description: "PHP framework for web projects",
    color: "#000000",
    detectionPatterns: {
      importPatterns: ["Symfony\\"],
    },
    commonlyPairedWith: ["php", "mysql"],
  },

  // Ruby Frameworks
  rails: {
    id: "rails",
    name: "Ruby on Rails",
    category: "framework",
    icon: "Train",
    description: "Server-side web application framework",
    color: "#CC0000",
    detectionPatterns: {
      importPatterns: ["Rails"],
    },
    commonlyPairedWith: ["ruby", "postgresql"],
  },

  // Rust Frameworks
  actix: {
    id: "actix",
    name: "Actix Web",
    category: "framework",
    icon: "Zap",
    description: "Rust web framework",
    color: "#CE422B",
    detectionPatterns: {
      importPatterns: ["actix_web"],
    },
    commonlyPairedWith: ["rust", "tokio"],
  },
  tokio: {
    id: "tokio",
    name: "Tokio",
    category: "framework",
    icon: "Clock",
    description: "Asynchronous runtime for Rust",
    color: "#CE422B",
    detectionPatterns: {
      importPatterns: ["tokio"],
    },
    commonlyPairedWith: ["rust", "actix"],
  },

  // Scala Frameworks
  play: {
    id: "play",
    name: "Play Framework",
    category: "framework",
    icon: "Play",
    description: "Web framework for Scala and Java",
    color: "#92D050",
    detectionPatterns: {
      importPatterns: ["play."],
    },
    commonlyPairedWith: ["scala", "java"],
  },
  akka: {
    id: "akka",
    name: "Akka",
    category: "framework",
    icon: "Activity",
    description: "Toolkit for building concurrent applications",
    color: "#15A9D6",
    detectionPatterns: {
      importPatterns: ["akka."],
    },
    commonlyPairedWith: ["scala", "java"],
  },

  // Kotlin Frameworks
  ktor: {
    id: "ktor",
    name: "Ktor",
    category: "framework",
    icon: "Zap",
    description: "Framework for building asynchronous servers",
    color: "#7F52FF",
    detectionPatterns: {
      importPatterns: ["io.ktor"],
    },
    commonlyPairedWith: ["kotlin"],
  },

  // Swift Frameworks
  vapor: {
    id: "vapor",
    name: "Vapor",
    category: "framework",
    icon: "Cloud",
    description: "Server-side Swift web framework",
    color: "#F05138",
    detectionPatterns: {
      importPatterns: ["Vapor"],
    },
    commonlyPairedWith: ["swift"],
  },
};

/**
 * DATABASES
 * @deprecated Use getTechnologies({ category: 'database' }) from config-service instead
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
    commonlyPairedWith: ["python", "nodejs", "java", "php"],
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
  cassandra: {
    id: "cassandra",
    name: "Cassandra",
    category: "database",
    icon: "Database",
    description: "Wide-column store database",
    color: "#1287B1",
    detectionPatterns: {
      importPatterns: ["cassandra", "cql"],
    },
    commonlyPairedWith: ["java", "python"],
  },
  dynamodb: {
    id: "dynamodb",
    name: "DynamoDB",
    category: "database",
    icon: "Database",
    description: "AWS NoSQL database",
    color: "#4053D6",
    detectionPatterns: {
      importPatterns: ["boto3", "dynamodb"],
    },
    commonlyPairedWith: ["python", "nodejs", "java"],
  },
  elasticsearch: {
    id: "elasticsearch",
    name: "Elasticsearch",
    category: "database",
    icon: "Search",
    description: "Search and analytics engine",
    color: "#005571",
    detectionPatterns: {
      importPatterns: ["elasticsearch"],
    },
    commonlyPairedWith: ["java", "python", "nodejs"],
  },
  mariadb: {
    id: "mariadb",
    name: "MariaDB",
    category: "database",
    icon: "Database",
    description: "Open source relational database",
    color: "#003545",
    detectionPatterns: {
      importPatterns: ["mariadb"],
    },
    commonlyPairedWith: ["php", "java", "python"],
  },
  oracle: {
    id: "oracle",
    name: "Oracle DB",
    category: "database",
    icon: "Database",
    description: "Multi-model database management system",
    color: "#F80000",
    detectionPatterns: {
      importPatterns: ["cx_Oracle", "ojdbc"],
    },
    commonlyPairedWith: ["java", "csharp"],
  },
  sqlserver: {
    id: "sqlserver",
    name: "SQL Server",
    category: "database",
    icon: "Database",
    description: "Microsoft relational database",
    color: "#CC2927",
    detectionPatterns: {
      importPatterns: ["pyodbc", "System.Data.SqlClient"],
    },
    commonlyPairedWith: ["csharp", "dotnet"],
  },
};

/**
 * TESTING FRAMEWORKS
 * @deprecated Use getTechnologies({ category: 'testing' }) from config-service instead
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
  nunit: {
    id: "nunit",
    name: "NUnit",
    category: "testing",
    icon: "TestTube",
    description: ".NET unit-testing framework",
    color: "#25A162",
    detectionPatterns: {
      importPatterns: ["NUnit.Framework"],
    },
    commonlyPairedWith: ["csharp", "dotnet"],
  },
  xunit: {
    id: "xunit",
    name: "xUnit",
    category: "testing",
    icon: "TestTube",
    description: ".NET testing tool",
    color: "#512BD4",
    detectionPatterns: {
      importPatterns: ["Xunit"],
    },
    commonlyPairedWith: ["csharp", "dotnet"],
  },
  phpunit: {
    id: "phpunit",
    name: "PHPUnit",
    category: "testing",
    icon: "TestTube",
    description: "Programmer-oriented testing framework for PHP",
    color: "#4C617C",
    detectionPatterns: {
      importPatterns: ["PHPUnit\\"],
    },
    commonlyPairedWith: ["php"],
  },
  rspec: {
    id: "rspec",
    name: "RSpec",
    category: "testing",
    icon: "TestTube",
    description: "Behaviour Driven Development for Ruby",
    color: "#CC342D",
    detectionPatterns: {
      importPatterns: ["describe", "it", "expect"],
    },
    commonlyPairedWith: ["ruby"],
  },
};

/**
 * TOOLS & INFRASTRUCTURE
 * @deprecated Use getTechnologies({ category: 'tool' }) from config-service instead
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
  kafka: {
    id: "kafka",
    name: "Kafka",
    category: "tool",
    icon: "Activity",
    description: "Distributed event streaming platform",
    color: "#231F20",
    detectionPatterns: {
      importPatterns: ["kafka-python", "confluent-kafka"],
    },
    commonlyPairedWith: ["java", "scala", "python", "go"],
  },
  terraform: {
    id: "terraform",
    name: "Terraform",
    category: "tool",
    icon: "Cloud",
    description: "Infrastructure as Code",
    color: "#7B42BC",
    detectionPatterns: {
      fileExtensions: [".tf"],
    },
  },
  ansible: {
    id: "ansible",
    name: "Ansible",
    category: "tool",
    icon: "Terminal",
    description: "IT automation",
    color: "#EE0000",
    detectionPatterns: {
      fileExtensions: [".yml", ".yaml"],
      importPatterns: ["hosts:", "tasks:"],
    },
  },
  jenkins: {
    id: "jenkins",
    name: "Jenkins",
    category: "tool",
    icon: "Settings",
    description: "Open source automation server",
    color: "#D24939",
    detectionPatterns: {
      fileExtensions: ["Jenkinsfile"],
    },
  },
  aws: {
    id: "aws",
    name: "AWS",
    category: "tool",
    icon: "Cloud",
    description: "Amazon Web Services",
    color: "#FF9900",
    detectionPatterns: {
      importPatterns: ["boto3", "aws-sdk"],
    },
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
 * @deprecated Use getTechnologies() from config-service instead
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
 * @deprecated Use getTechnologies({ category }) from config-service instead
 */
export function getTechnologiesByCategory(category: string): Technology[] {
  return Object.values(TECH_CATALOG).filter((tech) => tech.category === category);
}

/**
 * Get technology by ID
 * @deprecated Use getTechnology(id) from config-service instead
 */
export function getTechnologyById(id: string): Technology | undefined {
  return TECH_CATALOG[id];
}

/**
 * Smart suggestions based on role
 * @deprecated Store role-tech associations in database
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
 * @deprecated Store tech stack presets in database
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
  "java-spring": {
    name: "Java Spring Boot",
    description: "Enterprise Java backend with Spring Boot",
    critical: [LANGUAGES.java],
    required: [FRAMEWORKS.spring],
    recommended: [DATABASES.postgresql, TESTING.junit],
    optional: [TOOLS.docker, TOOLS.kafka],
  },
  "csharp-dotnet": {
    name: "C# .NET Core",
    description: "Modern .NET backend",
    critical: [LANGUAGES.csharp],
    required: [FRAMEWORKS.dotnet, FRAMEWORKS.entityframework],
    recommended: [DATABASES.sqlserver, TESTING.xunit],
    optional: [TOOLS.docker, TOOLS.azure],
  },
  "go-backend": {
    name: "Go Backend",
    description: "High-performance Go backend with Gin",
    critical: [LANGUAGES.go],
    required: [FRAMEWORKS.gin],
    recommended: [DATABASES.postgresql, DATABASES.redis],
    optional: [TOOLS.docker],
  },
  "nodejs-express": {
    name: "Node.js Express",
    description: "Standard Node.js backend",
    critical: [LANGUAGES.typescript],
    required: [FRAMEWORKS.nodejs, FRAMEWORKS.express],
    recommended: [DATABASES.mongodb, TESTING.jest],
    optional: [TOOLS.docker],
  },
};
