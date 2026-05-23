/// <reference path="../.astro/types.d.ts" />
/// <reference types="vite/client" />

import type { Theme } from "@/lib/preferences";
import type { UnitSystem } from "@/lib/units/units";

declare global {
  namespace App {
    interface Locals {
      theme: Theme;
      units: UnitSystem;
    }
  }
}

export {};
