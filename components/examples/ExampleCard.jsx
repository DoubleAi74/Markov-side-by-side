import Image from "next/image";
import Link from "next/link";

const CARD_IMAGE_SIZES =
  "(min-width: 1024px) 240px, (min-width: 640px) 30vw, 45vw";

// One hue per simulator type, shown as the line along the bottom of the card.
const TYPE_LINE_COLORS = {
  gillespie: "bg-[#157C94]", // turquoise blue
  "ctmp-inhomo": "bg-[#B02B42]", // wine red
  sde: "bg-[#F0915E]", // pastel flame orange
  "discrete-time": "bg-[#2F6B35]", // deep leafy green
};

export default function ExampleCard({ example }) {
  const typeLineColor =
    TYPE_LINE_COLORS[example.simulatorType] ?? "bg-neutral-400";

  return (
    <Link
      href={`/examples/${example.slug}`}
      className="group block w-full overflow-hidden rounded-[4px] bg-white text-left shadow-sm transition-shadow duration-150 hover:shadow-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-700"
      aria-label={`Open ${example.name} (${example.cardLabel})`}
    >
      <div className="rounded-t-[4px] border border-b-0 border-neutral-200 p-1.5 pb-0">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-sm bg-zinc-200/50 shadow-sm">
          <Image
            src={example.previewImage}
            alt={`${example.name} simulation preview`}
            fill
            sizes={CARD_IMAGE_SIZES}
            className="object-cover"
            priority
          />
        </div>

        <div className="flex h-8 w-full items-center overflow-hidden px-0.5">
          <h3
            className="min-w-0 flex-1 text-xs font-bold leading-tight break-words text-black/90 line-clamp-2 group-hover:text-black"
            title={example.name}
          >
            {example.name}
          </h3>
        </div>
      </div>

      <div
        className={`h-[4.8px] opacity-20 transition-opacity duration-150 group-hover:opacity-70 ${typeLineColor}`}
        title={example.cardLabel}
        aria-hidden="true"
      />
    </Link>
  );
}
