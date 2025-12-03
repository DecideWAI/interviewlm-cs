"""Tests for the Supervisor Agent."""

import pytest
from agents.supervisor import (
    create_supervisor,
    clear_agent_cache,
    get_coding_agent,
    get_interview_agent,
    get_evaluation_agent,
    SUPERVISOR_TOOLS,
)


class TestSupervisor:
    """Test cases for Supervisor Agent."""

    def test_supervisor_tools_defined(self):
        """Test that all supervisor tools are defined."""
        tool_names = [tool.name for tool in SUPERVISOR_TOOLS]

        assert "handoff_to_coding_agent" in tool_names
        assert "handoff_to_interview_agent" in tool_names
        assert "handoff_to_evaluation_agent" in tool_names
        assert "complete_workflow" in tool_names

    def test_agent_cache_functions(self):
        """Test agent caching functions."""
        # Clear cache first
        clear_agent_cache()

        # Get coding agent - should create new
        agent1 = get_coding_agent(
            session_id="test-session",
            candidate_id="test-candidate",
            helpfulness_level="pair-programming",
        )
        assert agent1 is not None

        # Get same agent - should return cached
        agent2 = get_coding_agent(
            session_id="test-session",
            candidate_id="test-candidate",
            helpfulness_level="pair-programming",
        )
        assert agent1 is agent2

        # Get different helpfulness level - should create new
        agent3 = get_coding_agent(
            session_id="test-session",
            candidate_id="test-candidate",
            helpfulness_level="consultant",
        )
        assert agent3 is not agent1

        # Clean up
        clear_agent_cache()

    def test_interview_agent_singleton(self):
        """Test interview agent is singleton."""
        clear_agent_cache()

        agent1 = get_interview_agent()
        agent2 = get_interview_agent()

        assert agent1 is agent2

        clear_agent_cache()

    def test_evaluation_agent_singleton(self):
        """Test evaluation agent is singleton."""
        clear_agent_cache()

        agent1 = get_evaluation_agent()
        agent2 = get_evaluation_agent()

        assert agent1 is agent2

        clear_agent_cache()

    def test_clear_agent_cache(self):
        """Test that clear_agent_cache works."""
        # Create some agents
        get_coding_agent("s1", "c1")
        get_interview_agent()
        get_evaluation_agent()

        # Clear cache
        clear_agent_cache()

        # New agents should be different instances
        agent1 = get_interview_agent()
        clear_agent_cache()
        agent2 = get_interview_agent()

        assert agent1 is not agent2

        clear_agent_cache()


class TestSupervisorHandoffs:
    """Test cases for supervisor handoff tools."""

    def test_handoff_to_coding_agent_tool(self):
        """Test handoff_to_coding_agent tool signature."""
        from agents.supervisor import handoff_to_coding_agent

        # Check tool has correct parameters
        schema = handoff_to_coding_agent.args_schema.schema()
        properties = schema.get("properties", {})

        assert "task_description" in properties
        assert "session_id" in properties
        assert "helpfulness_level" in properties

    def test_handoff_to_interview_agent_tool(self):
        """Test handoff_to_interview_agent tool signature."""
        from agents.supervisor import handoff_to_interview_agent

        schema = handoff_to_interview_agent.args_schema.schema()
        properties = schema.get("properties", {})

        assert "event_type" in properties
        assert "event_data" in properties
        assert "session_id" in properties

    def test_handoff_to_evaluation_agent_tool(self):
        """Test handoff_to_evaluation_agent tool signature."""
        from agents.supervisor import handoff_to_evaluation_agent

        schema = handoff_to_evaluation_agent.args_schema.schema()
        properties = schema.get("properties", {})

        assert "session_id" in properties
        assert "candidate_id" in properties

    def test_complete_workflow_tool(self):
        """Test complete_workflow tool."""
        from agents.supervisor import complete_workflow

        result = complete_workflow.invoke({"summary": "Task completed successfully"})
        assert "complete" in result.lower()


class TestSupervisorWorkflow:
    """Integration tests for supervisor workflows (require API key)."""

    @pytest.fixture(autouse=True)
    def cleanup(self):
        """Clean up agent cache before and after each test."""
        clear_agent_cache()
        yield
        clear_agent_cache()

    @pytest.mark.asyncio
    @pytest.mark.skip(reason="Requires API key")
    async def test_supervisor_routes_coding_request(self):
        """Test that supervisor routes coding requests to coding agent."""
        supervisor = create_supervisor()

        result = await supervisor.run_workflow(
            task="Help the candidate fix a bug in their code",
            session_id="test-session",
            candidate_id="test-candidate",
        )

        # Should have routed to coding agent
        assert result.get("coding_result") is not None

    @pytest.mark.asyncio
    @pytest.mark.skip(reason="Requires API key")
    async def test_supervisor_routes_evaluation_request(self):
        """Test that supervisor routes evaluation requests."""
        supervisor = create_supervisor()

        result = await supervisor.run_workflow(
            task="Evaluate the completed interview session",
            session_id="test-session",
            candidate_id="test-candidate",
            code_snapshots=[{"files": {"main.py": "print('hello')"}}],
            test_results=[{"passed": True}],
            claude_interactions=[],
        )

        # Should have routed to evaluation agent
        assert result.get("evaluation_result") is not None
