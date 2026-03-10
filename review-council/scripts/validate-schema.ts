/**
 * Minimal JSON Schema validator — zero runtime dependencies.
 * Supports: type, required, properties, additionalProperties, enum, items, minimum, $ref/$defs.
 */

import type { JsonValue, JsonObject, Schema, ValidationError } from "./types.ts";

export type { ValidationError };

function typeOf(value: JsonValue): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value; // "string" | "number" | "boolean" | "object"
}

function resolveRef(ref: string, root: Schema): Schema | null {
  // Only supports local refs: "#/$defs/Foo"
  if (!ref.startsWith("#/")) return null;
  const segments = ref.slice(2).split("/");
  let current: JsonValue = root;
  for (const seg of segments) {
    if (typeof current !== "object" || current === null || Array.isArray(current)) return null;
    current = current[seg] as JsonValue;
    if (current === undefined) return null;
  }
  return typeof current === "object" && current !== null && !Array.isArray(current)
    ? current as Schema
    : null;
}

function validateNode(
  value: JsonValue,
  schema: Schema,
  root: Schema,
  path: string,
  errors: ValidationError[],
): void {
  // Resolve $ref
  if (typeof schema.$ref === "string") {
    const resolved = resolveRef(schema.$ref as string, root);
    if (!resolved) {
      errors.push({ path, message: `unresolvable $ref: ${schema.$ref}` });
      return;
    }
    validateNode(value, resolved, root, path, errors);
    return;
  }

  // type
  if (typeof schema.type === "string") {
    const expected = schema.type as string;
    const actual = typeOf(value);
    const ok =
      expected === "integer"
        ? typeof value === "number" && Number.isInteger(value)
        : actual === expected;
    if (!ok) {
      errors.push({ path, message: `expected type "${expected}", got "${actual}"` });
      return; // skip deeper checks when type is wrong
    }
  }

  // enum
  if (Array.isArray(schema.enum)) {
    const allowed = schema.enum as JsonValue[];
    if (!allowed.some((a) => JSON.stringify(a) === JSON.stringify(value))) {
      errors.push({ path, message: `value ${JSON.stringify(value)} not in enum [${allowed.map((a) => JSON.stringify(a)).join(", ")}]` });
    }
  }

  // minimum
  if (typeof schema.minimum === "number" && typeof value === "number") {
    if (value < (schema.minimum as number)) {
      errors.push({ path, message: `value ${value} is below minimum ${schema.minimum}` });
    }
  }

  // format (only date-time is supported)
  if (schema.format === "date-time" && typeof value === "string") {
    if (Number.isNaN(Date.parse(value))) {
      errors.push({ path, message: `invalid date-time format: "${value}"` });
    }
  }

  // object checks
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const obj = value as JsonObject;

    // required
    if (Array.isArray(schema.required)) {
      for (const key of schema.required as string[]) {
        if (!(key in obj)) {
          errors.push({ path: path ? `${path}.${key}` : key, message: `required property missing` });
        }
      }
    }

    // properties
    if (typeof schema.properties === "object" && schema.properties !== null && !Array.isArray(schema.properties)) {
      const props = schema.properties as JsonObject;
      for (const [key, propSchema] of Object.entries(props)) {
        if (key in obj) {
          validateNode(
            obj[key],
            propSchema as Schema,
            root,
            path ? `${path}.${key}` : key,
            errors,
          );
        }
      }

      // additionalProperties
      if (schema.additionalProperties === false) {
        for (const key of Object.keys(obj)) {
          if (!(key in props)) {
            errors.push({
              path: path ? `${path}.${key}` : key,
              message: `additional property not allowed`,
            });
          }
        }
      }
    }
  }

  // array checks
  if (Array.isArray(value) && typeof schema.items === "object" && schema.items !== null && !Array.isArray(schema.items)) {
    const itemSchema = schema.items as Schema;
    for (let i = 0; i < value.length; i++) {
      validateNode(value[i], itemSchema, root, `${path}[${i}]`, errors);
    }
  }
}

export function validateSchema(value: JsonValue, schema: Schema): ValidationError[] {
  const errors: ValidationError[] = [];
  validateNode(value, schema, schema, "", errors);
  return errors;
}
