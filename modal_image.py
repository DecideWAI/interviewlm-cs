"""
InterviewLM Universal Development Image

A comprehensive development environment with all major languages and tools
pre-installed for instant sandbox startup.

Languages included:
- Node.js 20 LTS + pnpm, TypeScript, Jest, Vitest
- Python 3.11 + pytest
- Go 1.22
- Rust (latest stable)
- Java 21 (OpenJDK)

Tools included:
- ttyd (WebSocket terminal for low-latency access)
- git, curl, wget, build tools
- Language-specific package managers and test frameworks

Build and deploy:
    modal deploy modal_image.py

Test the image:
    modal run modal_image.py::test_image

After deployment, the image is used automatically by the sandbox service.
"""

import modal

app = modal.App("interviewlm-executor")

# Universal development image with all languages and ttyd
interviewlm_image = (
    # Base: Debian bookworm slim with Python 3.11
    modal.Image.debian_slim(python_version="3.11")

    # =========================================================================
    # Layer 1: System packages and build tools
    # =========================================================================
    .apt_install(
        # Essential tools
        "curl",
        "wget",
        "git",
        "unzip",
        "procps",           # ps, top, etc.
        "iproute2",         # ip, ss commands
        "ca-certificates",
        "gnupg",
        "lsb-release",
        # Build tools
        "build-essential",  # gcc, g++, make
        "pkg-config",
        "libssl-dev",       # For Rust crates that need OpenSSL
        "cmake",
    )

    # =========================================================================
    # Layer 2: ttyd - WebSocket terminal for low-latency access
    # =========================================================================
    .run_commands(
        "wget -q https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.x86_64 -O /usr/local/bin/ttyd",
        "chmod +x /usr/local/bin/ttyd",
        "ttyd --version",
    )

    # =========================================================================
    # Layer 3: Node.js 20 LTS
    # =========================================================================
    .run_commands(
        "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -",
        "apt-get install -y nodejs",
        "node --version && npm --version",
    )

    # Layer 3b: pnpm (faster than npm) + global TypeScript tools
    .run_commands(
        "npm install -g pnpm@latest",
        "npm install -g typescript ts-node @types/node",
        "pnpm --version && tsc --version",
    )

    # Layer 3c: Pre-cache common npm packages
    .run_commands(
        "mkdir -p /tmp/warmup && cd /tmp/warmup",
        'echo \'{"name":"warmup","version":"1.0.0"}\' > /tmp/warmup/package.json',
        "cd /tmp/warmup && pnpm add typescript @types/node ts-node",
        "cd /tmp/warmup && pnpm add -D jest @types/jest ts-jest vitest",
        "cd / && rm -rf /tmp/warmup",
    )

    # =========================================================================
    # Layer 4: Go 1.22
    # =========================================================================
    .run_commands(
        "wget -q https://go.dev/dl/go1.22.5.linux-amd64.tar.gz -O /tmp/go.tar.gz",
        "tar -C /usr/local -xzf /tmp/go.tar.gz",
        "rm /tmp/go.tar.gz",
        "/usr/local/go/bin/go version",
    )

    # =========================================================================
    # Layer 5: Rust (latest stable via rustup)
    # =========================================================================
    .run_commands(
        "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable",
        ". $HOME/.cargo/env && rustc --version && cargo --version",
    )

    # =========================================================================
    # Layer 6: Java 21 (OpenJDK)
    # =========================================================================
    .run_commands(
        "wget -q https://download.java.net/java/GA/jdk21.0.2/f2283984656d49d69e91c558476027ac/13/GPL/openjdk-21.0.2_linux-x64_bin.tar.gz -O /tmp/openjdk.tar.gz",
        "mkdir -p /usr/local/java",
        "tar -C /usr/local/java -xzf /tmp/openjdk.tar.gz --strip-components=1",
        "rm /tmp/openjdk.tar.gz",
        "/usr/local/java/bin/java --version",
    )

    # =========================================================================
    # Layer 7: Python packages
    # =========================================================================
    .pip_install(
        "pytest",
        "pytest-timeout",
        "pytest-asyncio",
        "black",
        "ruff",
        "mypy",
        "fastapi",  # Required for Modal web endpoints
    )

    # =========================================================================
    # Layer 8: Environment variables
    # =========================================================================
    .env({
        "NODE_ENV": "development",
        "PNPM_HOME": "/usr/local/bin",
        # Go
        "GOROOT": "/usr/local/go",
        "GOPATH": "/root/go",
        # Rust
        "CARGO_HOME": "/root/.cargo",
        "RUSTUP_HOME": "/root/.rustup",
        # Java
        "JAVA_HOME": "/usr/local/java",
        # Combined PATH
        "PATH": "/usr/local/bin:/usr/local/go/bin:/root/go/bin:/root/.cargo/bin:/usr/local/java/bin:$PATH",
    })
)


@app.function(image=interviewlm_image)
def test_image():
    """Test that the image has all required tools installed."""
    import subprocess
    import os

    tests = [
        # Core tools
        ("ttyd --version", "ttyd"),
        ("git --version", "git"),
        # Node.js ecosystem
        ("node --version", "Node.js"),
        ("npm --version", "npm"),
        ("pnpm --version", "pnpm"),
        ("tsc --version", "TypeScript"),
        ("ts-node --version", "ts-node"),
        # Python ecosystem
        ("python3 --version", "Python"),
        ("pytest --version", "pytest"),
        ("black --version", "black"),
        ("ruff --version", "ruff"),
        # Go
        ("/usr/local/go/bin/go version", "Go"),
        # Rust
        ("/root/.cargo/bin/rustc --version", "Rust"),
        ("/root/.cargo/bin/cargo --version", "Cargo"),
        # Java
        ("/usr/local/java/bin/java --version", "Java"),
        ("/usr/local/java/bin/javac --version", "javac"),
    ]

    print("=" * 60)
    print("InterviewLM Universal Image Test Results")
    print("=" * 60)

    all_passed = True
    for cmd, name in tests:
        try:
            result = subprocess.run(
                cmd, shell=True, capture_output=True, text=True, timeout=10,
                env={**os.environ, "PATH": "/usr/local/bin:/usr/local/go/bin:/root/go/bin:/root/.cargo/bin:/usr/local/java/bin:" + os.environ.get("PATH", "")}
            )
            if result.returncode == 0:
                version = result.stdout.strip().split('\n')[0] or result.stderr.strip().split('\n')[0]
                print(f"[PASS] {name:12} : {version}")
            else:
                print(f"[FAIL] {name:12} : command failed - {result.stderr.strip()}")
                all_passed = False
        except Exception as e:
            print(f"[FAIL] {name:12} : {e}")
            all_passed = False

    print("=" * 60)
    print(f"Result: {'ALL TESTS PASSED' if all_passed else 'SOME TESTS FAILED'}")
    print("=" * 60)

    return all_passed


@app.function(image=interviewlm_image)
def test_ttyd():
    """Test ttyd specifically - start it and verify it's running."""
    import subprocess
    import time

    print("Testing ttyd WebSocket terminal...")

    # Start ttyd in background
    subprocess.Popen(
        ["ttyd", "-W", "-p", "7681", "bash"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )

    time.sleep(1)

    # Check if it's running
    result = subprocess.run(
        "ps aux | grep ttyd | grep -v grep",
        shell=True, capture_output=True, text=True
    )

    if result.stdout.strip():
        print("[PASS] ttyd is running:")
        print(result.stdout.strip())
        return True
    else:
        print("[FAIL] ttyd failed to start")
        return False


# Health check endpoint for the deployed app
@app.function(image=interviewlm_image, timeout=10)
@modal.fastapi_endpoint(method="GET")
def health():
    """Health check endpoint."""
    from datetime import datetime
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "3.0.0",
        "features": [
            "nodejs-20",
            "python-3.11",
            "go-1.22",
            "rust-stable",
            "java-21",
            "ttyd",
            "typescript",
            "pnpm",
        ],
    }


@app.function(image=interviewlm_image)
def get_image_id():
    """Get the image ID after deployment."""
    import os
    # The image ID is available in the environment after deployment
    image_id = os.environ.get("MODAL_IMAGE_ID", "unknown")
    print(f"Image ID: {image_id}")
    print("")
    print("Add this to your .env file:")
    print(f"MODAL_UNIVERSAL_IMAGE_ID={image_id}")
    return image_id


if __name__ == "__main__":
    print("InterviewLM Universal Development Image")
    print("=" * 60)
    print("")
    print("STEP 1: Deploy the image")
    print("  modal deploy modal_image.py")
    print("")
    print("STEP 2: Test the image")
    print("  modal run modal_image.py::test_image")
    print("")
    print("STEP 3: Get the image ID")
    print("  modal run modal_image.py::get_image_id")
    print("")
    print("STEP 4: Add to .env")
    print("  MODAL_UNIVERSAL_IMAGE_ID=<image-id-from-step-3>")
    print("")
    print("STEP 5: Test ttyd")
    print("  modal run modal_image.py::test_ttyd")
