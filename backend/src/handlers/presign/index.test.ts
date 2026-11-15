import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.S3_BUCKET = "test-bucket";
});

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn(() => ({})),
  PutObjectCommand: vi.fn((input) => input),
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(() => Promise.resolve("https://s3.example.com/presigned-url")),
}));

import { handler } from "./index";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    requestContext: {
      authorizer: {
        jwt: { claims: { sub: "user-123" } },
      },
    },
    body: JSON.stringify({ contentType: "image/jpeg", fileSize: 1024 }),
    ...overrides,
  } as any;
}

describe("presign handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with uploadUrl and s3Key for valid JPEG", async () => {
    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.uploadUrl).toBe("https://s3.example.com/presigned-url");
    expect(body.s3Key).toMatch(/^uploads\/user-123\/.*\.jpg$/);
    expect(getSignedUrl).toHaveBeenCalledOnce();
  });

  it("returns 200 for valid PNG", async () => {
    const res = await handler(
      makeEvent({ body: JSON.stringify({ contentType: "image/png", fileSize: 2048 }) })
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.s3Key).toMatch(/\.png$/);
  });

  it("returns 400 for unsupported content type", async () => {
    const res = await handler(
      makeEvent({ body: JSON.stringify({ contentType: "image/gif" }) })
    );
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body as string);
    expect(body.error.code).toBe("INVALID_FILE_TYPE");
  });

  it("returns 400 when contentType is missing", async () => {
    const res = await handler(makeEvent({ body: JSON.stringify({}) }));
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body as string);
    expect(body.error.code).toBe("INVALID_FILE_TYPE");
  });

  it("returns 400 when file exceeds 10MB", async () => {
    const res = await handler(
      makeEvent({
        body: JSON.stringify({ contentType: "image/jpeg", fileSize: 11 * 1024 * 1024 }),
      })
    );
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body as string);
    expect(body.error.code).toBe("FILE_TOO_LARGE");
  });

  it("allows request when fileSize is exactly 10MB", async () => {
    const res = await handler(
      makeEvent({
        body: JSON.stringify({ contentType: "image/jpeg", fileSize: 10 * 1024 * 1024 }),
      })
    );
    expect(res.statusCode).toBe(200);
  });

  it("allows request when fileSize is omitted", async () => {
    const res = await handler(
      makeEvent({ body: JSON.stringify({ contentType: "image/jpeg" }) })
    );
    expect(res.statusCode).toBe(200);
  });
});
