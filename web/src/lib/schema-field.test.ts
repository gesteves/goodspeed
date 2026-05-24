import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FieldBboxSchema,
  FieldCenterSchema,
  FieldFeedSchema,
  FieldFrameSchema,
  FieldGridSchema,
} from "./schema";

/** Drift check between Zod and the shared JSON Schema for the field feed. */

type JsonSchemaObject = {
  properties?: Record<string, unknown>;
  $defs?: Record<string, JsonSchemaObject>;
};

const jsonSchema = JSON.parse(
  readFileSync(
    join(process.cwd(), "..", "schema", "sfbofs-field.schema.json"),
    "utf8",
  ),
) as JsonSchemaObject;

const sorted = (keys: string[]) => [...keys].sort();
const propNames = (node: JsonSchemaObject | undefined) =>
  sorted(Object.keys(node?.properties ?? {}));

describe("Zod field schema matches the JSON Schema contract", () => {
  it("feed has the same top-level properties", () => {
    expect(sorted(Object.keys(FieldFeedSchema.shape))).toEqual(
      propNames(jsonSchema),
    );
  });

  it("bbox has the same properties", () => {
    expect(sorted(Object.keys(FieldBboxSchema.shape))).toEqual(
      propNames(jsonSchema.properties?.bbox as JsonSchemaObject),
    );
  });

  it("center has the same properties", () => {
    expect(sorted(Object.keys(FieldCenterSchema.shape))).toEqual(
      propNames(jsonSchema.properties?.center as JsonSchemaObject),
    );
  });

  it("grid has the same properties", () => {
    expect(sorted(Object.keys(FieldGridSchema.shape))).toEqual(
      propNames(jsonSchema.properties?.grid as JsonSchemaObject),
    );
  });

  it("frame has the same properties", () => {
    expect(sorted(Object.keys(FieldFrameSchema.shape))).toEqual(
      propNames(jsonSchema.$defs?.frame),
    );
  });
});

describe("FieldFeedSchema parsing", () => {
  const validFeed = {
    model: {
      name: "SFBOFS",
      cycle: "2026-05-23T15:00:00Z",
      fetched_at: "2026-05-23T15:35:00Z",
      source_files: ["sfbofs.t15z.20260523.regulargrid.n000.nc"],
      model_version: "FVCOM_4.4.7",
    },
    bbox: { lat_min: 37.804, lat_max: 37.836, lon_min: -122.455, lon_max: -122.4 },
    center: { lat: 37.817, lon: -122.435 },
    grid: { lat: [37.815, 37.825], lon: [-122.43, -122.42] },
    t: ["2026-05-23T15:00:00Z"],
    source: ["nowcast"],
    frames: [
      {
        current_speed_ms: [0.5, 0.4],
        current_speed_kt: [0.972, 0.778],
        current_bearing_deg: [120.0, 110.0],
        water_temp_c: [14.5, 14.3],
        water_temp_f: [58.1, 57.7],
      },
    ],
  };

  it("accepts a valid feed", () => {
    expect(() => FieldFeedSchema.parse(validFeed)).not.toThrow();
  });

  it("rejects a frame with a bearing out of range", () => {
    const bad = structuredClone(validFeed);
    bad.frames[0].current_bearing_deg = [400];
    expect(() => FieldFeedSchema.parse(bad)).toThrow();
  });
});
