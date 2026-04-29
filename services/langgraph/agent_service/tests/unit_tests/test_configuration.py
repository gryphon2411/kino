from langgraph.pregel import Pregel

from agent_service.graph import graph


def test_graph_is_compiled() -> None:
    assert isinstance(graph, Pregel)
