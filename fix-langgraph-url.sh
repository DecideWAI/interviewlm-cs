#!/bin/bash
# Fix LangGraph API URL in .env

grep -q "LANGGRAPH_API_URL" .env && \
  sed -i '' 's|LANGGRAPH_API_URL=.*|LANGGRAPH_API_URL=http://localhost:9001|' .env || \
  echo "LANGGRAPH_API_URL=http://localhost:9001" >> .env

echo "Updated LANGGRAPH_API_URL to http://localhost:9001"
