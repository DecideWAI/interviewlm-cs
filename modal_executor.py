"""
Modal Code Executor for InterviewLM
====================================

Provides the sandbox image and health check for Modal.
LangGraph agents use the Modal SDK directly for sandbox operations.

Usage:
    modal deploy modal_executor.py
"""

import modal
from typing import Dict, Any
from datetime import datetime

app = modal.App("interviewlm-executor")

# Rich base image with common development tools
sandbox_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install(
        "build-essential", "git", "curl", "wget", "unzip", "vim",
        "ca-certificates", "gnupg",
    )
    .run_commands(
        "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -",
        "apt-get install -y nodejs",
        "pip install --upgrade pip setuptools wheel",
        "pip install pytest pytest-json-report black pylint mypy ipython fastapi",
        "curl -fsSL https://go.dev/dl/go1.21.5.linux-amd64.tar.gz | tar -C /usr/local -xzf -",
        "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y",
        "npm install -g typescript ts-node jest @types/node yarn pnpm",
    )
    .env({
        "PATH": "/usr/local/go/bin:/root/.cargo/bin:/root/go/bin:$PATH",
        "GOPATH": "/root/go",
    })
)


@app.function(image=sandbox_image, timeout=10)
@modal.fastapi_endpoint(method="GET")
def health() -> Dict[str, Any]:
    """Health check endpoint."""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "2.0.0",
        "features": ["sandbox-isolation", "multi-language", "any-framework"],
    }
