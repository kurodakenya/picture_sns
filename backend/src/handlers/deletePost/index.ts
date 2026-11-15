import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, DeleteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const POSTS_TABLE = process.env.POSTS_TABLE!;
const LIKES_TABLE = process.env.LIKES_TABLE!;
const S3_BUCKET = process.env.S3_BUCKET!;

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> => {
  try {
    const userId = event.requestContext.authorizer.jwt.claims.sub as string;
    const postId = event.pathParameters?.postId;

    if (!postId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: { code: "VALIDATION_ERROR", message: "postId is required" } }),
      };
    }

    const { Item: post } = await ddb.send(new GetCommand({
      TableName: POSTS_TABLE,
      Key: { postId },
    }));

    if (!post) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: { code: "NOT_FOUND", message: "Post not found" } }),
      };
    }

    if (post.userId !== userId) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: { code: "FORBIDDEN", message: "Cannot delete another user's post" } }),
      };
    }

    // Delete S3 image
    await s3.send(new DeleteObjectCommand({
      Bucket: S3_BUCKET,
      Key: post.s3Key,
    }));

    // Delete all likes for this post
    const { Items: likes } = await ddb.send(new QueryCommand({
      TableName: LIKES_TABLE,
      KeyConditionExpression: "postId = :pid",
      ExpressionAttributeValues: { ":pid": postId },
    }));

    if (likes && likes.length > 0) {
      for (const like of likes) {
        await ddb.send(new DeleteCommand({
          TableName: LIKES_TABLE,
          Key: { postId: like.postId, userId: like.userId },
        }));
      }
    }

    // Delete the post
    await ddb.send(new DeleteCommand({
      TableName: POSTS_TABLE,
      Key: { postId },
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({ deleted: true }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } }),
    };
  }
};
