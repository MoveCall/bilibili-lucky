export interface CommentUser {
  commentId?: string;
  mid: string;
  uname: string;
  message: string;
  avatar: string;
  ctime?: number; // Comment timestamp
  level: number; // User level (0-6)
}

export interface BiliApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

export interface VideoInfo {
  aid: number; // This is the OID
  bvid: string;
  title: string;
  pic: string;
  owner: {
    name: string;
    face: string;
  };
}

export interface ReplyData {
  cursor: {
    is_end: boolean;
    next: number;
    all_count?: number;
    pagination_reply?: {
      next_offset?: string;
      prev_offset?: string;
    };
  };
  replies: BiliReplyItem[];
}

export interface SubReplyData {
  page: {
    count: number;
    num: number;
    size: number;
  };
  replies: BiliReplyItem[];
}

export interface BiliReplyItem {
  rpid: number;
  rcount?: number;
  member: {
    mid: string;
    uname: string;
    avatar: string;
    level_info: {
      current_level: number;
    };
  };
  content: {
    message: string;
  };
  ctime: number;
  replies?: BiliReplyItem[];
}

export interface LogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
}
