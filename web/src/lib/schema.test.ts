import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FeedSchema,
  ModelSchema,
  StationSchema,
  TimeseriesPointSchema,
} from "./schema";

/**
 * Guards against drift between the Zod schema and the shared JSON Schema
 * contract. The JSON Schema (in the repo's `schema/` directory) is the source
 * of truth; if the API changes the feed shape, this test fails until
 * `schema.ts` is updated to match.
 */

type JsonSchemaObject = {
  properties?: Record<string, unknown>;
  $defs?: Record<string, JsonSchemaObject>;
};

const jsonSchema = JSON.parse(
  readFileSync(
    join(process.cwd(), "..", "schema", "sfbofs-sfb1204.schema.json"),
    "utf8",
  ),
) as JsonSchemaObject;

const sorted = (keys: string[]) => [...keys].sort();
const propNames = (node: JsonSchemaObject | undefined) =>
  sorted(Object.keys(node?.properties ?? {}));

describe("Zod schema matches the JSON Schema contract", () => {
  it("feed has the same top-level properties", () => {
    expect(sorted(Object.keys(FeedSchema.shape))).toEqual(propNames(jsonSchema));
  });

  it("station has the same properties", () => {
    expect(sorted(Object.keys(StationSchema.shape))).toEqual(
      propNames(jsonSchema.properties?.station as JsonSchemaObject),
    );
  });

  it("model has the same properties", () => {
    expect(sorted(Object.keys(ModelSchema.shape))).toEqual(
      propNames(jsonSchema.properties?.model as JsonSchemaObject),
    );
  });

  it("timeseries point has the same properties", () => {
    expect(sorted(Object.keys(TimeseriesPointSchema.shape))).toEqual(
      propNames(jsonSchema.$defs?.timeseriesPoint),
    );
  });
});

describe("FeedSchema parsing", () => {
  const validFeed = {
    station: {
      id: "SFB1204",
      name: "SW of Alcatraz Island",
      lat: 37.8138,
      lon: -122.43236,
    },
    model: {
      name: "SFBOFS",
      cycle: "2026-05-20T09:00:00Z",
      fetched_at: "2026-05-20T09:45:23Z",
      source_files: ["sfbofs.t09z.20260520.stations.nowcast.nc"],
      model_version: "FVCOM_4.4.7",
    },
    timeseries: [
      {
        t: "2026-05-20T03:00:00Z",
        source: "nowcast",
        water_temp_c: 12.453,
        water_temp_f: 54.41,
        current_u_ms: 0.1234,
        current_v_ms: -0.0567,
        current_speed_ms: 0.1364,
        current_speed_kt: 0.265,
        current_bearing_deg: 335.17,
        water_level_m: 0.5123,
        water_level_ft: 1.68,
        salinity_psu: 32.456,
        wind_u_ms: 2.345,
        wind_v_ms: -1.234,
        wind_speed_ms: 2.637,
        wind_speed_kt: 5.123,
        wind_bearing_deg: 157.84,
      },
    ],
  };

  it("accepts a valid feed", () => {
    expect(() => FeedSchema.parse(validFeed)).not.toThrow();
  });

  it("rejects a feed with an empty timeseries", () => {
    expect(() => FeedSchema.parse({ ...validFeed, timeseries: [] })).toThrow();
  });

  it("rejects a current bearing outside 0-360", () => {
    const bad = structuredClone(validFeed);
    bad.timeseries[0].current_bearing_deg = 400;
    expect(() => FeedSchema.parse(bad)).toThrow();
  });
});
