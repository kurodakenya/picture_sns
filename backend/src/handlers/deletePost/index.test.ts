import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDdbSend, mockS3Send } = vi.hoisted(() => {
  process.env.POSTS_TABLE = "test-posts";
  process.env.LIKES_TABLE = "test-likes";
  process.env.S3_BUCKET = "test-bucket";
  return {
    mockDdbSend: vi.fn(),
    mockS3Send: vi.fn(() => Promise.resolve({})),
  };
});
vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: vi.fn(() => ({})),
}));
vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: vi.fn(() => ({ send: mockDdbSend })) },
  GetCommand: vi.fn((input) => ({ ...input, _type: "Get" })),
  DeleteCommand: vi.fn((input) => ({ ...input, _type: "Delete" })),
  QueryCommand: vi.fn((input) => ({ ...input, _type: "Query" })),
}));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn(() => ({ send: mockS3Send })),
  DeleteObjectCommand: vi.fn((input) => input),
}));

import { handler } from "./index";

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    requestContext: {
      authorizer: {
        jwt: { claims: { sub: "user-123" } },
      },
    },
    pathParameters: { postId: "post-abc" },
    ...overrides,
  } as any;
}

const samplePost = {
  postId: "post-abc",
  userId: "user-123",
  s3Key: "uploads/user-123/photo.jpg",
  caption: "Hello",
};

describe("deletePost handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with deleted: true on success", async () => {
    mockDdbSend
      .mockResolvedValueOnce({ Item: samplePost }) // GetCommand
      .mockResolvedValueOnce({ Items: [] })          // QueryCommand (likes)
      .mockResolvedValueOnce({});                     // DeleteCommand (post)

    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.deleted).toBe(true);
  });

  it("deletes S3 image with correct bucket and key", async () => {
    mockDdbSend
      .mockResolvedValueOnce({ Item: samplePost })
      .mockResolvedValueOnce({ Items: [] })
      .mockResolvedValueOnce({});

    await handler(makeEvent());
    expect(mockS3Send).toHaveBeenCalledOnce();
    const s3Input = mockS3Send.mock.calls[0][0] as any;
    expect(s3Input.Bucket).toBe("test-bucket");
    expect(s3Input.Key).toBe("uploads/user-123/photo.jpg");
  });

  it("deletes associated likes before deleting post", async () => {
    mockDdbSend
      .mockResolvedValueOnce({ Item: samplePost })
      .mockResolvedValueOnce({ Items: [{ postId: "post-abc", userId: "liker-1" }, { postId: "post-abc", userId: "liker-2" }] })
      .mockResolvedValueOnce({})  // delete like 1
      .mockResolvedValueOnce({})  // delete like 2
      .mockResolvedValueOnce({}); // delete post

    await handler(makeEvent());
    // Get + Query + 2 like deletes + 1 post delete = 5 calls
    expect(mockDdbSend).toHaveBeenCalledTimes(5);
  });

  it("returns 400 when postId is missing", async () => {
    const res = await handler(makeEvent({ pathParameters: {} }));
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body as string);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when post does not exist", async () => {
    mockDdbSend.mockResolvedValueOnce({ Item: undefined });

    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body as string);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns 403 when user does not own the post", async () => {
    mockDdbSend.mockResolvedValueOnce({
      Item: { ...samplePost, userId: "other-user" },
    });

    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body as string);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("returns 500 on unexpected error", async () => {
    mockDdbSend.mockRejectedValueOnce(new Error("DynamoDB down"));

    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body as string);
    expect(body.error.code).toBe("INTERNAL_ERROR");
  });
});
