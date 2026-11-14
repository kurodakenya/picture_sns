export interface Post {
  postId: string;
  userId: string;
  userName: string;
  caption: string;
  imageUrl: string;
  s3Key: string;
  createdAt: string;
  likeCount: number;
  likedByMe?: boolean;
}

export interface FeedResponse {
  posts: Post[];
  nextCursor?: string;
}

export interface PresignRequest {
  contentType: string;
  fileName: string;
}

export interface PresignResponse {
  uploadUrl: string;
  s3Key: string;
}

export interface CreatePostRequest {
  s3Key: string;
  caption: string;
}

export interface CreatePostResponse {
  postId: string;
  createdAt: string;
}

export interface DeletePostResponse {
  deleted: boolean;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "INVALID_FILE_TYPE"
  | "FILE_TOO_LARGE"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INTERNAL_ERROR";
