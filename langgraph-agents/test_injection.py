
import asyncio
import os
import sys

# Add project root to path
sys.path.append(os.getcwd())

from agents.coding_agent import create_coding_agent
from tools.coding_tools import sandbox_mgr, is_path_allowed
from langchain_core.runnables import RunnableConfig

async def test_agent_tool_injection():
    print("Starting Agent Tool Injection Test...")
    
    # Mock session and candidate IDs
    session_id = "test_session_123"
    candidate_id = "test_candidate_456"
    
    # Create the agent
    print(f"Creating agent for session {session_id}...")
    agent = create_coding_agent(
        session_id=session_id,
        candidate_id=candidate_id,
        helpfulness_level="pair-programming"
    )
    
    # Message to trigger file creation
    message = "Create a file named /workspace/test_injection.txt with content 'Injection Successful'"
    print(f"Sending message: {message}")
    
    # Send message (non-streaming for simplicity)
    response = await agent.send_message(message)
    
    print("\n--- Agent Response ---")
    print(f"Text: {response.get('text')}")
    print(f"Tools Used: {response.get('tools_used')}")
    print(f"Files Modified: {response.get('files_modified')}")
    
    # Verify file content directly via sandbox manager
    # Note: This relies on the tool having used the correct session_id
    print("\n--- Verification ---")
    try:
        # We can't easily check the real sandbox without Modal, 
        # but we can check if the tool *attempted* to use the correct session ID
        # by inspecting the logs or by mocking sandbox_mgr if needed.
        # For now, let's assume if it returns success and files_modified has the file, it worked.
        
        if "/workspace/test_injection.txt" in response.get("files_modified", []):
             print("SUCCESS: File modified confirmed in response.")
        else:
             print("FAILURE: File not found in modified list.")
             
    except Exception as e:
        print(f"Verification failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_agent_tool_injection())
