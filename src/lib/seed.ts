import type { Category } from "./types";

/** Seeded operating state. Times are minutes relative to the moment of seeding. */
export const SEED_SETTINGS: Record<string, [number, string]> = {
  speed_kmph: [25, "Average scooter speed in km per hour"],
  pickup_allowance_min: [10, "Fixed minutes added for loading at the donor"],
  safety_buffer_min: [15, "Minutes kept between arrival and expiry"],
  heartbeat_interval_s: [30, "Rider heartbeat interval in seconds"],
  missed_heartbeat_threshold: [2, "Missed heartbeats before a lease is overdue"],
  ack_grace_s: [30, "Extra seconds before an overdue lease is acted on"],
  max_active_leases: [2, "Maximum active leases per rider"],
  at_risk_threshold_min: [45, "Margin below which a delivery is at risk"],
  clock_offset_min: [0, "Minutes added to server time by the simulated clock"],
  sim_time_scale: [30, "Rider movement speed-up used by the position tick"],
};

export const SEED_DONORS = [
  { id: "DN-1", name: "Greenleaf Kitchen", type: "restaurant", lat: 18.5287, lng: 73.8446, area_name: "Deccan" },
  { id: "DN-2", name: "Harbour Street Diner", type: "restaurant", lat: 18.5136, lng: 73.8561, area_name: "Market Yard" },
  { id: "DN-3", name: "North Campus Hostel Mess", type: "hostel_mess", lat: 18.5496, lng: 73.8302, area_name: "University Road" },
  { id: "DN-4", name: "Lakeside Pharmacy", type: "pharmacy", lat: 18.5362, lng: 73.8829, area_name: "Lakeside" },
  { id: "DN-5", name: "Station Road Canteen", type: "restaurant", lat: 18.5289, lng: 73.8744, area_name: "Station Road" },
  { id: "DN-6", name: "Civic Care Pharmacy", type: "pharmacy", lat: 18.4983, lng: 73.8412, area_name: "Southfield" },
] as const;

const ALL: Category[] = ["cooked_food", "medical", "ration_kit", "infant_formula", "essential_kit"];

export const SEED_SHELTERS = [
  { id: "SH-1", name: "Riverside Night Shelter", lat: 18.5207, lng: 73.8478, area_name: "Riverside", total_capacity: 120, unmet_demand: 60, status: "open",
    accepted_categories: ["cooked_food", "medical", "essential_kit", "infant_formula"] as Category[], has_water: true, has_cooking_fuel: false, has_cold_storage: false },
  { id: "SH-2", name: "Eastgate Relief Camp", lat: 18.5391, lng: 73.8913, area_name: "Eastgate", total_capacity: 200, unmet_demand: 100, status: "open",
    accepted_categories: ALL, has_water: true, has_cooking_fuel: true, has_cold_storage: true },
  { id: "SH-3", name: "Old Market Shelter", lat: 18.5101, lng: 73.8567, area_name: "Old Market", total_capacity: 150, unmet_demand: 70, status: "open",
    accepted_categories: ["cooked_food", "essential_kit", "ration_kit"] as Category[], has_water: true, has_cooking_fuel: false, has_cold_storage: false },
  { id: "SH-4", name: "Southfield Relief Camp", lat: 18.4932, lng: 73.8503, area_name: "Southfield", total_capacity: 110, unmet_demand: 60, status: "open",
    accepted_categories: ALL, has_water: true, has_cooking_fuel: true, has_cold_storage: false },
  { id: "SH-5", name: "Hillcrest Women's Shelter", lat: 18.5568, lng: 73.8190, area_name: "Hillcrest", total_capacity: 60, unmet_demand: 40, status: "open",
    accepted_categories: ["cooked_food", "medical", "essential_kit"] as Category[], has_water: false, has_cooking_fuel: false, has_cold_storage: true },
] as const;

export const SEED_RULES = [
  { id: "CR-1", category: "ration_kit", required_resources: ["water", "cooking_fuel"], verified: true,
    source_note: "Dry ration kits cannot be eaten without potable water and a way to cook them (general food-handling guidance)." },
  { id: "CR-2", category: "infant_formula", required_resources: ["water", "cooking_fuel"], verified: true,
    source_note: "Powdered infant formula must be mixed with safe, boiled water (general infant-feeding safety guidance)." },
  { id: "CR-3", category: "medical", required_resources: ["cold_storage"], verified: false,
    source_note: "Some short-life medical supplies need refrigeration; item-level storage data is not captured, so this rule is unconfirmed." },
  { id: "CR-4", category: "cooked_food", required_resources: ["water"], verified: false,
    source_note: "Serving cooked food normally needs water for hand washing and cleaning; the minimum requirement has not been confirmed." },
] as const;

export const SEED_RIDERS = [
  { id: "RD-1", name: "Arjun K.", capacity_units: 40, lat: 18.5262, lng: 73.8467 },
  { id: "RD-2", name: "Meera S.", capacity_units: 40, lat: 18.5154, lng: 73.8579 },
  { id: "RD-3", name: "Imran D.", capacity_units: 40, lat: 18.5472, lng: 73.8341 },
  { id: "RD-4", name: "Priya N.", capacity_units: 40, lat: 18.5331, lng: 73.8794 },
  { id: "RD-5", name: "Sanjay R.", capacity_units: 30, lat: 18.5011, lng: 73.8433 },
  { id: "RD-6", name: "Neha P.", capacity_units: 25, lat: 18.5290, lng: 73.8700 },
] as const;

export const SEED_BATCHES = [
  { id: "FD-1035", donor_id: "DN-1", item_name: "Vegetable biryani trays", category: "cooked_food", quantity: 180, unit: "meals",
    start: 0, end: 60, expires: 150, handling: "Keep covered and upright. Deliver warm.", storage: "Ambient, covered", compat: "None" },
  { id: "FD-1036", donor_id: "DN-3", item_name: "Dal and rice portions", category: "cooked_food", quantity: 60, unit: "portions",
    start: 0, end: 40, expires: 80, handling: "Sealed containers. Deliver within the window.", storage: "Ambient, sealed", compat: "None" },
  { id: "FD-1037", donor_id: "DN-4", item_name: "Oral rehydration solution packs", category: "medical", quantity: 120, unit: "packs",
    start: 0, end: 120, expires: 300, handling: "Keep dry and out of direct sun.", storage: "Cool, below 25 C", compat: "Cold storage preferred" },
  { id: "FD-1038", donor_id: "DN-2", item_name: "Dry ration kits", category: "ration_kit", quantity: 40, unit: "kits",
    start: 0, end: 240, expires: 600, handling: "Do not stack more than four high.", storage: "Dry", compat: "Needs clean water and cooking fuel on site" },
  { id: "FD-1039", donor_id: "DN-6", item_name: "Infant formula tins", category: "infant_formula", quantity: 30, unit: "tins",
    start: 0, end: 240, expires: 720, handling: "Keep sealed. Check the printed date.", storage: "Cool and dry", compat: "Needs clean water and cooking fuel on site" },
  { id: "FD-1040", donor_id: "DN-5", item_name: "Blanket and hygiene kits", category: "essential_kit", quantity: 50, unit: "kits",
    start: 0, end: 300, expires: 1440, handling: "None", storage: "Dry", compat: "None" },
  { id: "FD-1041", donor_id: "DN-5", item_name: "Chapati and vegetable curry", category: "cooked_food", quantity: 90, unit: "meals",
    start: 0, end: 45, expires: 100, handling: "Insulated boxes. Deliver warm.", storage: "Ambient, insulated", compat: "None" },
  { id: "FD-1042", donor_id: "DN-6", item_name: "Wound dressing packs", category: "medical", quantity: 60, unit: "packs",
    start: 0, end: 180, expires: 360, handling: "Keep sterile packaging intact.", storage: "Dry", compat: "None" },
] as const;
