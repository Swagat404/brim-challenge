import * as React from "react";
import Image from "next/image";

/**
 * IMPORTANT: Local SubframeUtils lives INSIDE this component file.
 * Provides createTwClassNames() and twClassNames instance.
 */
const SubframeUtils = {
  createTwClassNames() {
    return (...classes: ClassValue[]) =>
      classes
        .flatMap((c) => {
          if (!c) return [];
          if (typeof c === "string") return [c];
          return Object.entries(c)
            .filter(([, ok]) => !!ok)
            .map(([k]) => k);
        })
        .join(" ");
  },
};

type ClassValue =
  | string
  | null
  | undefined
  | false
  | Record<string, boolean>;

const twClassNames = SubframeUtils.createTwClassNames();

export interface ComponentProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "brand" | "neutral" | "error" | "success" | "warning";
  size?: "x-large" | "large" | "medium" | "small" | "x-small";
  children?: React.ReactNode;
  image?: string;
  square?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const Avatar2 = React.forwardRef<HTMLDivElement, ComponentProps>(
  function Component(
    {
      variant = "neutral",
      size = "medium",
      children,
      image,
      square = false,
      className,
      style,
      ...otherProps
    },
    ref
  ) {
    return (
      <div
        ref={ref}
        {...otherProps}
        style={style}
        className={twClassNames(
          "group/bec25ae6 relative flex h-8 w-8 flex-col items-center justify-center gap-2 overflow-hidden rounded-full",
          {
            "rounded-md": square,
            "h-5 w-5": size === "x-small",
            "h-6 w-6": size === "small",
            "h-10 w-10": size === "medium",
            "h-12 w-12": size === "large",
            "h-16 w-16": size === "x-large",
            "bg-amber-100": variant === "warning",
            "bg-emerald-100": variant === "success",
            "bg-rose-100": variant === "error",
            "bg-[#8b9286]": variant === "neutral", // Updated to match the muted olive green
            "bg-blue-100": variant === "brand",
          },
          className
        )}
      >
        {children ? (
          <span
            className={twClassNames(
              "absolute line-clamp-1 w-full text-center font-['Inter'] text-[14px] font-[500] leading-[14px]",
              {
                "text-[10px] leading-[10px]":
                  size === "x-small" || size === "small",
                "text-[18px] leading-[18px]": size === "large",
                "text-[24px] leading-[24px]": size === "x-large",
                "text-amber-800": variant === "warning",
                "text-emerald-800": variant === "success",
                "text-rose-800": variant === "error",
                "text-white": variant === "neutral", // Updated to match the screenshot
                "text-blue-800": variant === "brand",
              }
            )}
          >
            {children}
          </span>
        ) : null}

        {image ? (
          <Image
            src={image}
            alt=""
            width={64}
            height={64}
            className={twClassNames(
              "absolute h-8 w-8 flex-none object-cover",
              {
                "h-5 w-5": size === "x-small",
                "h-6 w-6": size === "small",
                "h-10 w-10": size === "medium",
                "h-12 w-12": size === "large",
                "h-16 w-16": size === "x-large",
              }
            )}
          />
        ) : null}
      </div>
    );
  }
);

export default Avatar2;
