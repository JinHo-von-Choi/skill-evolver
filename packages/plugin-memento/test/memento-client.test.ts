import { describe, it, expect, vi, beforeEach } from "vitest";
import { MementoClient } from "../src/memento-client.js";

function mockFetch(responses: Record<string, unknown>[]) {
  let callIdx = 0;
  return vi.fn(async () => ({
    ok:   true,
    json: async () => responses[callIdx++] ?? { jsonrpc: "2.0", id: callIdx, result: {} },
  }));
}

describe("MementoClient", () => {
  const config = { url: "http://localhost:53535/mcp", accessKey: "test-key" };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("remember: initialize -> tools/call 시퀀스로 호출", async () => {
    const fetchMock = mockFetch([
      { jsonrpc: "2.0", id: 1, result: { protocolVersion: "2024-11-05" } },
      { jsonrpc: "2.0", id: 2, result: { content: [{ type: "text", text: JSON.stringify({ id: "frag-123" }) }] } },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const client = new MementoClient(config);
    const result = await client.remember({ content: "test", topic: "t", type: "fact" });

    expect(result.id).toBe("frag-123");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [, initOpts] = fetchMock.mock.calls[0] as [string, RequestInit];
    const initBody = JSON.parse(initOpts.body as string);
    expect(initBody.method).toBe("initialize");

    const [, callOpts] = fetchMock.mock.calls[1] as [string, RequestInit];
    const callBody = JSON.parse(callOpts.body as string);
    expect(callBody.method).toBe("tools/call");
    expect(callBody.params.name).toBe("remember");
  });

  it("remember: 두 번째 호출은 initialize 스킵", async () => {
    const fetchMock = mockFetch([
      { jsonrpc: "2.0", id: 1, result: { protocolVersion: "2024-11-05" } },
      { jsonrpc: "2.0", id: 2, result: { content: [{ type: "text", text: JSON.stringify({ id: "a" }) }] } },
      { jsonrpc: "2.0", id: 3, result: { content: [{ type: "text", text: JSON.stringify({ id: "b" }) }] } },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const client = new MementoClient(config);
    await client.remember({ content: "1", topic: "t", type: "fact" });
    await client.remember({ content: "2", topic: "t", type: "fact" });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("recall: fragments 배열 반환", async () => {
    const fragments = [
      { id: "f1", content: "error A", type: "error" },
      { id: "f2", content: "error B", type: "error" },
    ];
    const fetchMock = mockFetch([
      { jsonrpc: "2.0", id: 1, result: { protocolVersion: "2024-11-05" } },
      { jsonrpc: "2.0", id: 2, result: { content: [{ type: "text", text: JSON.stringify({ fragments }) }] } },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const client = new MementoClient(config);
    const result = await client.recall({ keywords: ["error"], type: "error" });

    expect(result.fragments).toHaveLength(2);
    expect(result.fragments[0].id).toBe("f1");
  });

  it("recall: 빈 응답 시 빈 fragments 반환", async () => {
    const fetchMock = mockFetch([
      { jsonrpc: "2.0", id: 1, result: { protocolVersion: "2024-11-05" } },
      { jsonrpc: "2.0", id: 2, result: { content: [{ type: "text", text: JSON.stringify({}) }] } },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const client = new MementoClient(config);
    const result = await client.recall({ topic: "nothing" });
    expect(result.fragments).toEqual([]);
  });

  it("forget: success 반환", async () => {
    const fetchMock = mockFetch([
      { jsonrpc: "2.0", id: 1, result: { protocolVersion: "2024-11-05" } },
      { jsonrpc: "2.0", id: 2, result: { content: [{ type: "text", text: JSON.stringify({ success: true }) }] } },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const client = new MementoClient(config);
    const result = await client.forget({ id: "frag-123" });
    expect(result.success).toBe(true);
  });

  it("Authorization 헤더에 accessKey 포함", async () => {
    const fetchMock = mockFetch([
      { jsonrpc: "2.0", id: 1, result: {} },
      { jsonrpc: "2.0", id: 2, result: {} },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const client = new MementoClient(config);
    await client.remember({ content: "x", topic: "t", type: "fact" });

    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = opts.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer test-key");
  });

  it("HTTP 에러 시 예외 throw", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok:         false,
      status:     500,
      statusText: "Internal Server Error",
    })));

    const client = new MementoClient(config);
    await expect(client.remember({ content: "x", topic: "t", type: "fact" }))
      .rejects.toThrow("MCP HTTP error: 500 Internal Server Error");
  });

  it("MCP tool 에러 시 예외 throw", async () => {
    const fetchMock = mockFetch([
      { jsonrpc: "2.0", id: 1, result: {} },
      { jsonrpc: "2.0", id: 2, error: { code: -32600, message: "Invalid request" } },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const client = new MementoClient(config);
    await expect(client.remember({ content: "x", topic: "t", type: "fact" }))
      .rejects.toThrow('MCP tool "remember" failed: Invalid request');
  });
});
