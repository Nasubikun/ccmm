/**
 * 関数プログラミング用のResult型とヘルパー関数
 * エラーハンドリングを型安全かつ関数的に処理
 */

export type Result<T, E = Error> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: E };

// Result型のコンストラクタ
export const Ok = <T>(data: T): Result<T, never> => ({ success: true, data });
export const Err = <E>(error: E): Result<never, E> => ({
  success: false,
  error,
});

// Result型のヘルパー関数
export const map =
  <T, U, E>(fn: (value: T) => U) =>
  (result: Result<T, E>): Result<U, E> =>
    result.success ? Ok(fn(result.data)) : result;

export const flatMap =
  <T, U, E>(fn: (value: T) => Result<U, E>) =>
  (result: Result<T, E>): Result<U, E> =>
    result.success ? fn(result.data) : result;

export const mapError =
  <T, E, F>(fn: (error: E) => F) =>
  (result: Result<T, E>): Result<T, F> =>
    result.success ? result : Err(fn(result.error));

export const getOrElse =
  <T>(defaultValue: T) =>
  (result: Result<T, unknown>): T =>
    result.success ? result.data : defaultValue;

export const fold =
  <T, E, R>(onSuccess: (data: T) => R, onError: (error: E) => R) =>
  (result: Result<T, E>): R =>
    result.success ? onSuccess(result.data) : onError(result.error);

// 複数のResultを合成（すべて成功の場合のみ成功）
// 注：現在未使用のため、必要に応じて実装
// export const combine = ...

// 安全な関数実行
export const tryCatch = <T>(fn: () => T): Result<T, Error> => {
  try {
    return Ok(fn());
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
};
