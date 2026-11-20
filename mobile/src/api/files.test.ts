import { uploadFile } from "./files";
import { authorizedFetch } from "./http";

jest.mock("./http", () => ({
  apiUrl: (path: string) => `http://api.test${path}`,
  authorizedFetch: jest.fn(),
  apiFailure: jest.fn(),
}));
jest.mock("expo-file-system", () => ({ File: jest.fn(), Paths: {} }));
jest.mock("expo-sharing", () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));

describe("uploadFile", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("sends the bytes with the declared type even when the read file has none", async () => {
    // Reading a file:// URI gives a Blob without a type; React Native on Android
    // would send that empty type instead of the Content-Type header.
    global.fetch = jest.fn(async () => ({ blob: async () => new Blob([new Uint8Array([137, 80, 78, 71])]) })) as unknown as typeof fetch;
    jest.mocked(authorizedFetch).mockResolvedValue({ ok: true, json: async () => ({ file_id: "f1", status: "quarantined" }) } as Response);

    const result = await uploadFile("/api/v1/support/cases/c1/attachments", { uri: "file:///cache/a.png", name: "a.png", mimeType: "image/png" }, { filename: "a.png" });

    expect(result).toEqual({ file_id: "f1", status: "quarantined" });
    const [url, init] = jest.mocked(authorizedFetch).mock.calls[0]!;
    expect(url).toBe("http://api.test/api/v1/support/cases/c1/attachments");
    expect(init?.headers).toEqual({ "Content-Type": "image/png" });
    const body = init?.body as Blob;
    expect(body.type).toBe("image/png");
    expect(body.size).toBe(4);
  });
});
