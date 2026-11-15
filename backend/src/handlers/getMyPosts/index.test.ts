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
  getSignedUrl: vi.fn(() => Promise.resolve("https://s3.example.com/my-image")),
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

describe("getMyPosts handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries PostsByUser GSI with the current userId", async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });

    await handler(makeEvent());

    const queryInput = mockSend.mock.calls[0][0] as any;
    expect(queryInput.IndexName).toBe("PostsByUser");
    expect(queryInput.KeyConditionExpression).toBe("userId = :uid");
    expect(queryInput.ExpressionAttributeValues[":uid"]).toBe("user-123");
  });

  it("returns own posts with signed image URLs", async () => {
    mockSend
      .mockResolvedValueOnce({
        Items: [
          { postId: "p1", userId: "user-123", userName: "me", s3Key: "uploads/user-123/a.jpg", caption: "my photo", createdAt: "2025-01-01T00:00:00Z", likeCount: 5 },
        ],
        LastEvaluatedKey: undefined,
      })
      .mockResolvedValueOnce({ Responses: { "test-likes": [] } });

    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.posts).toHaveLength(1);
    expect(body.posts[0].postId).toBe("p1");
    expect(body.posts[0].imageUrl).toBe("https://s3.example.com/my-image");
    expect(body.posts[0].likeCount).toBe(5);
  });

  it("returns empty array when user has no posts", async () => {
    mockSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });

    const res = await handler(makeEvent());
    const body = JSON.parse(res.body as string);
    expect(body.posts).toHaveLength(0);
  });

  it("supports cursor pagination", async () => {
    const lastKey = { userId: "user-123", createdAt: "2025-01-01", postId: "p1" };
    mockSend
      .mockResolvedValueOnce({
        Items: [
          { postId: "p2", userId: "user-123", userName: "me", s3Key: "uploads/user-123/b.jpg", caption: "", createdAt: "2025-01-02T00:00:00Z", likeCount: 0 },
        ],
        LastEvaluatedKey: lastKey,
      })
      .mockResolvedValueOnce({ Responses: { "test-likes": [] } });

    const res = await handler(makeEvent());
    const body = JSON.parse(res.body as string);
    expect(body.nextCursor).toBeDefined();
  });

  it("decodes cursor and passes it as ExclusiveStartKey", async () => {
    const startKey = { userId: "user-123", createdAt: "2025-01-01", postId: "p0" };
    const cursor = Buffer.from(JSON.stringify(startKey)).toString("base64url");

    mockSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });

    await handler(makeEvent({ queryStringParameters: { cursor } }));

    const queryInput = mockSend.mock.calls[0][0] as any;
    expect(queryInput.ExclusiveStartKey).toEqual(startKey);
  });
});
