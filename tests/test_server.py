from poker.server import mcp


def test_server_name() -> None:
    assert mcp.name == "poker-server"
