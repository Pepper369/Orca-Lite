import React from "react";

export default function dynamic(
  loader: () => Promise<any>,
  options?: { ssr?: boolean; loading?: React.ComponentType<any> },
) {
  const Component = React.lazy(async () => {
    const mod = await loader();
    return mod.default ? mod : { default: mod };
  });
  const Loading = options?.loading;

  return function DynamicComponent(props: any) {
    return (
      <React.Suspense fallback={Loading ? <Loading /> : null}>
        <Component {...props} />
      </React.Suspense>
    );
  };
}
