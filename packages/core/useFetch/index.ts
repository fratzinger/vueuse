import type { EventHookOn, Fn, Stoppable } from '@vueuse/shared'
import type { ComputedRef, MaybeRefOrGetter, ShallowRef } from 'vue'
import { containsProp, createEventHook, toRef, until, useTimeoutFn } from '@vueuse/shared'
import { computed, isRef, readonly, shallowRef, toValue, watch } from 'vue'
import { defaultWindow } from '../_configurable'

export interface UseFetchReturn<T> {
  /**
   * Indicates if the fetch request has finished
   */
  isFinished: Readonly<ShallowRef<boolean>>

  /**
   * The statusCode of the HTTP fetch response
   */
  statusCode: ShallowRef<number | null>

  /**
   * The raw response of the fetch response
   */
  response: ShallowRef<Response | null>

  /**
   * Any fetch errors that may have occurred
   */
  error: ShallowRef<any>

  /**
   * The fetch response body on success, may either be JSON or text
   */
  data: ShallowRef<T | null>

  /**
   * Indicates if the request is currently being fetched.
   */
  isFetching: Readonly<ShallowRef<boolean>>

  /**
   * Indicates if the fetch request is able to be aborted
   */
  canAbort: ComputedRef<boolean>

  /**
   * Indicates if the fetch request was aborted
   */
  aborted: ShallowRef<boolean>

  /**
   * Abort the fetch request
   */
  abort: (reason?: any) => void

  /**
   * Manually call the fetch
   * (default not throwing error)
   */
  execute: (throwOnFailed?: boolean) => Promise<any>

  /**
   * Fires after the fetch request has finished
   */
  onFetchResponse: EventHookOn<Response>

  /**
   * Fires after a fetch request error
   */
  onFetchError: EventHookOn

  /**
   * Fires after a fetch has completed
   */
  onFetchFinally: EventHookOn

  // methods
  get: () => UseFetchReturn<T> & PromiseLike<UseFetchReturn<T>>
  post: (payload?: MaybeRefOrGetter<unknown>, type?: string) => UseFetchReturn<T> & PromiseLike<UseFetchReturn<T>>
  put: (payload?: MaybeRefOrGetter<unknown>, type?: string) => UseFetchReturn<T> & PromiseLike<UseFetchReturn<T>>
  delete: (payload?: MaybeRefOrGetter<unknown>, type?: string) => UseFetchReturn<T> & PromiseLike<UseFetchReturn<T>>
  patch: (payload?: MaybeRefOrGetter<unknown>, type?: string) => UseFetchReturn<T> & PromiseLike<UseFetchReturn<T>>
  head: (payload?: MaybeRefOrGetter<unknown>, type?: string) => UseFetchReturn<T> & PromiseLike<UseFetchReturn<T>>
  options: (payload?: MaybeRefOrGetter<unknown>, type?: string) => UseFetchReturn<T> & PromiseLike<UseFetchReturn<T>>

  // type
  json: <JSON = any>() => UseFetchReturn<JSON> & PromiseLike<UseFetchReturn<JSON>>
  text: () => UseFetchReturn<string> & PromiseLike<UseFetchReturn<string>>
  blob: () => UseFetchReturn<Blob> & PromiseLike<UseFetchReturn<Blob>>
  arrayBuffer: () => UseFetchReturn<ArrayBuffer> & PromiseLike<UseFetchReturn<ArrayBuffer>>
  formData: () => UseFetchReturn<FormData> & PromiseLike<UseFetchReturn<FormData>>
}

type DataType = 'text' | 'json' | 'blob' | 'arrayBuffer' | 'formData'
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'
type Combination = 'overwrite' | 'chain'

const payloadMapping: Record<string, string> = {
  json: 'application/json',
  text: 'text/plain',
}

export interface BeforeFetchContext {
  /**
   * The computed url of the current request
   */
  url: string

  /**
   * The request options of the current request
   */
  options: RequestInit

  /**
   * Cancels the current request
   */
  cancel: Fn
}

export interface AfterFetchContext<T = any> {
  response: Response

  data: T | null

  context: BeforeFetchContext

  execute: (throwOnFailed?: boolean) => Promise<any>
}

export interface OnFetchErrorContext<T = any, E = any> {
  error: E

  data: T | null

  response: Response | null

  context: BeforeFetchContext

  execute: (throwOnFailed?: boolean) => Promise<any>
}

export interface UseFetchOptions {
  /**
   * Fetch function
   */
  fetch?: typeof window.fetch

  /**
   * Will automatically run fetch when `useFetch` is used
   *
   * @default true
   */
  immediate?: boolean

  /**
   * Will automatically refetch when:
   * - the URL is changed if the URL is a ref
   * - the payload is changed if the payload is a ref
   *
   * @default false
   */
  refetch?: MaybeRefOrGetter<boolean>

  /**
   * Initial data before the request finished
   *
   * @default null
   */
  initialData?: any

  /**
   * Timeout for abort request after number of millisecond
   * `0` means use browser default
   *
   * @default 0
   */
  timeout?: number

  /**
   * Allow update the `data` ref when fetch error whenever provided, or mutated in the `onFetchError` callback
   *
   * @default false
   */
  updateDataOnError?: boolean

  /**
   * Will run immediately before the fetch request is dispatched
   */
  beforeFetch?: (ctx: BeforeFetchContext) => Promise<Partial<BeforeFetchContext> | void> | Partial<BeforeFetchContext> | void

  /**
   * Will run immediately after the fetch request is returned.
   * Runs after any 2xx response
   */
  afterFetch?: (ctx: AfterFetchContext) => Promise<Partial<AfterFetchContext>> | Partial<AfterFetchContext>

  /**
   * Will run immediately after the fetch request is returned.
   * Runs after any 4xx and 5xx response
   */
  onFetchError?: (ctx: OnFetchErrorContext) => Promise<Partial<OnFetchErrorContext>> | Partial<OnFetchErrorContext>
}

export interface CreateFetchOptions {
  /**
   * The base URL that will be prefixed to all urls unless urls are absolute
   */
  baseUrl?: MaybeRefOrGetter<string>

  /**
   * Determine the inherit behavior for beforeFetch, afterFetch, onFetchError
   * @default 'chain'
   */
  combination?: Combination

  /**
   * Default Options for the useFetch function
   */
  options?: UseFetchOptions

  /**
   * Options for the fetch request
   */
  fetchOptions?: RequestInit
}

/**
 * !!!IMPORTANT!!!
 *
 * If you update the UseFetchOptions interface, be sure to update this object
 * to include the new options
 */
function isFetchOptions(obj: object): obj is UseFetchOptions {
  return obj && containsProp(obj, 'immediate', 'refetch', 'initialData', 'timeout', 'beforeFetch', 'afterFetch', 'onFetchError', 'fetch', 'updateDataOnError')
}

const reAbsolute = /^(?:[a-z][a-z\d+\-.]*:)?\/\//i
// A URL is considered absolute if it begins with "<scheme>://" or "//" (protocol-relative URL).
function isAbsoluteURL(url: string) {
  return reAbsolute.test(url)
}

function headersToObject(headers: HeadersInit | undefined) {
  if (typeof Headers !== 'undefined' && headers instanceof Headers)
    return Object.fromEntries(headers.entries())
  return headers
}

function combineCallbacks<T = any>(combination: Combination, ...callbacks: (((ctx: T) => void | Partial<T> | Promise<void | Partial<T>>) | undefined)[]) {
  if (combination === 'overwrite') {
    // use last callback
    return async (ctx: T) => {
      let callback
      for (let i = callbacks.length - 1; i >= 0; i--) {
        if (callbacks[i] != null) {
          callback = callbacks[i]
          break
        }
      }
      if (callback)
        return { ...ctx, ...(await callback(ctx)) }

      return ctx
    }
  }
  else {
    // chaining and combine result
    return async (ctx: T) => {
      for (const callback of callbacks) {
        if (callback)
          ctx = { ...ctx, ...(await callback(ctx)) }
      }

      return ctx
    }
  }
}

export function createFetch(config: CreateFetchOptions = {}) {
  const _combination = config.combination || 'chain' as Combination
  const _options = config.options || {}
  const _fetchOptions = config.fetchOptions || {}

  function useFactoryFetch(url: MaybeRefOrGetter<string>, ...args: any[]) {
    const computedUrl = computed(() => {
      const baseUrl = toValue(config.baseUrl)
      const targetUrl = toValue(url)

      return (baseUrl && !isAbsoluteURL(targetUrl))
        ? joinPaths(baseUrl, targetUrl)
        : targetUrl
    })

    let options = _options
    let fetchOptions = _fetchOptions

    // Merge properties into a single object
    if (args.length > 0) {
      if (isFetchOptions(args[0])) {
        options = {
          ...options,
          ...args[0],
          beforeFetch: combineCallbacks(_combination, _options.beforeFetch, args[0].beforeFetch),
          afterFetch: combineCallbacks(_combination, _options.afterFetch, args[0].afterFetch),
          onFetchError: combineCallbacks(_combination, _options.onFetchError, args[0].onFetchError),
        }
      }
      else {
        fetchOptions = {
          ...fetchOptions,
          ...args[0],
          headers: {
            ...(headersToObject(fetchOptions.headers) || {}),
            ...(headersToObject(args[0].headers) || {}),
          },
        }
      }
    }

    if (args.length > 1 && isFetchOptions(args[1])) {
      options = {
        ...options,
        ...args[1],
        beforeFetch: combineCallbacks(_combination, _options.beforeFetch, args[1].beforeFetch),
        afterFetch: combineCallbacks(_combination, _options.afterFetch, args[1].afterFetch),
        onFetchError: combineCallbacks(_combination, _options.onFetchError, args[1].onFetchError),
      }
    }

    return useFetch(computedUrl, fetchOptions, options)
  }

  return useFactoryFetch as typeof useFetch
}

export function useFetch<T>(url: MaybeRefOrGetter<string>): UseFetchReturn<T> & PromiseLike<UseFetchReturn<T>>
export function useFetch<T>(url: MaybeRefOrGetter<string>, useFetchOptions: UseFetchOptions): UseFetchReturn<T> & PromiseLike<UseFetchReturn<T>>
export function useFetch<T>(url: MaybeRefOrGetter<string>, options: RequestInit, useFetchOptions?: UseFetchOptions): UseFetchReturn<T> & PromiseLike<UseFetchReturn<T>>

export function useFetch<T>(url: MaybeRefOrGetter<string>, ...args: any[]): UseFetchReturn<T> & PromiseLike<UseFetchReturn<T>> {
  const supportsAbort = typeof AbortController === 'function'

  let fetchOptions: RequestInit = {}
  let options: UseFetchOptions = {
    immediate: true,
    refetch: false,
    timeout: 0,
    updateDataOnError: false,
  }

  interface InternalConfig {
    method: HttpMethod
    type: DataType
    payload: unknown
    payloadType?: string
  }

  const config: InternalConfig = {
    method: 'GET',
    type: 'text' as DataType,
    payload: undefined as unknown,
  }

  if (args.length > 0) {
    if (isFetchOptions(args[0]))
      options = { ...options, ...args[0] }
    else
      fetchOptions = args[0]
  }

  if (args.length > 1) {
    if (isFetchOptions(args[1]))
      options = { ...options, ...args[1] }
  }

  const {
    fetch = defaultWindow?.fetch ?? globalThis?.fetch,
    initialData,
    timeout,
  } = options

  // Event Hooks
  const responseEvent = createEventHook<Response>()
  const errorEvent = createEventHook<any>()
  const finallyEvent = createEventHook<any>()

  const isFinished = shallowRef(false)
  const isFetching = shallowRef(false)
  const aborted = shallowRef(false)
  const statusCode = shallowRef<number | null>(null)
  const response = shallowRef<Response | null>(null)
  const error = shallowRef<any>(null)
  const data = shallowRef<T | null>(initialData || null)

  const canAbort = computed(() => supportsAbort && isFetching.value)

  let controller: AbortController | undefined
  let timer: Stoppable | undefined

  const abort = (reason?: any) => {
    if (supportsAbort) {
      controller?.abort(reason)
      controller = new AbortController()
      controller.signal.onabort = () => aborted.value = true
      fetchOptions = {
        ...fetchOptions,
        signal: controller.signal,
      }
    }
  }

  const loading = (isLoading: boolean) => {
    isFetching.value = isLoading
    isFinished.value = !isLoading
  }

  if (timeout)
    timer = useTimeoutFn(abort, timeout, { immediate: false })

  let executeCounter = 0

  const execute = async (throwOnFailed = false) => {
    abort()

    loading(true)
    error.value = null
    statusCode.value = null
    aborted.value = false

    executeCounter += 1
    const currentExecuteCounter = executeCounter

    const defaultFetchOptions: RequestInit = {
      method: config.method,
      headers: {},
    }

    const payload = toValue(config.payload)
    if (payload) {
      const headers = headersToObject(defaultFetchOptions.headers) as Record<string, string>
      // Set the payload to json type only if it's not provided and a literal object or array is provided and the object is not `formData`
      // The only case we can deduce the content type and `fetch` can't
      const proto = Object.getPrototypeOf(payload)
      if (!config.payloadType && payload && (proto === Object.prototype || Array.isArray(proto)) && !(payload instanceof FormData))
        config.payloadType = 'json'

      if (config.payloadType)
        headers['Content-Type'] = payloadMapping[config.payloadType] ?? config.payloadType

      defaultFetchOptions.body = config.payloadType === 'json'
        ? JSON.stringify(payload)
        : payload as BodyInit
    }

    let isCanceled = false
    const context: BeforeFetchContext = {
      url: toValue(url),
      options: {
        ...defaultFetchOptions,
        ...fetchOptions,
      },
      cancel: () => { isCanceled = true },
    }

    if (options.beforeFetch)
      Object.assign(context, await options.beforeFetch(context))

    if (isCanceled || !fetch) {
      loading(false)
      return Promise.resolve(null)
    }

    let responseData: any = null

    if (timer)
      timer.start()

    return fetch(
      context.url,
      {
        ...defaultFetchOptions,
        ...context.options,
        headers: {
          ...headersToObject(defaultFetchOptions.headers),
          ...headersToObject(context.options?.headers),
        },
      },
    )
      .then(async (fetchResponse) => {
        response.value = fetchResponse
        statusCode.value = fetchResponse.status

        responseData = await fetchResponse.clone()[config.type]()

        // see: https://www.tjvantoll.com/2015/09/13/fetch-and-errors/
        if (!fetchResponse.ok) {
          data.value = initialData || null
          throw new Error(fetchResponse.statusText)
        }

        if (options.afterFetch) {
          ({ data: responseData } = await options.afterFetch({
            data: responseData,
            response: fetchResponse,
            context,
            execute,
          }))
        }
        data.value = responseData

        responseEvent.trigger(fetchResponse)
        return fetchResponse
      })
      .catch(async (fetchError) => {
        let errorData = fetchError.message || fetchError.name

        if (options.onFetchError) {
          ({ error: errorData, data: responseData } = await options.onFetchError({
            data: responseData,
            error: fetchError,
            response: response.value,
            context,
            execute,
          }))
        }

        error.value = errorData
        if (options.updateDataOnError)
          data.value = responseData

        errorEvent.trigger(fetchError)
        if (throwOnFailed)
          throw fetchError
        return null
      })
      .finally(() => {
        if (currentExecuteCounter === executeCounter)
          loading(false)
        if (timer)
          timer.stop()
        finallyEvent.trigger(null)
      })
  }

  const refetch = toRef(options.refetch)
  watch(
    [
      refetch,
      toRef(url),
    ],
    ([refetch]) => refetch && execute(),
    { deep: true },
  )

  const shell: UseFetchReturn<T> = {
    isFinished: readonly(isFinished),
    isFetching: readonly(isFetching),
    statusCode,
    response,
    error,
    data,
    canAbort,
    aborted,
    abort,
    execute,

    onFetchResponse: responseEvent.on,
    onFetchError: errorEvent.on,
    onFetchFinally: finallyEvent.on,
    // method
    get: setMethod('GET'),
    put: setMethod('PUT'),
    post: setMethod('POST'),
    delete: setMethod('DELETE'),
    patch: setMethod('PATCH'),
    head: setMethod('HEAD'),
    options: setMethod('OPTIONS'),
    // type
    json: setType('json'),
    text: setType('text'),
    blob: setType('blob'),
    arrayBuffer: setType('arrayBuffer'),
    formData: setType('formData'),
  }

  function setMethod(method: HttpMethod) {
    return (payload?: unknown, payloadType?: string) => {
      if (!isFetching.value) {
        config.method = method
        config.payload = payload
        config.payloadType = payloadType

        // watch for payload changes
        if (isRef(config.payload)) {
          watch(
            [
              refetch,
              toRef(config.payload),
            ],
            ([refetch]) => refetch && execute(),
            { deep: true },
          )
        }

        return {
          ...shell,
          then(onFulfilled: any, onRejected: any) {
            return waitUntilFinished()
              .then(onFulfilled, onRejected)
          },
        } as any
      }
      return undefined
    }
  }

  function waitUntilFinished() {
    return new Promise<UseFetchReturn<T>>((resolve, reject) => {
      until(isFinished).toBe(true).then(() => resolve(shell)).catch(reject)
    })
  }

  function setType(type: DataType) {
    return () => {
      if (!isFetching.value) {
        config.type = type
        return {
          ...shell,
          then(onFulfilled: any, onRejected: any) {
            return waitUntilFinished()
              .then(onFulfilled, onRejected)
          },
        } as any
      }
      return undefined
    }
  }

  if (options.immediate)
    Promise.resolve().then(() => execute())

  return {
    ...shell,
    then(onFulfilled, onRejected) {
      return waitUntilFinished()
        .then(onFulfilled, onRejected)
    },
  }
}

function joinPaths(start: string, end: string): string {
  if (!start.endsWith('/') && !end.startsWith('/')) {
    return `${start}/${end}`
  }

  if (start.endsWith('/') && end.startsWith('/')) {
    return `${start.slice(0, -1)}${end}`
  }

  return `${start}${end}`
}
