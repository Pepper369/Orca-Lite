import React from "react";
import { sanitizeImageSrc } from "@/lib/security/xss";

export default function Image(props: any) {
  const { src, alt, width, height, className, priority, unoptimized, ...rest } = props;
  const safeSrc = sanitizeImageSrc(src, { allowSafeDataImage: true });
  if (!safeSrc) return null;
  return (
    <img
      src={safeSrc}
      alt={alt || ""}
      width={width}
      height={height}
      className={className}
      loading={priority ? "eager" : "lazy"}
      {...rest}
    />
  );
}
