// 필수 UI 필드를 검증한다. 응답 값을 변환하거나 기본값으로 채우지 않는다.
export type Schema<T> = (value: unknown, path?: string) => T;
export type Infer<S> = S extends Schema<infer T> ? T : never;
export class ContractError extends Error {
  constructor(path: string) {
    super(`명세 불일치: ${path} 형식을 확인하세요.`);
  }
}
export const objectValue = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
export const str: Schema<string> = (v, p = '$') => {
  if (typeof v !== 'string') throw new ContractError(p);
  return v;
};
export const num: Schema<number> = (v, p = '$') => {
  if (typeof v !== 'number' || !Number.isSafeInteger(v)) throw new ContractError(p);
  return v;
};
export const real: Schema<number> = (v, p = '$') => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new ContractError(p);
  return v;
};
export const bool: Schema<boolean> = (v, p = '$') => {
  if (typeof v !== 'boolean') throw new ContractError(p);
  return v;
};
export const unknownObject: Schema<Record<string, unknown>> = (v, p = '$') => {
  if (!objectValue(v)) throw new ContractError(p);
  return v;
};
export function enumeration<const T extends readonly string[]>(...values: T): Schema<T[number]> {
  return (v, p = '$') => {
    if (typeof v !== 'string' || !values.includes(v)) throw new ContractError(p);
    return v as T[number];
  };
}
export function nullable<T>(schema: Schema<T>): Schema<T | null> {
  return (v, p) => (v === null ? null : schema(v, p));
}
export function optional<T>(schema: Schema<T>): Schema<T | undefined> {
  return (v, p) => (v === undefined ? undefined : schema(v, p));
}
export function array<T>(schema: Schema<T>): Schema<T[]> {
  return (v, p = '$') => {
    if (!Array.isArray(v)) throw new ContractError(p);
    v.forEach((x, i) => schema(x, `${p}[${i}]`));
    return v as T[];
  };
}
export function object<S extends Record<string, Schema<unknown>>>(
  shape: S,
): Schema<{ [K in keyof S]: Infer<S[K]> }> {
  return (v, p = '$') => {
    if (!objectValue(v)) throw new ContractError(p);
    for (const [key, schema] of Object.entries(shape)) schema(v[key], `${p}.${key}`);
    return v as { [K in keyof S]: Infer<S[K]> };
  };
}
