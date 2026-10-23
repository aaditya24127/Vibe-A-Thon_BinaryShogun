import heroRider from "@/assets/hero-rider.png";
import { HERO_CARDS } from "@/data/landing";
import { FloatingInfoCard } from "@/components/landing/FloatingInfoCard";

/** Organic blob clip for the hero photograph. */
const BLOB_CLIP =
  "polygon(0% 12%, 8% 4%, 22% 0%, 45% 2%, 68% 0%, 88% 6%, 100% 22%, 98% 48%, 100% 72%, 90% 92%, 68% 100%, 42% 98%, 18% 100%, 4% 90%, 0% 62%, 2% 34%)";

/**
 * Hero photograph with a cherry-red organic shape behind it and the three
 * floating live-shipment cards. Values are illustrative demo data.
 */
export function HeroVisual() {
  // The three illustrative hero cards, resolved by id.
  const pickup = HERO_CARDS.find((c) => c.id === "pickup")!;
  const delivering = HERO_CARDS.find((c) => c.id === "delivering")!;
  const shelter = HERO_CARDS.find((c) => c.id === "shelter")!;
  return (
    <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
      {/* Cherry organic shape behind the image */}
      <div
        aria-hidden="true"
        className="absolute -top-8 right-0 h-[112%] w-[106%] rotate-6 bg-gradient-to-br from-cherry via-[#C2273D] to-[#E0606B] opacity-90"
        style={{ borderRadius: "58% 42% 55% 45% / 48% 56% 44% 52%" }}
      />
      <img
        src={heroRider}
        alt="Volunteer delivery rider on a scooter carrying a branded WeConnect delivery box through a city street"
        width={1024}
        height={1024}
        fetchPriority="high"
        className="relative z-[1] h-auto w-full object-cover shadow-[0_30px_60px_-25px_rgba(57,7,16,0.5)]"
        style={{
          clipPath: BLOB_CLIP,
          borderRadius: "38% 62% 55% 45% / 45% 48% 52% 55%",
        }}
      />

      <FloatingInfoCard card={pickup} className="-left-2 top-6 sm:-left-8 sm:top-10 lg:-left-14" />
      <FloatingInfoCard card={delivering} className="-right-1 top-24 sm:-right-2 sm:top-28" />
      <FloatingInfoCard card={shelter} className="-right-1 bottom-8 sm:-right-2" />
    </div>
  );
}
