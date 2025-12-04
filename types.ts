export interface BilibiliComment {
  rpid: number; // Comment ID
  oid: number; // Video ID
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
  ctime: number; // Timestamp
  like: number;
}

export interface Winner extends BilibiliComment {
  wonAt: number;
}

export interface FilterSettings {
  keywords: string[];
  filterDuplicates: boolean;
  minLevel: number;
  winnerCount: number;
}