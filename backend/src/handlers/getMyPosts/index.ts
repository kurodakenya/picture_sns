import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, BatchGetCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const POSTS_TABLE = process.env.POSTS_TABLE!;
const LIKES_TABLE = process.env.LIKES_TABLE!;
const BUCKET = process.env.S3_BUCKET!;
const PAGE_SIZE = 20;

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> => {
  try {
    const userId = event.requestContext.authorizer.jwt.claims.sub as string;
    const cursor = event.queryStringParameters?.cursor;

    const queryParams: Record<string, unknown> = {
      TableName: POSTS_TABLE,
      IndexName: "PostsByUser",
      KeyConditionExpression: "userId = :uid",
      ExpressionAttributeValues: { ":uid": userId },
      ScanIndexForward: false,
      Limit: PAGE_SIZE,
    };

    if (cursor) {
      queryParams.ExclusiveStartKey = JSON.parse(
        Buffer.from(cursor, "base64url").toString()
      );
    }

    const result = await ddb.send(new QueryCommand(queryParams as any));
    const posts = result.Items || [];

    let likedSet = new Set<string>();
    if (posts.length > 0) {
      const batchResult = await ddb.send(new BatchGetCommand({
        RequestItems: {
          [LIKES_TABLE]: {
            Keys: posts.map((p) => ({ postId: p.postId, userId })),
          },
        },
      }));
      const likedItems = batchResult.Responses?.[LIKES_TABLE] || [];
      likedSet = new Set(likedItems.map((i) => i.postId as string));
    }

    const items = await Promise.all(
      posts.map(async (p) => ({
        postId: p.postId,
        userId: p.userId,
        userName: p.userName,
        caption: p.caption,
        imageUrl: await getSignedUrl(
          s3,
          new GetObjectCommand({ Bucket: BUCKET, Key: p.s3Key as string }),
          { expiresIn: 3600 }
        ),
        createdAt: p.createdAt,
        likeCount: (p.likeCount as number) || 0,
        likedByMe: likedSet.has(p.postId as string),
      }))
    );

    let nextCursor: string | undefined;
    if (result.LastEvaluatedKey) {
      nextCursor = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString("base64url");
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ posts: items, nextCursor }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } }),
    };
  }
};
