import type { LucideIcon } from "lucide-react";
import {
  Bike,
  Clock,
  GitBranch,
  Home,
  Leaf,
  MapPin,
  Package,
  PieChart,
  Recycle,
  ShieldCheck,
  Users,
  UtensilsCrossed,
} from "lucide-react";

import allocationImg from "@/assets/feature-smart-allocation.png";
import coordinationImg from "@/assets/feature-coordination.png";
import safetyImg from "@/assets/feature-safety.png";
import ghostImg from "@/assets/feature-ghost-reservations.png";
import reroutingImg from "@/assets/feature-rerouting.png";
import timeImg from "@/assets/feature-time-sensitive.png";
import impactImg from "@/assets/feature-impact.png";

/* ------------------------------------------------------------------ */
/* Illustrative landing-page data. The upcoming backend will replace   */
/* every value below through the same shape — no redesign required.    */
/* ------------------------------------------------------------------ */

export const NAV_LINKS = [
  { label: "Home", target: "home" },
  { label: "Our Solution", target: "our-solution" },
  { label: "How It Works", target: "how-it-works" },
  { label: "Impact", target: "impact" },
  { label: "About", target: "about" },
] as const;

export const HERO_BENEFITS = [
  { icon: Leaf, label: "Less Waste" },
  { icon: Clock, label: "Faster Deliveries" },
  { icon: Users, label: "Stronger Communities" },
] as const;

export type HeroCard = {
  id: string;
  title: string;
  subtitle?: string;
  detail?: string;
  meta?: string;
  icon: LucideIcon;
  /** Show the meals progress bar (Shelter A card). */
  progress?: { done: number; total: number };
};

/** Illustrative pickup / delivery / shelter demand cards on the hero visual. */
export const HERO_CARDS: HeroCard[] = [
  {
    id: "pickup",
    title: "Pickup",
    subtitle: "Green Leaf Restaurant",
    meta: "12 min away",
    icon: MapPin,
  },
  {
    id: "delivering",
    title: "Delivering",
    subtitle: "40 Meals",
    meta: "ETA: 12 min",
    icon: UtensilsCrossed,
  },
  {
    id: "shelter",
    title: "Shelter A",
    subtitle: "Remaining Demand",
    icon: Home,
    progress: { done: 30, total: 50 },
  },
];

export type Feature = {
  title: string;
  icon: LucideIcon;
  image: string;
  imageAlt: string;
};

/** The seven capability cards shown in the marquee carousel. */
export const FEATURES: Feature[] = [
  {
    title: "Smart Allocation",
    icon: Package,
    image: allocationImg,
    imageAlt: "Stacked takeaway meal containers with fresh food",
  },
  {
    title: "Real-time Coordination",
    icon: MapPin,
    image: coordinationImg,
    imageAlt: "Map with red pins connected by a dashed delivery route",
  },
  {
    title: "Safety & Compatibility",
    icon: ShieldCheck,
    image: safetyImg,
    imageAlt: "Supply boxes with a first-aid kit",
  },
  {
    title: "No More Ghost Reservations",
    icon: Users,
    image: ghostImg,
    imageAlt: "Red human silhouette beside a prohibition sign",
  },
  {
    title: "Dynamic Rerouting",
    icon: GitBranch,
    image: reroutingImg,
    imageAlt: "Branching dashed route toward two shelter markers",
  },
  {
    title: "Time-sensitive Deliveries",
    icon: Clock,
    image: timeImg,
    imageAlt: "Red alarm clock beside a bowl of food",
  },
  {
    title: "Impact Tracking",
    icon: PieChart,
    image: impactImg,
    imageAlt: "Rising red bar chart with a green sprout",
  },
];

/** Live-operations demo values (illustrative only, not real-time data). */
export const OPS_METRICS = [
  { icon: Bike, value: "24", label: "Active Riders" },
  { icon: Package, value: "18", label: "Ongoing Deliveries" },
  { icon: Home, value: "7", label: "Receiving Shelters" },
] as const;

export const RIDER = {
  id: "R-04",
  name: "Rider R-04",
  status: "In Transit",
  carrying: "40 meals",
  destination: "Shelter A",
  eta: "12 min",
  timeRemaining: "18 min",
  condition: "On track",
  /** Extra detail shown in the View Details panel. */
  donor: "Green Leaf Restaurant",
  pickupTime: "11:42",
  route: [
    "Picked up 40 meals at Green Leaf Restaurant",
    "En route — 2.1 km to Shelter A",
    "Shelter A remaining demand: 20 meals",
  ],
};

export const IMPACT_STATS = [
  { icon: UtensilsCrossed, value: "1,200+", label: "Meals Delivered" },
  { icon: Recycle, value: "94%", label: "Less Food Waste" },
  { icon: Users, value: "25+", label: "Active Volunteers" },
  { icon: Home, value: "12+", label: "Shelters Supported" },
] as const;

export const SOCIAL_LINKS = [
  { label: "LinkedIn", href: "#", icon: "linkedin" },
  { label: "Instagram", href: "#", icon: "instagram" },
  { label: "X", href: "#", icon: "x" },
  { label: "YouTube", href: "#", icon: "youtube" },
] as const;
