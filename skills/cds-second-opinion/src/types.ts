export interface Message {
  role: "user" | "assistant";
  text: string;
  thinking?: string;
  tools?: string[];
}

export interface SessionInfo {
  path: string;
  mtime: number;
}
