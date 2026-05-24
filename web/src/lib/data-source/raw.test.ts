import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

const URL_A = "https://example.com/a.json";
const URL_B = "https://example.com/b.json";

/**
 * `readRaw` keeps a module-level cache and in-flight map. Resetting the
 * module between tests gives each one a fresh slate.
 */
async function freshReadRaw() {
  vi.resetModules();
  const mod = await import("./raw");
  return mod.readRaw;
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("readRaw — http(s) cache + single-flight", () => {
  it("fetches on a cache miss and serves the cached value on subsequent hits", async () => {
    const readRaw = await freshReadRaw();
    const fetchMock: Mock = vi.fn().mockResolvedValue(jsonResponse({ ok: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    const first = await readRaw(URL_A);
    const second = await readRaw(URL_A);

    expect(first).toEqual({ ok: 1 });
    expect(second).toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent requests for the same URL into a single fetch", async () => {
    const readRaw = await freshReadRaw();
    let resolveFetch!: (r: Response) => void;
    const fetchMock: Mock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const a = readRaw(URL_A);
    const b = readRaw(URL_A);
    resolveFetch(jsonResponse({ ok: 2 }));

    await expect(a).resolves.toEqual({ ok: 2 });
    await expect(b).resolves.toEqual({ ok: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fetches each distinct URL independently", async () => {
    const readRaw = await freshReadRaw();
    const fetchMock: Mock = vi.fn((url: string) =>
      Promise.resolve(jsonResponse({ url })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(readRaw(URL_A)).resolves.toEqual({ url: URL_A });
    await expect(readRaw(URL_B)).resolves.toEqual({ url: URL_B });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("propagates the error when fetch fails and there is no prior cache", async () => {
    const readRaw = await freshReadRaw();
    const fetchMock: Mock = vi
      .fn()
      .mockResolvedValue(new Response("nope", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(readRaw(URL_A)).rejects.toThrow(/503/);
  });

  it("clears the in-flight slot after a failure so the next call retries", async () => {
    const readRaw = await freshReadRaw();
    const fetchMock: Mock = vi
      .fn()
      .mockResolvedValueOnce(new Response("nope", { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ recovered: true }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(readRaw(URL_A)).rejects.toThrow(/503/);
    await expect(readRaw(URL_A)).resolves.toEqual({ recovered: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to the last successful response when upstream later fails", async () => {
    const readRaw = await freshReadRaw();
    const fetchMock: Mock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ generation: 1 }))
      .mockResolvedValueOnce(new Response("upstream gone", { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Prime the cache.
    await expect(readRaw(URL_A)).resolves.toEqual({ generation: 1 });

    // Advance past the TTL so we re-fetch (and that re-fetch fails).
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 6 * 60 * 1000);
    await expect(readRaw(URL_A)).resolves.toEqual({ generation: 1 });
    expect(warn).toHaveBeenCalled();
  });

  it("times out fetches that hang past the limit", async () => {
    vi.useFakeTimers();
    const readRaw = await freshReadRaw();
    // A stuck fetch that only resolves when its AbortSignal fires.
    const fetchMock: Mock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(init.signal!.reason);
          });
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const pending = readRaw(URL_A);
    // Surface the rejection so an unhandled-rejection warning isn't logged.
    pending.catch(() => {});
    // Advance past the 10s timeout.
    await vi.advanceTimersByTimeAsync(10_500);
    await expect(pending).rejects.toThrow(/timed out/);
  });
});

describe("readRaw — filesystem path branches", () => {
  let dir: string;
  let path: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "readraw-"));
    path = join(dir, "feed.json");
    await writeFile(path, JSON.stringify({ from: "disk" }), "utf8");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reads a bare filesystem path", async () => {
    const readRaw = await freshReadRaw();
    await expect(readRaw(path)).resolves.toEqual({ from: "disk" });
  });

  it("reads a file: URL", async () => {
    const readRaw = await freshReadRaw();
    await expect(readRaw(pathToFileURL(path).toString())).resolves.toEqual({
      from: "disk",
    });
  });

  it("does not consult the in-memory cache for filesystem reads", async () => {
    const readRaw = await freshReadRaw();
    await expect(readRaw(path)).resolves.toEqual({ from: "disk" });
    // Rewrite the file; a cached path would return the old contents.
    await writeFile(path, JSON.stringify({ from: "disk", v: 2 }), "utf8");
    await expect(readRaw(path)).resolves.toEqual({ from: "disk", v: 2 });
  });
});
