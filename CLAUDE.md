@AGENTS.md

## Code navigation: Graphify

This repository is indexed in Graphify (`assyaref/HRIS`, MCP server in
`.mcp.json`; sign in with the Graphify account on first use). Prefer its tools
for code structure before grepping:

- where a symbol is defined → `graphify_find`
- who calls it → `graphify_callers`; impact of a change → `graphify_impact`
- tests linked to a file/symbol → `graphify_tests_for`
- how a behaviour works → `query_graph`

Results carry the `commitSha` the graph was built from; when it differs from
`git rev-parse HEAD`, read the current file for anything changed since.
Use plain text search for literal strings, config values and SQL.
