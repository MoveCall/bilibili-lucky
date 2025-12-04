export interface CommentUser {
  mid: string;
  uname: string;
  message: string;
  avatar: string;
  ctime?: number;
  level: number; // User level (0-6)
}

export interface BiliApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

export interface VideoInfo {
  aid: number;
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
  };
  replies: Array<{
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
  }>;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
}
