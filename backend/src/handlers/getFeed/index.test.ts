import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSend } = vi.hoisted(() => {
  process.env.POSTS_TABLE = "test-posts";
  process.env.LIKES_TABLE = "test-likes";
  process.env.S3_BUCKET = "test-bucket";
  return { mockSend: vi.fn() };
});
vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: vi.fn(() => ({})),
}));
vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: vi.fn(() => ({ send: mockSend })) },
  QueryCommand: vi.fn((input) => ({ ...input, _type: "Query" })),
  BatchGetCommand: vi.fn((input) => ({ ...input, _type: "BatchGet" })),
}));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn(() => ({})),
  GetObjectCommand: vi.fn((input) => input),
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(() => Promise.resolve("https://s3.example.com/signed-image")),
}));


import { handler } from "./index";

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    requestContext: {
      authorizer: {
        jwt: { claims: { sub: "user-123" } },
      },
    },
    queryStringParameters: null,
    ...overrides,
  } as any;
}

describe("getFeed handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns posts with signed image URLs", async () => {
    mockSend
      .mockResolvedValueOnce({
        Items: [
          { postId: "p1", userId: "u1", userName: "alice", s3Key: "uploads/u1/a.jpg", caption: "hi", createdAt: "2025-01-01T00:00:00Z", likeCount: 3 },
        ],
        LastEvaluatedKey: undefined,
      })
      .mockResolvedValueOnce({
        Responses: { "test-likes": [{ postId: "p1", userId: "user-123" }] },
      });

    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.posts).toHaveLength(1);
    expect(body.posts[0].imageUrl).toBe("https://s3.example.com/signed-image");
    expect(body.posts[0].likedByMe).toBe(true);
    expect(body.nextCursor).toBeUndefined();
  });

  it("returns empty array when no posts", async () => {
    mockSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });

    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.posts).toHaveLength(0);
  });

  it("returns nextCursor when there are more pages", async () => {
    const lastKey = { gsiPk: "POST", createdAt: "2025-01-01T00:00:00Z", postId: "p1" };
    mockSend
      .mockResolvedValueOnce({
        Items: [
          { postId: "p1", userId: "u1", userName: "alice", s3Key: "uploads/u1/a.jpg", caption: "", createdAt: "2025-01-01T00:00:00Z", likeCount: 0 },
        ],
        LastEvaluatedKey: lastKey,
      })
      .mockResolvedValueOnce({ Responses: { "test-likes": [] } });

    const res = await handler(makeEvent());
    const body = JSON.parse(res.body as string);
    expect(body.nextCursor).toBeDefined();
    const decoded = JSON.parse(Buffer.from(body.nextCursor, "base64url").toString());
    expect(decoded).toEqual(lastKey);
  });

  it("passes cursor as ExclusiveStartKey", async () => {
    const startKey = { gsiPk: "POST", createdAt: "2025-01-01", postId: "p0" };
    const cursor = Buffer.from(JSON.stringify(startKey)).toString("base64url");

    mockSend
      .mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });

    await handler(
      makeEvent({ queryStringParameters: { cursor } })
    );

    const queryInput = mockSend.mock.calls[0][0] as any;
    expect(queryInput.ExclusiveStartKey).toEqual(startKey);
  });

  it("sets likedByMe to false when user has not liked", async () => {
    mockSend
      .mockResolvedValueOnce({
        Items: [
          { postId: "p1", userId: "u1", userName: "alice", s3Key: "uploads/u1/a.jpg", caption: "", createdAt: "2025-01-01T00:00:00Z", likeCount: 0 },
        ],
        LastEvaluatedKey: undefined,
      })
      .mockResolvedValueOnce({ Responses: { "test-likes": [] } });

    const res = await handler(makeEvent());
    const body = JSON.parse(res.body as string);
    expect(body.posts[0].likedByMe).toBe(false);
  });
});
