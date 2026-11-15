import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSend } = vi.hoisted(() => {
  process.env.POSTS_TABLE = "test-posts";
  process.env.LIKES_TABLE = "test-likes";
  return { mockSend: vi.fn(() => Promise.resolve({})) };
});
vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: vi.fn(() => ({})),
}));
vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: vi.fn(() => ({ send: mockSend })) },
  TransactWriteCommand: vi.fn((input) => input),
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

describe("unlikePost handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with liked: false on success", async () => {
    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.liked).toBe(false);
  });

  it("sends TransactWrite with Delete + Update (decrement)", async () => {
    await handler(makeEvent());
    expect(mockSend).toHaveBeenCalledOnce();
    const cmd = mockSend.mock.calls[0][0] as any;
    expect(cmd.TransactItems).toHaveLength(2);
    expect(cmd.TransactItems[0].Delete.TableName).toBe("test-likes");
    expect(cmd.TransactItems[0].Delete.Key).toEqual({ postId: "post-abc", userId: "user-123" });
    expect(cmd.TransactItems[1].Update.UpdateExpression).toBe("ADD likeCount :neg");
    expect(cmd.TransactItems[1].Update.ExpressionAttributeValues[":neg"]).toBe(-1);
  });

  it("returns 400 when postId is missing", async () => {
    const res = await handler(makeEvent({ pathParameters: {} }));
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body as string);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 409 when not liked yet", async () => {
    mockSend.mockRejectedValueOnce(Object.assign(new Error(), { name: "TransactionCanceledException" }));
    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body as string);
    expect(body.error.code).toBe("NOT_LIKED");
  });

  it("returns 500 on unexpected error", async () => {
    mockSend.mockRejectedValueOnce(new Error("DynamoDB down"));
    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body as string);
    expect(body.error.code).toBe("INTERNAL_ERROR");
  });
});
