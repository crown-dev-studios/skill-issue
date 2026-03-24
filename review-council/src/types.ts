export type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

export interface ValidationError {
  path: string;
  message: string;
}
