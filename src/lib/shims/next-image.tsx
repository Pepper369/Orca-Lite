import React from "react";

export default function Image(props: any) {
  const { src, alt, width, height, className, priority, unoptimized, ...rest } = props;
  return (
    <img
      src={src}
      alt={alt || ""}
      width={width}
      height={height}
      className={className}
      loading={priority ? "eager" : "lazy"}
      {...rest}
    />
  );
}
