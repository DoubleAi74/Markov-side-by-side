import Image from "next/image";
import Link from "next/link";

const CARD_IMAGE_SIZES =
  "(min-width: 1280px) 280px, (min-width: 768px) 30vw, 100vw";

export default function ExampleCard({ example }) {
  return (
    <Link
      href={`/examples/${example.slug}`}
      className="group block w-full text-left p-2 pb-[3px] rounded-[4px] border border-neutral-200 bg-white shadow-md hover:shadow-lg transition-shadow duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-700"
      aria-label={`Open ${example.name}`}
    >
      <div className="relative mb-1 aspect-[4/3] w-full overflow-hidden rounded-sm bg-zinc-200/50 shadow-md">
        <Image
          src={example.previewImage}
          alt={`${example.name} simulation preview`}
          fill
          sizes={CARD_IMAGE_SIZES}
          className="object-cover"
          priority
        />
      </div>
      <div className="flex h-8 w-full items-center justify-between gap-1 overflow-hidden pl-1 pr-1">
        <h3
          className="min-w-0 flex-1 text-sm font-bold leading-snug break-words text-black/90 line-clamp-2 group-hover:text-black"
          title={example.name}
        >
          {example.name}
        </h3>
        <span className="shrink-0 text-right text-xs leading-snug text-neutral-500">
          {example.cardLabel}
        </span>
      </div>
    </Link>
  );
}
