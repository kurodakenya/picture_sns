import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSend } = vi.hoisted(() => {
  process.env.POSTS_TABLE = "test-posts-table";
  return { mockSend: vi.fn(() => Promise.resolve({})) };
});
vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: vi.fn(() => ({})),
}));
vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: vi.fn(() => ({ send: mockSend })) },
  PutCommand: vi.fn((input) => input),
}));


import { handler } from "./index";

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    requestContext: {
      authorizer: {
        jwt: {
          claims: { sub: "user-123", preferred_username: "testuser" },
        },
      },
    },
    body: JSON.stringify({
      s3Key: "uploads/user-123/photo.jpg",
      caption: "Hello world",
    }),
    ...overrides,
  } as any;
}

describe("createPost handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 201 with postId and createdAt", async () => {
    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body as string);
    expect(body.postId).toBeDefined();
    expect(body.createdAt).toBeDefined();
    expect(mockSend).toHaveBeenCalledOnce();
  });

  it("stores correct fields in DynamoDB", async () => {
    await handler(makeEvent());
    const putInput = mockSend.mock.calls[0][0] as any;
    expect(putInput.TableName).toBe("test-posts-table");
    expect(putInput.Item.userId).toBe("user-123");
    expect(putInput.Item.userName).toBe("testuser");
    expect(putInput.Item.s3Key).toBe("uploads/user-123/photo.jpg");
    expect(putInput.Item.caption).toBe("Hello world");
    expect(putInput.Item.gsiPk).toBe("POST");
    expect(putInput.Item.likeCount).toBe(0);
  });

  it("uses email when preferred_username is missing", async () => {
    const event = makeEvent();
    const parsed = JSON.parse(event.body);
    event.requestContext.authorizer.jwt.claims = {
      sub: "user-123",
      email: "test@example.com",
    };
    event.body = JSON.stringify(parsed);
    await handler(event);
    const putInput = mockSend.mock.calls[0][0] as any;
    expect(putInput.Item.userName).toBe("test@example.com");
  });

  it("returns 400 when s3Key is missing", async () => {
    const res = await handler(
      makeEvent({ body: JSON.stringify({ caption: "no key" }) })
    );
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body as string);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 403 when s3Key does not belong to user", async () => {
    const res = await handler(
      makeEvent({
        body: JSON.stringify({
          s3Key: "uploads/other-user/photo.jpg",
          caption: "stolen",
        }),
      })
    );
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body as string);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("returns 400 when caption exceeds 200 characters", async () => {
    const res = await handler(
      makeEvent({
        body: JSON.stringify({
          s3Key: "uploads/user-123/photo.jpg",
          caption: "a".repeat(201),
        }),
      })
    );
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body as string);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("allows caption of exactly 200 characters", async () => {
    const res = await handler(
      makeEvent({
        body: JSON.stringify({
          s3Key: "uploads/user-123/photo.jpg",
          caption: "a".repeat(200),
        }),
      })
    );
    expect(res.statusCode).toBe(201);
  });

  it("defaults caption to empty string when omitted", async () => {
    const res = await handler(
      makeEvent({
        body: JSON.stringify({ s3Key: "uploads/user-123/photo.jpg" }),
      })
    );
    expect(res.statusCode).toBe(201);
    const putInput = mockSend.mock.calls[0][0] as any;
    expect(putInput.Item.caption).toBe("");
  });
});
