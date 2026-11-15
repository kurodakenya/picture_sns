import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";

const s3 = new S3Client({});
const BUCKET = process.env.S3_BUCKET!;
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
};
const MAX_SIZE = 10 * 1024 * 1024;

export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> => {
  try {
    const userId = event.requestContext.authorizer.jwt.claims.sub as string;

    const body = JSON.parse(event.body || "{}");
    const { contentType, fileSize } = body;

    if (!contentType || !ALLOWED_TYPES[contentType]) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: { code: "INVALID_FILE_TYPE", message: "Supported: JPEG, PNG" } }),
      };
    }

    if (fileSize && fileSize > MAX_SIZE) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: { code: "FILE_TOO_LARGE", message: "Max file size is 10MB" } }),
      };
    }

    const ext = ALLOWED_TYPES[contentType];
    const s3Key = `uploads/${userId}/${crypto.randomUUID()}.${ext}`;

    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({ Bucket: BUCKET, Key: s3Key, ContentType: contentType }),
      { expiresIn: 300 }
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ uploadUrl, s3Key }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } }),
    };
  }
};
