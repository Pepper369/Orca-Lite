// Next.js Headers / Cookies compatibility shim

export function cookies() {
  return {
    get: (_name: string) => undefined,
    getAll: () => [],
    set: (_name: string, _value: string, _options?: any) => {},
    delete: (_name: string) => {},
    has: (_name: string) => false,
  };
}

export function headers() {
  return new Headers();
}
