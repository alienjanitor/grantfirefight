// Need categories are shared vocabulary between the tracker, the grant
// matcher, the priority match and each program's form categories.

export const NEED_CATEGORIES = {
  turnout_ppe: "Structural turnout gear (coats, pants, helmets, hoods, gloves, boots)",
  wildland_ppe: "Wildland PPE",
  scba: "SCBA packs and cylinders",
  scba_facepiece: "SCBA facepieces",
  rit_pack: "RIT pack or RIT cylinder",
  radios_pagers: "Radios and pagers",
  water_movement: "Hose, nozzles, pumps, slip-in or foam units",
  wildland_equipment: "Wildland equipment",
  water_storage: "Rural water storage (cisterns, dry hydrants)",
  safety_equipment: "Other safety equipment",
  excess_property_conversion: "Converting a federal excess property vehicle to a fire rig",
  thermal_imaging: "Thermal imaging camera",
  vehicle: "Vehicle or apparatus purchase",
  ems_equipment: "EMS or ambulance equipment",
  water_rescue: "Water rescue equipment",
  training: "Training",
  wellness_fitness: "Wellness and fitness",
  facility: "Station repair, modification or construction",
  maintenance: "Routine maintenance (tires, batteries, tune-ups)",
  siren: "Sirens",
  other: "Other",
} as const;

export type NeedCategory = keyof typeof NEED_CATEGORIES;

export const NEED_REASONS = {
  replace_expired: "Replace expired or noncompliant gear",
  replace_damaged: "Replace damaged, unsafe or unrepairable gear",
  members_without: "Members who don't have a set",
  upgrade: "Upgrade working gear",
  new_capability: "New capability",
  other: "Other",
} as const;

export type NeedReason = keyof typeof NEED_REASONS;

export function isNeedCategory(value: string): value is NeedCategory {
  return Object.hasOwn(NEED_CATEGORIES, value);
}

export function isNeedReason(value: string): value is NeedReason {
  return Object.hasOwn(NEED_REASONS, value);
}

export interface NeedLike {
  id: string;
  category: string;
  reason: string;
  description: string;
  quantity: number;
  estimated_cost: number;
  used_equipment: number;
  asset_id: string | null;
}
