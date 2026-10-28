import Image from 'next/image';

/**
 * The OASYS mark with no tile behind it. Light surfaces get the navy version,
 * dark surfaces (and navy bands, via `onBrand`) the silver one. Both are in the
 * DOM and CSS picks one, so the switch follows the theme without a re-render.
 */
export default function Logo({
  size = 32,
  onBrand = false,
  wordmark = true,
}: {
  size?: number;
  onBrand?: boolean;
  wordmark?: boolean;
}) {
  return (
    <span className="flex items-center gap-2.5">
      <Image
        src="/oasys-logo.png"
        alt=""
        width={size * 2}
        height={size * 2}
        priority
        className={`object-contain ${onBrand ? '' : 'logo-on-dark'}`}
        style={{ width: size, height: size }}
      />
      {!onBrand && (
        <Image
          src="/oasys-logo-dark.png"
          alt=""
          width={size * 2}
          height={size * 2}
          priority
          className="object-contain logo-on-light"
          style={{ width: size, height: size }}
        />
      )}
      {wordmark && <span className="text-lg font-semibold tracking-tight text-fg">OASYS</span>}
    </span>
  );
}
