import Image from "next/image";
import Link from "next/link";
import { Reveal } from "@/components/Reveal";

/**
 * Оболонка сторінок входу та реєстрації.
 *
 * До цього обидві були вузькою сірою коробкою посеред порожнього екрана:
 * ніяк не пов'язана з магазином сторінка, на якій людина вводить пароль. Тут
 * той самий прийом, що й на головній — кампейн-кадр на всю висоту зліва,
 * робота справа. На телефоні кадр стискається до смуги, щоб не з'їдати екран
 * над формою: там головне швидко дістатись до полів.
 */
export function AuthShell({
  image = "/images/cat-women-editorial-ss26.webp",
  eyebrow,
  title,
  caption,
  children,
  footer,
}: {
  image?: string;
  eyebrow: string;
  title: string;
  caption?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-[calc(100dvh-var(--header-h,120px))] lg:grid-cols-[1.05fr_1fr]">
      {/* Кадр. На телефоні це смуга 34vh, на десктопі повна колонка. */}
      <div className="relative h-[34vh] min-h-[220px] overflow-hidden lg:h-auto lg:min-h-0">
        <Image
          src={image}
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 52vw, 100vw"
          className="object-cover object-[50%_28%]"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(23,19,15,0.42) 0%, rgba(23,19,15,0.12) 45%, rgba(23,19,15,0.5) 100%)",
          }}
        />
        <div className="absolute inset-x-0 bottom-0 p-7 lg:p-12">
          <Link href="/" className="font-display text-xl tracking-wordmark text-paper lg:text-2xl">
            MANIA&nbsp;GROUP
          </Link>
          <p className="mt-2 max-w-[34ch] text-[13px] leading-relaxed text-paper/70">
            Італійські марки напряму від брендів. Оригінал, з документами на кожну партію.
          </p>
        </div>
      </div>

      {/* Форма */}
      <div className="flex items-center justify-center px-5 py-12 sm:px-10 lg:py-16">
        <Reveal className="w-full max-w-[380px]">
          <p className="text-[11px] uppercase tracking-luxe text-muted">{eyebrow}</p>
          <h1 className="mt-3 font-display text-[2rem] leading-tight text-ink md:text-[2.4rem]">{title}</h1>
          {caption && <p className="mt-3 text-sm leading-relaxed text-muted">{caption}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 border-t border-line pt-6">{footer}</div>}
        </Reveal>
      </div>
    </div>
  );
}
