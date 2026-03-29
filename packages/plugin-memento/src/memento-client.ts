/**
 * MCP JSON-RPC 프로토콜 기반 memento-mcp 클라이언트.
 *
 * initialize -> tools/call 시퀀스로 remember, recall, forget 도구를 호출한다.
 */

export interface MementoClientConfig {
  url:       string;
  accessKey: string;
}

export interface RememberParams {
  content:     string;
  topic:       string;
  type:        string;
  importance?: number;
}

export interface RecallParams {
  keywords?: string[];
  topic?:    string;
  type?:     string;
}

export interface ForgetParams {
  id: string;
}

export interface MementoFragment {
  id:      string;
  content: string;
  type:    string;
}

export interface RecallResult {
  fragments: MementoFragment[];
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id:      number;
  method:  string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id:      number;
  result?: unknown;
  error?:  { code: number; message: string };
}

export class MementoClient {
  private readonly url:       string;
  private readonly accessKey: string;
  private initialized = false;
  private reqId       = 0;

  constructor(config: MementoClientConfig) {
    this.url       = config.url;
    this.accessKey = config.accessKey;
  }

  async remember(params: RememberParams): Promise<{ id: string }> {
    await this.ensureInitialized();
    const result = await this.callTool("remember", params);
    return { id: String(result?.id ?? result?.fragmentId ?? "unknown") };
  }

  async recall(params: RecallParams): Promise<RecallResult> {
    await this.ensureInitialized();
    const result = await this.callTool("recall", params);
    const fragments: MementoFragment[] = Array.isArray(result?.fragments)
      ? result.fragments
      : [];
    return { fragments };
  }

  async forget(params: ForgetParams): Promise<{ success: boolean }> {
    await this.ensureInitialized();
    const result = await this.callTool("forget", params);
    return { success: result?.success !== false };
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    await this.send({
      jsonrpc: "2.0",
      id:      this.nextId(),
      method:  "initialize",
      params:  {
        protocolVersion: "2024-11-05",
        capabilities:    {},
        clientInfo:      { name: "evolver-plugin-memento", version: "0.2.0" },
      },
    });

    this.initialized = true;
  }

  private async callTool(toolName: string, args: object): Promise<Record<string, unknown>> {
    const response = await this.send({
      jsonrpc: "2.0",
      id:      this.nextId(),
      method:  "tools/call",
      params:  { name: toolName, arguments: args },
    });

    if (response.error) {
      throw new Error(`MCP tool "${toolName}" failed: ${response.error.message}`);
    }

    const result = response.result as Record<string, unknown> | undefined;

    if (result && Array.isArray(result.content)) {
      const textContent = (result.content as Array<{ type: string; text?: string }>)
        .find((c) => c.type === "text");
      if (textContent?.text) {
        try {
          return JSON.parse(textContent.text) as Record<string, unknown>;
        } catch {
          return { text: textContent.text };
        }
      }
    }

    return (result ?? {}) as Record<string, unknown>;
  }

  private async send(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const res = await fetch(this.url, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${this.accessKey}`,
      },
      body: JSON.stringify(request),
    });

    if (!res.ok) {
      throw new Error(`MCP HTTP error: ${res.status} ${res.statusText}`);
    }

    return (await res.json()) as JsonRpcResponse;
  }

  private nextId(): number {
    return ++this.reqId;
  }
}
