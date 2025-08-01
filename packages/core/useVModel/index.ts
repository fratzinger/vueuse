import type { Ref, UnwrapRef, WritableComputedRef } from 'vue'
import type { CloneFn } from '../useCloned'
import { isDef } from '@vueuse/shared'
import { computed, ref as deepRef, getCurrentInstance, nextTick, watch } from 'vue'
import { cloneFnJSON } from '../useCloned'

export interface UseVModelOptions<T, Passive extends boolean = false> {
  /**
   * When passive is set to `true`, it will use `watch` to sync with props and ref.
   * Instead of relying on the `v-model` or `.sync` to work.
   *
   * @default false
   */
  passive?: Passive
  /**
   * When eventName is set, it's value will be used to overwrite the emit event name.
   *
   * @default undefined
   */
  eventName?: string
  /**
   * Attempting to check for changes of properties in a deeply nested object or array.
   * Apply only when `passive` option is set to `true`
   *
   * @default false
   */
  deep?: boolean
  /**
   * Defining default value for return ref when no value is passed.
   *
   * @default undefined
   */
  defaultValue?: T
  /**
   * Clone the props.
   * Accepts a custom clone function.
   * When setting to `true`, it will use `JSON.parse(JSON.stringify(value))` to clone.
   *
   * @default false
   */
  clone?: boolean | CloneFn<T>
  /**
   * The hook before triggering the emit event can be used for form validation.
   * if false is returned, the emit event will not be triggered.
   *
   * @default undefined
   */
  shouldEmit?: (v: T) => boolean
}

/**
 * Shorthand for v-model binding, props + emit -> ref
 *
 * @see https://vueuse.org/useVModel
 * @param props
 * @param key (default 'modelValue')
 * @param emit
 * @param options
 *
 * @__NO_SIDE_EFFECTS__
 */
export function useVModel<P extends object, K extends keyof P, Name extends string>(
  props: P,
  key?: K,
  emit?: (name: Name, ...args: any[]) => void,
  options?: UseVModelOptions<P[K], false>,
): WritableComputedRef<P[K]>
export function useVModel<P extends object, K extends keyof P, Name extends string>(
  props: P,
  key?: K,
  emit?: (name: Name, ...args: any[]) => void,
  options?: UseVModelOptions<P[K], true>,
): Ref<UnwrapRef<P[K]>>

/**
 * Shorthand for v-model binding, props + emit -> ref
 *
 * @see https://vueuse.org/useVModel
 * @param props
 * @param key (default 'modelValue')
 * @param emit
 * @param options
 *
 * @__NO_SIDE_EFFECTS__
 */
export function useVModel<P extends object, K extends keyof P, Name extends string, Passive extends boolean>(
  props: P,
  key?: K,
  emit?: (name: Name, ...args: any[]) => void,
  options: UseVModelOptions<P[K], Passive> = {},
) {
  const {
    clone = false,
    passive = false,
    eventName,
    deep = false,
    defaultValue,
    shouldEmit,
  } = options

  const vm = getCurrentInstance()
  // @ts-expect-error mis-alignment with @vue/composition-api
  const _emit = emit || vm?.emit || vm?.$emit?.bind(vm) || vm?.proxy?.$emit?.bind(vm?.proxy)
  let event: string | undefined = eventName

  if (!key) {
    key = 'modelValue' as K
  }

  event = event || `update:${key!.toString()}`

  const cloneFn = (val: P[K]) => !clone
    ? val
    : typeof clone === 'function'
      ? clone(val)
      : cloneFnJSON(val)

  const getValue = () => isDef(props[key!])
    ? cloneFn(props[key!])
    : defaultValue

  const triggerEmit = (value: P[K]) => {
    if (shouldEmit) {
      if (shouldEmit(value))
        _emit(event, value)
    }
    else {
      _emit(event, value)
    }
  }

  if (passive) {
    const initialValue = getValue()
    const proxy = deepRef<P[K]>(initialValue!)
    let isUpdating = false

    watch(
      () => props[key!],
      (v) => {
        if (!isUpdating) {
          isUpdating = true
          ;(proxy as any).value = cloneFn(v) as UnwrapRef<P[K]>
          nextTick(() => isUpdating = false)
        }
      },
    )

    watch(
      proxy,
      (v) => {
        if (!isUpdating && (v !== props[key!] || deep))
          triggerEmit(v as P[K])
      },
      { deep },
    )

    return proxy
  }
  else {
    return computed<P[K]>({
      get() {
        return getValue()!
      },
      set(value) {
        triggerEmit(value)
      },
    })
  }
}
