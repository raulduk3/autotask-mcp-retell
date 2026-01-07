[**Autotask MCP Server v0.1.0**](../README.md)

***

[Autotask MCP Server](../modules.md) / server

# server

## Fileoverview

Main MCP HTTP server with session management, authentication, and SSE streaming.

This server implements the Model Context Protocol (MCP) over HTTP with:
- Streamable HTTP transport with Server-Sent Events (SSE)
- Session-based state management with automatic cleanup
- IP whitelist and Bearer token authentication
- Health monitoring and memory reporting
